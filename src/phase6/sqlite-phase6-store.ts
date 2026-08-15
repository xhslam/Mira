import { z } from "zod";

import {
  parseSessionId,
  parseWorkspaceId,
  type SessionId,
  type WorkspaceId,
} from "../domain/identifiers";
import type { SearchDatabase } from "../search/sqlite-search-index";
import type { WorkspaceRecord } from "../workspace/workspace-catalog";
import type {
  BackupRecord,
  EditorSessionRecord,
  Phase6Store,
  SearchQueryRecord,
} from "./phase6-store";

export const PHASE6_STATE_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', adapter_type TEXT NOT NULL DEFAULT '',
  serialized_grant TEXT NOT NULL DEFAULT '', capabilities_json TEXT NOT NULL DEFAULT '{}',
  last_opened_at INTEGER, created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS editor_sessions (
  session_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, file_id TEXT NOT NULL, view_kind TEXT NOT NULL,
  selection_json TEXT, scroll_json TEXT, dirty INTEGER NOT NULL, recovery_blob BLOB, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, destination_uri TEXT NOT NULL, checksum TEXT,
  size INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS search_queries (
  workspace_id TEXT NOT NULL,
  query TEXT NOT NULL,
  scope TEXT NOT NULL,
  searched_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, query, scope)
);
CREATE INDEX IF NOT EXISTS search_queries_recent
  ON search_queries(workspace_id, searched_at DESC);`;

const searchRowSchema = z
  .object({
    query: z.string(),
    scope: z.enum(["all", "filename", "content", "history"]),
    searched_at: z.number(),
  })
  .strict();
const backupRowSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string(),
    destination_uri: z.string(),
    checksum: z.string().nullable(),
    size: z.number().nullable(),
    status: z.enum(["completed", "failed"]),
    created_at: z.number(),
  })
  .strict();

export function createSqlitePhase6Store(database: SearchDatabase): Phase6Store {
  let initialized = false;
  async function initialize(): Promise<void> {
    if (initialized) return;
    await database.execAsync(PHASE6_STATE_MIGRATION);
    initialized = true;
  }

  return Object.freeze({
    initialize,
    async upsertWorkspace(record: WorkspaceRecord) {
      await initialize();
      await database.runAsync(
        `INSERT INTO workspaces (id, display_name, adapter_type, serialized_grant, capabilities_json, last_opened_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,
           adapter_type=excluded.adapter_type, serialized_grant=excluded.serialized_grant,
           capabilities_json=excluded.capabilities_json, last_opened_at=excluded.last_opened_at`,
        record.grant.workspaceId,
        record.grant.displayName,
        record.grant.provider,
        record.grant.serializedGrant,
        JSON.stringify(record.capabilities),
        record.grant.lastOpenedAt ? Date.parse(record.grant.lastOpenedAt) : null,
        Date.parse(record.grant.createdAt),
      );
    },
    async saveEditorSession(record: EditorSessionRecord) {
      await initialize();
      await database.runAsync(
        "DELETE FROM editor_sessions WHERE updated_at < ?",
        Date.parse(record.updatedAt) - 30 * 24 * 60 * 60 * 1_000,
      );
      await database.runAsync(
        `INSERT INTO editor_sessions (session_id, workspace_id, file_id, view_kind, selection_json, scroll_json, dirty, recovery_blob, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(session_id) DO UPDATE SET
           file_id=excluded.file_id, view_kind=excluded.view_kind, selection_json=excluded.selection_json,
           scroll_json=excluded.scroll_json, dirty=excluded.dirty, updated_at=excluded.updated_at`,
        record.sessionId,
        record.workspaceId,
        record.documentId,
        record.viewKind,
        record.selectionJson,
        record.scrollJson,
        record.dirty ? 1 : 0,
        Date.parse(record.updatedAt),
      );
    },
    async removeEditorSession(sessionId: SessionId) {
      await initialize();
      if (!parseSessionId(sessionId).ok) throw new Error("Invalid editor session identity");
      await database.runAsync("DELETE FROM editor_sessions WHERE session_id = ?", sessionId);
    },
    async recordSearchQuery(workspaceId: WorkspaceId, record: SearchQueryRecord) {
      await initialize();
      if (!record.query.trim()) return;
      await database.runAsync(
        `INSERT INTO search_queries (workspace_id, query, scope, searched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id, query, scope) DO UPDATE SET searched_at=excluded.searched_at`,
        workspaceId,
        record.query.trim().slice(0, 500),
        record.scope,
        Date.parse(record.searchedAt),
      );
      await database.runAsync(
        `DELETE FROM search_queries WHERE workspace_id = ? AND rowid NOT IN
         (SELECT rowid FROM search_queries WHERE workspace_id = ? ORDER BY searched_at DESC LIMIT 100)`,
        workspaceId,
        workspaceId,
      );
    },
    async listSearchQueries(workspaceId: WorkspaceId, limit = 20) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        "SELECT query, scope, searched_at FROM search_queries WHERE workspace_id = ? ORDER BY searched_at DESC LIMIT ?",
        workspaceId,
        Math.max(1, Math.min(limit, 100)),
      );
      return Object.freeze(
        rows.map((row) => {
          const parsed = searchRowSchema.parse(row);
          return Object.freeze({
            query: parsed.query,
            scope: parsed.scope,
            searchedAt: new Date(parsed.searched_at).toISOString(),
          });
        }),
      );
    },
    async clearSearchQueries(workspaceId: WorkspaceId) {
      await initialize();
      await database.runAsync("DELETE FROM search_queries WHERE workspace_id = ?", workspaceId);
    },
    async recordBackup(record: BackupRecord) {
      await initialize();
      await database.runAsync(
        `INSERT INTO backups (id, workspace_id, destination_uri, checksum, size, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET checksum=excluded.checksum,
           size=excluded.size, status=excluded.status`,
        record.id,
        record.workspaceId,
        record.destinationUri,
        record.checksum,
        record.size,
        record.status,
        Date.parse(record.createdAt),
      );
    },
    async listBackups(workspaceId: WorkspaceId) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, workspace_id, destination_uri, checksum, size, status, created_at
         FROM backups WHERE workspace_id = ? ORDER BY created_at DESC`,
        workspaceId,
      );
      return Object.freeze(
        rows.map((row) => {
          const parsed = backupRowSchema.parse(row);
          const parsedWorkspaceId = parseWorkspaceId(parsed.workspace_id);
          if (!parsedWorkspaceId.ok) throw new Error("Invalid backup workspace identity");
          const result: BackupRecord = Object.freeze({
            id: parsed.id,
            workspaceId: parsedWorkspaceId.value,
            destinationUri: parsed.destination_uri,
            checksum: parsed.checksum,
            size: parsed.size,
            status: parsed.status,
            createdAt: new Date(parsed.created_at).toISOString(),
          });
          return result;
        }),
      );
    },
  });
}
