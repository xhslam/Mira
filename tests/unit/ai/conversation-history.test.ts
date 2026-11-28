import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createConversationMemoryDraft } from "../../../src/ai/conversation-memory";
import { createSqliteAiStore } from "../../../src/ai/sqlite-ai-store";
import { createMemoryStore } from "../../../src/ai/memory-store";
import type {
  AiConversation,
  AiConversationId,
  AiConversationMessage,
  AiMessageId,
} from "../../../src/ai/conversation";
import type { WorkspaceId } from "../../../src/domain/identifiers";
import type { SearchDatabase } from "../../../src/search/sqlite-search-index";

const workspace = randomUUID() as WorkspaceId;
const otherWorkspace = randomUUID() as WorkspaceId;
const now = "2026-11-28T01:00:00.000Z";
const chat = (overrides: Partial<AiConversation> = {}): AiConversation => ({
  id: randomUUID() as AiConversationId,
  workspaceId: workspace,
  title: "周末安排",
  providerProfileId: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
const message = (
  conversationId: AiConversationId,
  overrides: Partial<AiConversationMessage> = {},
): AiConversationMessage => ({
  id: randomUUID() as AiMessageId,
  conversationId,
  role: "user",
  content: "周六买咖啡",
  status: "completed",
  createdAt: now,
  ...overrides,
});

async function withSqlite(test: (db: SearchDatabase, sqlite: DatabaseSync) => Promise<void>) {
  const sqlite = new DatabaseSync(":memory:");
  const db = {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    runAsync: async (sql: string, ...args: SQLInputValue[]) => sqlite.prepare(sql).run(...args),
    getAllAsync: async <T>(sql: string, ...args: SQLInputValue[]) =>
      sqlite.prepare(sql).all(...args) as T[],
    getFirstAsync: async <T>(sql: string, ...args: SQLInputValue[]) =>
      (sqlite.prepare(sql).get(...args) as T | undefined) ?? null,
    withExclusiveTransactionAsync: async (task: (tx: SearchDatabase) => Promise<void>) => {
      sqlite.exec("BEGIN");
      try {
        await task(db);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } satisfies SearchDatabase;
  try {
    await test(db, sqlite);
  } finally {
    sqlite.close();
  }
}

describe("persisted history actions", () => {
  it("keeps legacy chats, persists pinning, and preserves the ordering of the reference picker", async () => {
    await withSqlite(async (db, sqlite) => {
      sqlite.exec(`CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
        title TEXT NOT NULL, provider_profile_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
      const older = chat();
      const newer = chat({ updatedAt: "2026-11-28T02:00:00.000Z" });
      sqlite
        .prepare("INSERT INTO ai_conversations VALUES (?, ?, ?, NULL, ?, ?)")
        .run(older.id, workspace, older.title, Date.parse(now), Date.parse(now));
      const store = createSqliteAiStore(db);
      await store.upsertConversation(newer);
      expect((await store.listConversations(workspace, "history")).map(({ id }) => id)).toEqual([
        newer.id,
        older.id,
      ]);
      await store.setConversationPinned(otherWorkspace, older.id, true);
      expect((await store.listConversations(workspace, "history"))[0]?.id).toBe(newer.id);
      await store.setConversationPinned(workspace, older.id, true);
      await store.upsertConversation({ ...older, title: "改过标题" }, "existing");
      const reopened = createSqliteAiStore(db);
      expect((await reopened.listConversations(workspace))[0]?.id).toBe(newer.id);
      expect((await reopened.listConversations(workspace, "history"))[0]).toMatchObject({
        id: older.id,
        pinned: true,
        title: "改过标题",
        updatedAt: now,
      });
      await reopened.setConversationPinned(workspace, older.id, false);
      expect((await reopened.listConversations(workspace, "history"))[0]?.id).toBe(newer.id);
    });
  });

  it("deletes only the selected workspace's chat and messages, without purging saved memory or allowing late writes to resurrect history", async () => {
    await withSqlite(async (db) => {
      const store = createSqliteAiStore(db);
      const memories = createMemoryStore(db);
      const target = chat();
      const other = chat({ workspaceId: otherWorkspace });
      const original = message(target.id);
      for (const item of [target, other]) await store.upsertConversation(item);
      await store.upsertMessage(original);
      await store.upsertMessage(message(other.id));
      const draft = createConversationMemoryDraft(target, [original], randomUUID(), now);
      expect(await memories.list(workspace)).toEqual([]);
      await memories.save(draft.entry);
      await store.removeConversation(otherWorkspace, target.id);
      expect(await store.listMessages(target.id)).toEqual([
        expect.objectContaining({ id: original.id }),
      ]);
      await store.removeConversation(workspace, target.id);
      await expect(store.upsertConversation(target, "existing")).rejects.toThrow();
      await store.upsertMessage(message(target.id, { role: "assistant", content: "晚到的回复" }));
      expect(await store.listConversations(workspace, "history")).toEqual([]);
      expect(await store.listMessages(target.id)).toEqual([]);
      expect(await store.listMessages(other.id)).toHaveLength(1);
      expect(await memories.list(workspace)).toEqual([draft.entry]);
      expect(await memories.list(otherWorkspace)).toEqual([]);
    });
  });

  it("drafts completed text with exact provenance and marks overlong excerpts", () => {
    const target = chat();
    const original = message(target.id);
    const reply = message(target.id, { role: "assistant", content: "好的" });
    const failed = message(target.id, {
      role: "assistant",
      status: "incomplete",
      content: "出错了",
    });
    const foreign = message(chat().id);
    const result = createConversationMemoryDraft(
      target,
      [original, failed, foreign, reply],
      randomUUID(),
      now,
    );
    expect(result.partial).toBe(false);
    expect(result.entry).toMatchObject({
      content: "你：周六买咖啡\n\nMira：好的",
      category: "topic",
      workspaceId: workspace,
      source: { conversationId: target.id, messageId: original.id, quote: original.content },
    });
    const long = message(target.id, { content: "x".repeat(7997) + "😀" });
    const trimmed = createConversationMemoryDraft(target, [long], randomUUID(), now);
    expect(trimmed.partial).toBe(true);
    expect(trimmed.entry.content.length).toBeLessThanOrEqual(8000);
    expect(trimmed.entry.content).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(() => createConversationMemoryDraft(target, [failed], randomUUID(), now)).toThrow(
      "暂无已完成的消息",
    );
  });
});
