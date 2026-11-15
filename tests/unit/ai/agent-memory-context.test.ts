import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { createMemoryStore, type MemoryEntry } from "../../../src/ai/memory-store";
import { createMemoryRuntime } from "../../../src/ai/memory-runtime";
import { resolveConversationContext } from "../../../src/ai/conversation-context";
import { createSqliteAiStore } from "../../../src/ai/sqlite-ai-store";
import { createAiConversationService } from "../../../src/ai/conversation-service";
import { parseRichText, richListItemContent, safeRichTextUrl } from "../../../src/ai/rich-text";
import type { SearchDatabase } from "../../../src/search/sqlite-search-index";
import type { WorkspaceId } from "../../../src/domain/identifiers";
import type { AiConversationId, AiMessageId } from "../../../src/ai/conversation";
import type { AiProviderProfile } from "../../../src/ai/provider-profile";
import type { AiProviderRequest } from "../../../src/ai/provider";

const workspace = randomUUID() as WorkspaceId;
const otherWorkspace = randomUUID() as WorkspaceId;
const chatId = randomUUID() as AiConversationId;
const messageId = randomUUID() as AiMessageId;
const now = "2026-11-07T00:00:00.000Z";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  const db: SearchDatabase = {
    execAsync: async (sql) => {
      sqlite.exec(sql);
    },
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...(params as SQLInputValue[])),
    getAllAsync: async <T>(sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: SQLInputValue[]) =>
      (sqlite.prepare(sql).get(...params) as T | undefined) ?? null,
    withExclusiveTransactionAsync: async (task) => {
      sqlite.exec("BEGIN");
      try {
        await task(db);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}
function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: randomUUID(),
    workspaceId: workspace,
    title: "写作偏好",
    category: "preferences",
    content: "请使用中文",
    enabled: true,
    source: null,
    updatedAt: now,
    ...overrides,
  };
}
async function contextFixture() {
  const { db, sqlite } = database();
  const store = createSqliteAiStore(db);
  await store.upsertConversation({
    id: chatId,
    workspaceId: workspace,
    title: "项目讨论",
    providerProfileId: null,
    createdAt: now,
    updatedAt: now,
  });
  await store.upsertMessage({
    id: messageId,
    conversationId: chatId,
    role: "user",
    content: "发布日在周五",
    status: "completed",
    createdAt: now,
  });
  return { db, sqlite, store };
}
describe("workspace memory and conversation context", () => {
  test("persists editable immutable memory and isolates workspace policies and deletion", async () => {
    const { db } = database();
    const store = createMemoryStore(db);
    const original = entry();
    await store.save(original);
    const reopened = createMemoryStore(db);
    expect(await reopened.list(workspace)).toEqual([original]);
    expect(Object.isFrozen((await reopened.list(workspace))[0])).toBe(true);
    expect(await reopened.list(otherWorkspace)).toEqual([]);
    await reopened.remove(otherWorkspace, original.id);
    expect(await reopened.list(workspace)).toHaveLength(1);
    await reopened.setEnabled(workspace, false);
    expect(await reopened.isEnabled(workspace)).toBe(false);
    expect(await reopened.isEnabled(otherWorkspace)).toBe(true);
    await reopened.save({ ...original, content: "简洁中文", enabled: false });
    expect((await reopened.list(workspace))[0]?.content).toBe("简洁中文");
    await reopened.remove(workspace, original.id);
    expect(await reopened.list(workspace)).toEqual([]);
  });
  test("rejects malformed memory and surfaces corrupted records without resetting them", async () => {
    const { db } = database();
    const store = createMemoryStore(db);
    await expect(store.save(entry({ content: " " }))).rejects.toThrow();
    await store.list(workspace);
    await db.runAsync(
      "INSERT INTO ai_memories VALUES (?, ?, ?)",
      workspace,
      randomUUID(),
      "broken",
    );
    await expect(store.list(workspace)).rejects.toThrow();
    expect(await db.getAllAsync("SELECT * FROM ai_memories")).toHaveLength(1);
  });
  test("injects profile/preferences and only lists topic metadata; disabled entries are absent", async () => {
    const { db } = database();
    const store = createMemoryStore(db);
    await store.save(entry());
    await store.save(entry({ title: "论文", category: "topic", content: "topic-secret" }));
    await store.save(entry({ title: "停用", enabled: false, content: "disabled-secret" }));
    const runtime = await createMemoryRuntime({
      store,
      workspaceId: workspace,
      prompt: "继续论文",
      conversationId: chatId,
      messageId,
      createId: randomUUID,
      now: () => new Date(now),
    });
    const data = JSON.stringify(runtime.context);
    expect(data).toContain("请使用中文");
    expect(data).toContain("论文");
    expect(data).not.toContain("topic-secret");
    expect(data).not.toContain("disabled-secret");
    expect(runtime.tools.definitions.map((item) => item.name)).toEqual(["memory_read"]);
  });
  test("requires explicit remembering and exact user evidence; never writes invented facts", async () => {
    const { db } = database();
    const store = createMemoryStore(db);
    const options = {
      store,
      workspaceId: workspace,
      prompt: "记住：我喜欢简短回答",
      conversationId: chatId,
      messageId,
      createId: randomUUID,
      now: () => new Date(now),
    };
    const runtime = await createMemoryRuntime(options);
    const call = (evidence: string) => ({
      id: randomUUID(),
      name: "memory_save",
      argumentsJson: JSON.stringify({ title: "偏好", category: "preferences", evidence }),
    });
    expect((await runtime.tools.execute(call("用户喜欢长回答"))).ok).toBe(false);
    expect((await runtime.tools.execute(call("我喜欢简短回答"))).ok).toBe(true);
    const saved = (await store.list(workspace))[0];
    expect(saved?.source).toEqual({ conversationId: chatId, messageId, quote: "我喜欢简短回答" });
    const normal = await createMemoryRuntime({ ...options, prompt: "今天天气怎样" });
    expect((await normal.tools.execute(call("今天天气怎样"))).ok).toBe(false);
    const denied = await createMemoryRuntime({ ...options, prompt: "不要记住下面的内容" });
    expect(denied.tools.definitions.some((tool) => tool.name === "memory_save")).toBe(false);
    await store.setEnabled(workspace, false);
    expect((await runtime.tools.execute(call("我喜欢简短回答"))).ok).toBe(false);
  });
  test("rechecks deletes and disablement before topic reads", async () => {
    const { db } = database();
    const store = createMemoryStore(db);
    const topic = entry({ category: "topic" });
    await store.save(topic);
    const runtime = await createMemoryRuntime({
      store,
      workspaceId: workspace,
      prompt: "论文",
      conversationId: chatId,
      messageId,
      createId: randomUUID,
      now: () => new Date(now),
    });
    const call = {
      id: randomUUID(),
      name: "memory_read",
      argumentsJson: JSON.stringify({ id: topic.id }),
    };
    expect((await runtime.tools.execute(call)).ok).toBe(true);
    await store.remove(workspace, topic.id);
    expect((await runtime.tools.execute(call)).ok).toBe(false);
  });
  test("resolves selected completed messages, rejects cross-workspace, missing, self and oversized references", async () => {
    const { store } = await contextFixture();
    await store.upsertMessage({
      id: randomUUID() as AiMessageId,
      conversationId: chatId,
      role: "assistant",
      content: "failed draft",
      status: "incomplete",
      createdAt: now,
    });
    const selected = await resolveConversationContext(store, workspace, [chatId, chatId]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.content).toBe("user: 发布日在周五");
    await expect(resolveConversationContext(store, otherWorkspace, [chatId])).rejects.toThrow();
    await expect(resolveConversationContext(store, workspace, [chatId], chatId)).rejects.toThrow();
    await expect(
      resolveConversationContext(store, workspace, [randomUUID() as AiConversationId]),
    ).rejects.toThrow();
    await expect(
      resolveConversationContext(
        store,
        workspace,
        Array.from({ length: 6 }, () => randomUUID() as AiConversationId),
      ),
    ).rejects.toThrow();
    await store.upsertMessage({
      id: messageId,
      conversationId: chatId,
      role: "user",
      content: "x".repeat(60001),
      status: "completed",
      createdAt: now,
    });
    await expect(resolveConversationContext(store, workspace, [chatId])).rejects.toThrow("过长");
  });
  test("migrates old message data and persists reference provenance across reopen", async () => {
    const { db, sqlite, store } = await contextFixture();
    await store.upsertMessage({
      id: messageId,
      conversationId: chatId,
      role: "user",
      content: "继续",
      references: [{ id: randomUUID(), title: "历史项目" }],
      status: "completed",
      createdAt: now,
    });
    expect((await createSqliteAiStore(db).listMessages(chatId))[0]?.references?.[0]?.title).toBe(
      "历史项目",
    );
    const legacy = database();
    legacy.sqlite.exec(
      "CREATE TABLE ai_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL)",
    );
    legacy.sqlite
      .prepare("INSERT INTO ai_messages VALUES (?, ?, 'user', '旧记录', 'completed', ?)")
      .run(messageId, chatId, Date.parse(now));
    const migrated = createSqliteAiStore(legacy.db);
    expect((await migrated.listMessages(chatId))[0]?.content).toBe("旧记录");
    expect((await migrated.listMessages(chatId))[0]?.references).toEqual([]);
    sqlite.close();
    legacy.sqlite.close();
  });
  test("sends actual selected transcripts and memory to provider; incognito omits memory", async () => {
    const { db, store } = await contextFixture();
    const memory = createMemoryStore(db);
    await memory.save(entry());
    const profile = {
      id: randomUUID(),
      name: "Test",
      adapter: "openai-compatible-chat",
      baseUrl: "https://example.com",
      model: "test",
      connectionStatus: "untested",
      lastTestedAt: null,
      createdAt: now,
      updatedAt: now,
    } as AiProviderProfile;
    await store.upsertProviderProfile(profile);
    const requests: AiProviderRequest[] = [];
    const service = createAiConversationService({
      store,
      memory,
      secrets: {
        available: async () => true,
        get: async () => "test-key",
        set: async () => undefined,
        remove: async () => undefined,
      },
      providers: {
        get: () => ({
          stream: async function* ({ request }) {
            requests.push(request);
            if (request.messages.at(-1)?.content === "记住：我喜欢短句") {
              yield {
                type: "tool-call",
                id: randomUUID(),
                name: "memory_save",
                argumentsJson: JSON.stringify({
                  title: "短句偏好",
                  category: "preferences",
                  evidence: "我喜欢短句",
                }),
              };
            } else yield { type: "text-delta", text: "周五发布" };
            yield { type: "completed" };
          },
        }),
      },
      createId: randomUUID,
      now: () => new Date(now),
    });
    let newId: AiConversationId | undefined;
    for await (const event of service.stream({
      workspaceId: workspace,
      providerProfileId: profile.id,
      prompt: "何时发布？",
      referenceIds: [chatId],
    }))
      if (event.type === "started") newId = event.conversation.id;
    expect(JSON.stringify(requests[0])).toContain("发布日在周五");
    expect(JSON.stringify(requests[0])).toContain("请使用中文");
    expect((await store.listMessages(newId!))[0]?.references?.[0]?.id).toBe(chatId);
    for await (const event of service.stream({
      workspaceId: workspace,
      providerProfileId: profile.id,
      prompt: "你好",
      useMemory: false,
    }))
      void event;
    expect(JSON.stringify(requests[1])).not.toContain("请使用中文");
    for await (const event of service.stream({
      workspaceId: workspace,
      providerProfileId: profile.id,
      prompt: "记住：我喜欢短句",
    }))
      void event;
    expect(
      (await memory.list(workspace)).find((item) => item.title === "短句偏好")?.source?.quote,
    ).toBe("我喜欢短句");
    expect(
      requests
        .at(-1)
        ?.messages.some(
          (message) => message.role === "tool" && message.content.includes('"saved":true'),
        ),
    ).toBe(true);
    expect(
      (await store.listToolAudit(workspace)).some(
        (record) => record.toolName === "memory_save" && record.resultCode === "ok",
      ),
    ).toBe(true);
    await expect(async () => {
      for await (const event of service.stream({
        workspaceId: otherWorkspace,
        providerProfileId: profile.id,
        prompt: "越界",
        conversationId: chatId,
      }))
        void event;
    }).rejects.toThrow("工作区");
  });
});

