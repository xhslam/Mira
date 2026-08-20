import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { SearchDatabase } from "../search/sqlite-search-index";
import { SQLITE_DATABASE_NAMES } from "../storage/sqlite-database-names";
import type { SessionId, WorkspaceId } from "../domain/identifiers";
import type { WorkspaceRecord } from "../workspace/workspace-catalog";
import type {
  BackupRecord,
  EditorSessionRecord,
  Phase6Store,
  SearchQueryRecord,
} from "./phase6-store";
import { createSqlitePhase6Store } from "./sqlite-phase6-store";

function adaptDatabase(database: SQLiteDatabase): SearchDatabase {
  return Object.freeze({
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, ...params) => database.runAsync(source, ...params),
    getAllAsync: <T>(source: string, ...params: Parameters<SearchDatabase["runAsync"]>[1][]) =>
      database.getAllAsync<T>(source, ...params),
    getFirstAsync: <T>(source: string, ...params: Parameters<SearchDatabase["runAsync"]>[1][]) =>
      database.getFirstAsync<T>(source, ...params),
    withExclusiveTransactionAsync: (task) =>
      database.withTransactionAsync(() => task(adaptDatabase(database))),
  });
}

export function createExpoPhase6Store(): Phase6Store {
  let storePromise: Promise<Phase6Store> | null = null;
  async function getStore(): Promise<Phase6Store> {
    storePromise ??= openDatabaseAsync(SQLITE_DATABASE_NAMES.state).then(async (database) => {
      const store = createSqlitePhase6Store(adaptDatabase(database));
      await store.initialize();
      return store;
    });
    return storePromise;
  }
  return Object.freeze({
    async initialize() {
      await getStore();
    },
    async upsertWorkspace(record: WorkspaceRecord) {
      return (await getStore()).upsertWorkspace(record);
    },
    async saveEditorSession(record: EditorSessionRecord) {
      return (await getStore()).saveEditorSession(record);
    },
    async removeEditorSession(sessionId: SessionId) {
      return (await getStore()).removeEditorSession(sessionId);
    },
    async recordSearchQuery(workspaceId: WorkspaceId, record: SearchQueryRecord) {
      return (await getStore()).recordSearchQuery(workspaceId, record);
    },
    async listSearchQueries(workspaceId: WorkspaceId, limit?: number) {
      return (await getStore()).listSearchQueries(workspaceId, limit);
    },
    async clearSearchQueries(workspaceId: WorkspaceId) {
      return (await getStore()).clearSearchQueries(workspaceId);
    },
    async recordBackup(record: BackupRecord) {
      return (await getStore()).recordBackup(record);
    },
    async listBackups(workspaceId: WorkspaceId) {
      return (await getStore()).listBackups(workspaceId);
    },
  });
}
