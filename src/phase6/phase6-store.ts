import type { DocumentId, SessionId, WorkspaceId } from "../domain/identifiers";
import type { SearchScope } from "../search/search-index";
import type { WorkspaceRecord } from "../workspace/workspace-catalog";

export type EditorSessionRecord = Readonly<{
  sessionId: SessionId;
  workspaceId: WorkspaceId;
  documentId: DocumentId;
  viewKind: string;
  selectionJson: string | null;
  scrollJson: string | null;
  dirty: boolean;
  updatedAt: string;
}>;

export type BackupRecord = Readonly<{
  id: string;
  workspaceId: WorkspaceId;
  destinationUri: string;
  checksum: string | null;
  size: number | null;
  status: "completed" | "failed";
  createdAt: string;
}>;

export type SearchQueryRecord = Readonly<{
  query: string;
  scope: SearchScope;
  searchedAt: string;
}>;

export interface Phase6Store {
  initialize(): Promise<void>;
  upsertWorkspace(record: WorkspaceRecord): Promise<void>;
  saveEditorSession(record: EditorSessionRecord): Promise<void>;
  removeEditorSession(sessionId: SessionId): Promise<void>;
  recordSearchQuery(workspaceId: WorkspaceId, record: SearchQueryRecord): Promise<void>;
  listSearchQueries(
    workspaceId: WorkspaceId,
    limit?: number,
  ): Promise<readonly SearchQueryRecord[]>;
  clearSearchQueries(workspaceId: WorkspaceId): Promise<void>;
  recordBackup(record: BackupRecord): Promise<void>;
  listBackups(workspaceId: WorkspaceId): Promise<readonly BackupRecord[]>;
}
