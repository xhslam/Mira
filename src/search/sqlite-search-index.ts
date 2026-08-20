import { parseDocumentId, type DocumentId, type WorkspaceId } from "../domain/identifiers";
import { createSearchSnippet, isSearchableWorkspacePath, toFtsQuery } from "./search-policy";
import type {
  SearchIndex,
  SearchIndexDocument,
  SearchIndexHistory,
  SearchResponse,
  SearchResult,
  SearchScope,
} from "./search-index";

type SqlValue = string | number | null | Uint8Array;
export type SearchDatabase = Readonly<{
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: readonly SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: readonly SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: readonly SqlValue[]): Promise<T | null>;
  withExclusiveTransactionAsync(
    task: (transaction: SearchDatabase) => Promise<void>,
  ): Promise<void>;
}>;

export const SEARCH_DATABASE_MIGRATIONS = Object.freeze([
  `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', adapter_type TEXT NOT NULL DEFAULT '',
  serialized_grant TEXT NOT NULL DEFAULT '', capabilities_json TEXT NOT NULL DEFAULT '{}',
  last_opened_at INTEGER, created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS file_index (
  workspace_id TEXT NOT NULL, file_id TEXT NOT NULL, relative_path TEXT NOT NULL,
  format_id TEXT NOT NULL, size INTEGER NOT NULL, modified_at INTEGER, revision TEXT NOT NULL,
  indexed_at INTEGER NOT NULL, PRIMARY KEY (workspace_id, file_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
  workspace_id UNINDEXED, file_id UNINDEXED, relative_path, content, tokenize = 'unicode61'
);
CREATE TABLE IF NOT EXISTS document_history (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, file_id TEXT NOT NULL, base_revision TEXT NOT NULL,
  snapshot_type TEXT NOT NULL, content_blob BLOB, created_at INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS editor_sessions (
  session_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, file_id TEXT NOT NULL, view_kind TEXT NOT NULL,
  selection_json TEXT, scroll_json TEXT, dirty INTEGER NOT NULL, recovery_blob BLOB, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, destination_uri TEXT NOT NULL, checksum TEXT,
  size INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
PRAGMA user_version = 1;`,
]);

type SearchRow = Readonly<{
  file_id: string;
  relative_path: string;
  content: string;
  source: "file" | "history";
  source_id: string;
  created_at: number | null;
}>;

