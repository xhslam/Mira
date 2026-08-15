import { describe, expect, test } from "vitest";

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
});