describe("native rich text", () => {
  test("parses nested formatting, tables, task lists, quotes, links and streamed code", () => {
    const tokens = parseRichText(
      "# 标题\n\n| 名称 | 内容 |\n| --- | --- |\n| A | **重点** |\n\n> 引用\n\n1. 条目\n\n- [x] 完成\n\n[链接](https://example.com)\n\n```ts\nconst x = 1;",
    );
    expect(tokens.map((item) => item.type)).toEqual(
      expect.arrayContaining(["heading", "table", "blockquote", "list", "paragraph", "code"]),
    );
    expect(tokens.at(-1)).toMatchObject({ type: "code", text: "const x = 1;" });
    const taskList = parseRichText("- [x] Completed item").find((token) => token.type === "list");
    if (taskList?.type !== "list") throw new Error("Expected task list");
    const task = taskList.items[0];
    if (!task) throw new Error("Expected task");
    expect(task.checked).toBe(true);
    expect(
      richListItemContent(task)
        .map((token) => token.raw)
        .join(""),
    ).toBe("Completed item");
  });
  test("only opens web and email links, never script, data, file or custom app URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/test",
      "intent://test",
      "/relative",
    ])
      expect(safeRichTextUrl(url)).toBeNull();
    expect(safeRichTextUrl("https://example.com")).toBe("https://example.com/");
    expect(safeRichTextUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });
});
