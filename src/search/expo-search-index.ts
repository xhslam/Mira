import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { DocumentId, WorkspaceId } from "../domain/identifiers";
import { SQLITE_DATABASE_NAMES } from "../storage/sqlite-database-names";
import type {
  SearchIndex,
  SearchIndexDocument,
  SearchIndexHistory,
  SearchScope,
} from "./search-index";
import { createSqliteSearchIndex, type SearchDatabase } from "./sqlite-search-index";

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

export function createExpoSearchIndex(): SearchIndex {
  let indexPromise: Promise<SearchIndex> | null = null;

  async function openIndex(): Promise<SearchIndex> {
    const database = await openDatabaseAsync(SQLITE_DATABASE_NAMES.search);
    const index = createSqliteSearchIndex(adaptDatabase(database));
    await index.initialize();
    if (!(await index.verify())) {
      throw new Error("Search index integrity check failed");
    }
    return index;
  }

  async function getIndex(): Promise<SearchIndex> {
    // Search is derived state. Never delete or close a database during startup recovery: on some
    // Android runtimes expo-sqlite can still be finalizing native statements on another queue.
    indexPromise ??= openIndex();
    return indexPromise;
  }

  return Object.freeze({
    async initialize() {
      await getIndex();
    },
    async replaceWorkspace(workspaceId: WorkspaceId, documents: readonly SearchIndexDocument[]) {
      return (await getIndex()).replaceWorkspace(workspaceId, documents);
    },
    async upsertDocument(document: SearchIndexDocument) {
      return (await getIndex()).upsertDocument(document);
    },
    async removeDocument(workspaceId: WorkspaceId, documentId: DocumentId) {
      return (await getIndex()).removeDocument(workspaceId, documentId);
    },
    async upsertHistory(snapshot: SearchIndexHistory) {
      return (await getIndex()).upsertHistory(snapshot);
    },
    async removeHistory(snapshotId: string) {
      return (await getIndex()).removeHistory(snapshotId);
    },
    async replaceDocumentHistory(
      workspaceId: WorkspaceId,
      documentId: DocumentId,
      snapshots: readonly SearchIndexHistory[],
    ) {
      return (await getIndex()).replaceDocumentHistory(workspaceId, documentId, snapshots);
    },
    async clearWorkspaceHistory(workspaceId: WorkspaceId) {
      return (await getIndex()).clearWorkspaceHistory(workspaceId);
    },
    async search(workspaceId: WorkspaceId, query: string, scope: SearchScope, limit?: number) {
      return (await getIndex()).search(workspaceId, query, scope, limit);
    },
    async rebuild(workspaceId: WorkspaceId, documents: readonly SearchIndexDocument[]) {
      return (await getIndex()).rebuild(workspaceId, documents);
    },
    async verify() {
      return (await getIndex()).verify();
    },
  });
}