function timestamp(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

async function writeDocument(
  database: SearchDatabase,
  document: SearchIndexDocument,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO file_index (workspace_id, file_id, relative_path, format_id, size, modified_at, revision, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, file_id) DO UPDATE SET relative_path=excluded.relative_path,
       format_id=excluded.format_id, size=excluded.size, modified_at=excluded.modified_at,
       revision=excluded.revision, indexed_at=excluded.indexed_at`,
    document.workspaceId,
    document.documentId,
    document.path,
    document.formatId,
    document.size,
    timestamp(document.modifiedAt),
    document.contentHash,
    Date.now(),
  );
  await database.runAsync(
    "DELETE FROM file_search WHERE workspace_id = ? AND file_id = ?",
    document.workspaceId,
    document.documentId,
  );
  const content =
    isSearchableWorkspacePath(document.path) && document.formatId !== "code"
      ? document.content
      : "";
  await database.runAsync(
    "INSERT INTO file_search (workspace_id, file_id, relative_path, content) VALUES (?, ?, ?, ?)",
    document.workspaceId,
    document.documentId,
    document.path,
    content,
  );
}

async function writeHistory(database: SearchDatabase, snapshot: SearchIndexHistory): Promise<void> {
  await database.runAsync(
    `INSERT INTO document_history (id, workspace_id, file_id, base_revision, snapshot_type, content_blob, created_at, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
       workspace_id=excluded.workspace_id, file_id=excluded.file_id,
       content_blob=excluded.content_blob, created_at=excluded.created_at, reason=excluded.reason`,
    snapshot.snapshotId,
    snapshot.workspaceId,
    snapshot.documentId,
    "history",
    "history",
    isSearchableWorkspacePath(snapshot.path) ? snapshot.content : null,
    Date.parse(snapshot.createdAt),
    snapshot.path,
  );
}

function mapRows(
  rows: readonly SearchRow[],
  query: string,
  scope: SearchScope,
): readonly SearchResult[] {
  const normalizedQuery = query.toLocaleLowerCase();
  return Object.freeze(
    rows.flatMap((row) => {
      const documentId = parseDocumentId(row.file_id);
      if (!documentId.ok) return [];
      const match = createSearchSnippet(row.content, query);
      if (row.source === "history") {
        return [
          Object.freeze({
            id: `history:${row.source_id}`,
            kind: "history" as const,
            documentId: documentId.value,
            path: row.relative_path,
            title: row.relative_path,
            snippet: match.snippet || row.relative_path,
            line: match.line,
            timestamp: row.created_at === null ? null : new Date(row.created_at).toISOString(),
          }),
        ];
      }
      const results: SearchResult[] = [];
      if (scope !== "content" && row.relative_path.toLocaleLowerCase().includes(normalizedQuery)) {
        results.push(
          Object.freeze({
            id: `file:${row.file_id}`,
            kind: "file",
            documentId: documentId.value,
            path: row.relative_path,
            title: row.relative_path,
            snippet: row.relative_path,
            line: null,
            timestamp: null,
          }),
        );
      }
      if (scope !== "filename" && row.content.toLocaleLowerCase().includes(normalizedQuery)) {
        results.push(
          Object.freeze({
            id: `content:${row.file_id}`,
            kind: "content",
            documentId: documentId.value,
            path: row.relative_path,
            title: row.relative_path,
            snippet: match.snippet,
            line: match.line,
            timestamp: null,
          }),
        );
      }
      return results;
    }),
  );
}

export function createSqliteSearchIndex(database: SearchDatabase): SearchIndex {
  let initialized = false;
  let indexState: SearchResponse["indexState"] = "ready";

  async function initialize(): Promise<void> {
    if (initialized) return;
    await database.execAsync(SEARCH_DATABASE_MIGRATIONS.join("\n"));
    initialized = true;
  }

  async function rebuild(
    workspaceId: SearchIndexDocument["workspaceId"],
    documents: readonly SearchIndexDocument[],
  ): Promise<void> {
    await initialize();
    indexState = "rebuilding";
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync("DELETE FROM file_search WHERE workspace_id = ?", workspaceId);
        await transaction.runAsync("DELETE FROM file_index WHERE workspace_id = ?", workspaceId);
        for (const document of documents) await writeDocument(transaction, document);
      });
    } finally {
      indexState = "ready";
    }
  }

  return Object.freeze({
    initialize,
    async replaceWorkspace(workspaceId: WorkspaceId, documents: readonly SearchIndexDocument[]) {
      await rebuild(workspaceId, documents);
    },
    async upsertDocument(document: SearchIndexDocument) {
      await initialize();
      await database.withExclusiveTransactionAsync((transaction) =>
        writeDocument(transaction, document),
      );
    },
    async removeDocument(workspaceId: WorkspaceId, documentId: DocumentId) {
      await initialize();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          "DELETE FROM file_search WHERE workspace_id = ? AND file_id = ?",
          workspaceId,
          documentId,
        );
        await transaction.runAsync(
          "DELETE FROM file_index WHERE workspace_id = ? AND file_id = ?",
          workspaceId,
          documentId,
        );
      });
    },
    async upsertHistory(snapshot: SearchIndexHistory) {
      await initialize();
      await writeHistory(database, snapshot);
    },
    async removeHistory(snapshotId: string) {
      await initialize();
      await database.runAsync("DELETE FROM document_history WHERE id = ?", snapshotId);
    },
    async replaceDocumentHistory(
      workspaceId: WorkspaceId,
      documentId: DocumentId,
      snapshots: readonly SearchIndexHistory[],
    ) {
      await initialize();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          "DELETE FROM document_history WHERE workspace_id = ? AND file_id = ?",
          workspaceId,
          documentId,
        );
        for (const snapshot of snapshots) await writeHistory(transaction, snapshot);
      });
    },
    async clearWorkspaceHistory(workspaceId: WorkspaceId) {
      await initialize();
      await database.runAsync("DELETE FROM document_history WHERE workspace_id = ?", workspaceId);
    },
    async search(workspaceId: WorkspaceId, query: string, scope: SearchScope, limit = 50) {
      await initialize();
      const fts = toFtsQuery(query);
      if (!fts) return Object.freeze({ query, results: Object.freeze([]), indexState });
      const boundedLimit = Math.max(1, Math.min(limit, 200));
      const rows: SearchRow[] = [];
      if (scope !== "history") {
        rows.push(
          ...(await database.getAllAsync<SearchRow>(
            `SELECT file_id, relative_path, content, 'file' AS source, file_id AS source_id, NULL AS created_at
           FROM file_search WHERE workspace_id = ? AND file_search MATCH ? LIMIT ?`,
            workspaceId,
            fts,
            boundedLimit,
          )),
        );
      }
      if (scope === "history" || scope === "all") {
        rows.push(
          ...(await database.getAllAsync<SearchRow>(
            `SELECT file_id, reason AS relative_path, CAST(content_blob AS TEXT) AS content,
             'history' AS source, id AS source_id, created_at
           FROM document_history WHERE workspace_id = ? AND CAST(content_blob AS TEXT) LIKE ? ESCAPE '\\' LIMIT ?`,
            workspaceId,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
            boundedLimit,
          )),
        );
      }
      return Object.freeze({
        query,
        results: mapRows(rows, query, scope).slice(0, boundedLimit),
        indexState,
      });
    },
    rebuild,
    async verify() {
      await initialize();
      const result = await database.getFirstAsync<{ integrity_check: string }>(
        "PRAGMA integrity_check",
      );
      return result?.integrity_check === "ok";
    },
  });
}
