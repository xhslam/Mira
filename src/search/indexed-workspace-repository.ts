import { formatIdForPath } from "../formats/format-path";
import type { SearchIndex, SearchIndexDocument } from "./search-index";
import type { WorkspaceId } from "../domain/identifiers";
import type {
  CreateWorkspaceDocumentRequest,
  RenameWorkspaceDocumentRequest,
  WorkspaceDocumentSnapshot,
  WorkspaceRepository,
  WriteVerifiedRequest,
} from "../workspace/workspace-repository";

function indexDocument(
  workspaceId: WorkspaceId,
  snapshot: WorkspaceDocumentSnapshot,
): SearchIndexDocument {
  return Object.freeze({
    workspaceId,
    documentId: snapshot.documentId,
    path: snapshot.path,
    formatId: formatIdForPath(snapshot.path),
    content: snapshot.markdown,
    contentHash: snapshot.contentHash,
    size: new TextEncoder().encode(snapshot.markdown).byteLength,
    modifiedAt: null,
  });
}

export type IndexedWorkspaceRepository = WorkspaceRepository &
  Readonly<{
    synchronizeSearchIndex(): Promise<void>;
  }>;

export function createIndexedWorkspaceRepository(
  repository: WorkspaceRepository,
  searchIndex: SearchIndex,
  workspaceId: WorkspaceId,
): IndexedWorkspaceRepository {
  async function updateIndex(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      // File operations are source-of-truth writes; derived indexing is repaired on next sync.
    }
  }
  return Object.freeze({
    capabilities: repository.capabilities,
    async synchronizeSearchIndex() {
      const listed = await repository.list();
      if (!listed.ok) throw new Error("Workspace files could not be read for search indexing");
      await searchIndex.rebuild(
        workspaceId,
        listed.value.map((item) => indexDocument(workspaceId, item)),
      );
    },
    list: () => repository.list(),
    read: (path: string) => repository.read(path),
    async create(request: CreateWorkspaceDocumentRequest) {
      const result = await repository.create(request);
      if (result.ok) {
        await updateIndex(() =>
          searchIndex.upsertDocument(indexDocument(workspaceId, result.value)),
        );
      }
      return result;
    },
    async writeVerified(request: WriteVerifiedRequest) {
      const result = await repository.writeVerified(request);
      if (result.ok) {
        await updateIndex(() =>
          searchIndex.upsertDocument(indexDocument(workspaceId, result.value)),
        );
      }
      return result;
    },
    async rename(request: RenameWorkspaceDocumentRequest) {
      const before = await repository.read(request.from);
      const result = await repository.rename(request);
      if (result.ok) {
        await updateIndex(async () => {
          if (before.ok && before.value.documentId !== result.value.documentId) {
            await searchIndex.removeDocument(workspaceId, before.value.documentId);
          }
          await searchIndex.upsertDocument(indexDocument(workspaceId, result.value));
        });
      }
      return result;
    },
    async remove(path: string) {
      const result = await repository.remove(path);
      if (result.ok) {
        await updateIndex(() => searchIndex.removeDocument(workspaceId, result.value.documentId));
      }
      return result;
    },
  });
}
