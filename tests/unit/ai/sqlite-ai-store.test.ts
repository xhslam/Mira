import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, test } from "vitest";

import type { AiConversationId, AiMessageId } from "../../../src/ai/conversation";
import type { WorkspaceId } from "../../../src/domain/identifiers";
import type { AiProviderProfile } from "../../../src/ai/provider-profile";
import { AI_STATE_MIGRATION, createSqliteAiStore } from "../../../src/ai/sqlite-ai-store";
import type { SearchDatabase } from "../../../src/search/sqlite-search-index";

const PROFILE = Object.freeze({
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "DeepSeek",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
  connectionStatus: "untested",
  lastTestedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}) as AiProviderProfile;

describe("SQLite AI store", () => {
  test("creates provider, conversation, proposal, automation, and audit boundaries", () => {
    for (const table of [
      "ai_provider_profiles",
      "ai_conversations",
      "ai_messages",
      "ai_tool_audit",
      "ai_proposals",
      "ai_proposal_segments",
      "ai_automations",
      "ai_executions",
      "ai_prompt_history",
    ]) {
      expect(AI_STATE_MIGRATION).toContain(table);
    }
    expect(AI_STATE_MIGRATION.toLowerCase()).not.toContain("api_key");
  });

  test("parameterizes profiles and never accepts an API key", async () => {
    const calls: unknown[][] = [];
    const database = {
      execAsync: async () => undefined,
      runAsync: async (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      withExclusiveTransactionAsync: async (task: (transaction: SearchDatabase) => Promise<void>) =>
        task(database as SearchDatabase),
    } as unknown as SearchDatabase;
    const store = createSqliteAiStore(database);
    await store.upsertProviderProfile(PROFILE);

    const serializedCalls = JSON.stringify(calls);
    expect(serializedCalls).toContain("DeepSeek");
    expect(serializedCalls).not.toContain("sk-private");
    expect(calls.some(([sql]) => String(sql).includes("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"))).toBe(
      true,
    );
  });

  test("pauses dependent tasks before removing a profile", async () => {
    const calls: string[] = [];
    const database = {
      execAsync: async () => undefined,
      runAsync: async (source: string) => {
        calls.push(source);
        return {};
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      withExclusiveTransactionAsync: async (task: (transaction: SearchDatabase) => Promise<void>) =>
        task(database as SearchDatabase),
    } as unknown as SearchDatabase;
    const store = createSqliteAiStore(database);
    await store.removeProviderProfile(PROFILE.id);
    expect(calls[0]).toContain("UPDATE ai_automations SET enabled = 0");
    expect(calls[1]).toContain("DELETE FROM ai_provider_profiles");
  });

  test("previews the newest non-empty local message for each conversation in the requested workspace", async () => {
    const database = new DatabaseSync(":memory:");
    try {
      const adapter = {
        execAsync: async (sql: string) => database.exec(sql),
        getAllAsync: async (sql: string, ...params: SQLInputValue[]) =>
          database.prepare(sql).all(...params),
        runAsync: async (sql: string, ...params: SQLInputValue[]) =>
          database.prepare(sql).run(...params),
      } as unknown as SearchDatabase;
      const store = createSqliteAiStore(adapter);
      const workspace = "d41c47d0-95d2-419b-9586-fade29d2bafd" as WorkspaceId;
      const anotherWorkspace = "6b9c034b-4013-4933-abd8-5d9b76404f2d" as WorkspaceId;
      const first = "ff74cc35-7699-4112-a00d-8f1af7cb515c" as AiConversationId;
      const empty = "ea4b2ded-bce8-4c42-b7ac-9be6c4f2dbb4" as AiConversationId;
      const other = "ce88c86a-aadf-4ac0-95bd-843209ed8d8c" as AiConversationId;
      for (const [id, workspaceId, title] of [
        [first, workspace, "First"],
        [empty, workspace, "Empty"],
        [other, anotherWorkspace, "Other"],
      ] as const) {
        await store.upsertConversation({
          id,
          workspaceId,
          title,
          providerProfileId: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        });
      }
      for (const [conversationId, content] of [
        [first, "Older message"],
        [first, "Latest reply " + "x".repeat(280)],
        [first, "  "],
        [other, "Different workspace"],
      ] as const) {
        await store.upsertMessage({
          id: randomUUID() as AiMessageId,
          conversationId,
          role: "assistant",
          content,
          status: "completed",
          createdAt: "2026-08-01T00:00:01.000Z",
        });
      }

      const entries = await store.listConversations(workspace);
      expect(entries.map(({ title }) => title)).toEqual(["Empty", "First"]);
      expect(entries[0]?.preview).toBeUndefined();
      expect(entries[1]?.preview).toHaveLength(240);
      expect(entries[1]?.preview).toMatch(/^Latest reply /);
    } finally {
      database.close();
    }
  });
});
