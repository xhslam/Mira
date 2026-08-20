import type { DocumentId, WorkspaceId } from "../domain/identifiers";
import type { AddHistorySnapshotInput, HistoryStore } from "../history/history-store";
import type { SearchIndex } from "./search-index";

export function createIndexedHistoryStore(
  history: HistoryStore,
  searchIndex: SearchIndex,
  workspaceId: WorkspaceId,
): HistoryStore {
  async function replaceDocument(documentId: DocumentId): Promise<void> {
    const snapshots = await history.list(documentId);
    await searchIndex.replaceDocumentHistory(
      workspaceId,
      documentId,
      snapshots.map((snapshot) =>
        Object.freeze({
          workspaceId,
          snapshotId: snapshot.snapshotId,
          documentId: snapshot.documentId,
          path: snapshot.path,
          content: snapshot.markdown,
          createdAt: snapshot.createdAt,
        }),
      ),
    );
  }
  return Object.freeze({
    list: (documentId: DocumentId) => history.list(documentId),
    async add(input: AddHistorySnapshotInput) {
      const snapshot = await history.add(input);
      if (snapshot) {
        try {
          await replaceDocument(snapshot.documentId);
        } catch {
          // Verified history remains valid; its derived search rows are repaired on next sync.
        }
      }
      return snapshot;
    },
    async remove(snapshotId: string) {
      await history.remove(snapshotId);
      try {
        await searchIndex.removeHistory(snapshotId);
      } catch {
        // Search cleanup is derived and must not reverse a successful history removal.
      }
    },
    async clear(documentId?: DocumentId) {
      await history.clear(documentId);
      try {
        if (documentId === undefined) await searchIndex.clearWorkspaceHistory(workspaceId);
        else await replaceDocument(documentId);
      } catch {
        // Search history is derived and is repaired by the next index synchronization.
      }
    },
  });
}

export async function synchronizeHistoryIndex(
  history: HistoryStore,
  searchIndex: SearchIndex,
  workspaceId: WorkspaceId,
  documentIds: readonly DocumentId[],
): Promise<void> {
  await searchIndex.clearWorkspaceHistory(workspaceId);
  for (const documentId of documentIds) {
    const snapshots = await history.list(documentId);
    await searchIndex.replaceDocumentHistory(
      workspaceId,
      documentId,
      snapshots.map((snapshot) =>
        Object.freeze({
          workspaceId,
          snapshotId: snapshot.snapshotId,
          documentId: snapshot.documentId,
          path: snapshot.path,
          content: snapshot.markdown,
          createdAt: snapshot.createdAt,
        }),
      ),
    );
  }
}
