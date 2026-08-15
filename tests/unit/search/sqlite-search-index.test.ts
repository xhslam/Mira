import { describe, expect, test, vi } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import {
  SEARCH_DATABASE_MIGRATIONS,
  createSqliteSearchIndex,
  type SearchDatabase,
} from "../../../src/search/sqlite-search-index";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const DOCUMENT_ID = "223e4567-e89b-42d3-a456-426614174000" as DocumentId;

describe("SQLite search index", () => {
  test("defines all Phase 6 tables and a unicode FTS index", () => {
    const sql = SEARCH_DATABASE_MIGRATIONS.join("\n");
    for (const name of [
      "workspaces",
      "file_index",
      "file_search",
      "document_history",
      "editor_sessions",
      "backups",
    ]) {
      expect(sql).toContain(name);
    }
    expect(sql).toContain("tokenize = 'unicode61'");
  });

  test("initializes idempotently and parameterizes document values", async () => {
    const runAsync = vi.fn(async (..._args: readonly unknown[]) => ({
      changes: 1,
      lastInsertRowId: 0,
    }));
    const database = {
      execAsync: vi.fn(async () => undefined),
      runAsync,
      getAllAsync: vi.fn(async () => []),
      getFirstAsync: vi.fn(async () => ({ integrity_check: "ok" })),
      withExclusiveTransactionAsync: async (task: (tx: unknown) => Promise<void>) => task(database),
    } as unknown as SearchDatabase;
    const index = createSqliteSearchIndex(database);
    await index.initialize();
    await index.upsertDocument({
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      path: "notes/'; DROP TABLE file_index; --.md",
      formatId: "markdown",
      content: "private text",
      contentHash: "hash",
      size: 12,
      modifiedAt: null,
    });

    expect(database.execAsync).toHaveBeenCalledOnce();
    expect(runAsync.mock.calls.map(([sql]) => sql).join(" ")).not.toContain("DROP TABLE");
    expect(runAsync.mock.calls.flat()).toContain("notes/'; DROP TABLE file_index; --.md");
  });

  test("removes stale rows when atomically rebuilding a workspace", async () => {
    const calls: unknown[][] = [];
    const database = {
      execAsync: async () => undefined,
      runAsync: async (...args: unknown[]) => {
        calls.push(args);
        return { changes: 1, lastInsertRowId: 0 };
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => ({ integrity_check: "ok" }),
      withExclusiveTransactionAsync: async (task: (tx: unknown) => Promise<void>) => task(database),
    } as unknown as SearchDatabase;
    const index = createSqliteSearchIndex(database);
    await index.rebuild(WORKSPACE_ID, []);

    expect(calls.some(([sql]) => String(sql).includes("DELETE FROM file_index"))).toBe(true);
    expect(calls.some(([sql]) => String(sql).includes("DELETE FROM file_search"))).toBe(true);
  });

  test("indexes code filenames without storing code content by default", async () => {
    const calls: unknown[][] = [];
    const database = {
      execAsync: async () => undefined,
      runAsync: async (...args: unknown[]) => {
        calls.push(args);
        return { changes: 1, lastInsertRowId: 0 };
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => ({ integrity_check: "ok" }),
      withExclusiveTransactionAsync: async (task: (tx: unknown) => Promise<void>) => task(database),
    } as unknown as SearchDatabase;
    const index = createSqliteSearchIndex(database);
    await index.upsertDocument({
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      path: "src/token.ts",
      formatId: "code",
      content: "const token = 'secret';",
      contentHash: "hash",
      size: 23,
      modifiedAt: null,
    });

    const ftsInsert = calls.find(([sql]) => String(sql).includes("INSERT INTO file_search"));
    expect(ftsInsert?.at(-1)).toBe("");
  });
});
