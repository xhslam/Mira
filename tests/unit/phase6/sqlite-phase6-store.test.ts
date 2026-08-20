import { describe, expect, test } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import {
  PHASE6_STATE_MIGRATION,
  createSqlitePhase6Store,
} from "../../../src/phase6/sqlite-phase6-store";
import type { SearchDatabase } from "../../../src/search/sqlite-search-index";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

describe("SQLite Phase 6 store", () => {
  test("migrates bounded local search history", () => {
    expect(PHASE6_STATE_MIGRATION).toContain("search_queries");
    expect(PHASE6_STATE_MIGRATION).toContain("search_queries_recent");
  });

  test("parameterizes and bounds search query history", async () => {
    const calls: unknown[][] = [];
    const database = {
      execAsync: async () => undefined,
      runAsync: async (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      withExclusiveTransactionAsync: async () => undefined,
    } as unknown as SearchDatabase;
    const store = createSqlitePhase6Store(database);
    await store.recordSearchQuery(WORKSPACE_ID, {
      query: "x'.repeat(1000); DROP TABLE backups; --",
      scope: "all",
      searchedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(calls.map(([sql]) => sql).join(" ")).not.toContain("DROP TABLE");
    expect(calls.some(([sql]) => String(sql).includes("LIMIT 100"))).toBe(true);
  });
});
