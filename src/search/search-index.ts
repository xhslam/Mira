import type { DocumentId, WorkspaceId } from "../domain/identifiers";

export type SearchScope = "all" | "filename" | "content" | "history";

export type SearchIndexDocument = Readonly<{
  workspaceId: WorkspaceId;
  documentId: DocumentId;
  path: string;
  formatId: string;
  content: string;
  contentHash: string;
  size: number;
  modifiedAt: string | null;
}>;

export type SearchIndexHistory = Readonly<{
  workspaceId: WorkspaceId;
  snapshotId: string;
  documentId: DocumentId;
  path: string;
  content: string;
  createdAt: string;
}>;

export type SearchResult = Readonly<{
  id: string;
  kind: "file" | "content" | "history" | "recent";
  documentId: DocumentId;
  path: string;
  title: string;
  snippet: string;
  line: number | null;
  timestamp: string | null;
}>;

export type SearchResponse = Readonly<{
  query: string;
  results: readonly SearchResult[];
  indexState: "ready" | "rebuilding";
}>;

export interface SearchIndex {
  initialize(): Promise<void>;
  replaceWorkspace(
    workspaceId: WorkspaceId,
    documents: readonly SearchIndexDocument[],
  ): Promise<void>;
  upsertDocument(document: SearchIndexDocument): Promise<void>;
  removeDocument(workspaceId: WorkspaceId, documentId: DocumentId): Promise<void>;
  upsertHistory(snapshot: SearchIndexHistory): Promise<void>;
  removeHistory(snapshotId: string): Promise<void>;
  replaceDocumentHistory(
    workspaceId: WorkspaceId,
    documentId: DocumentId,
    snapshots: readonly SearchIndexHistory[],
  ): Promise<void>;
  clearWorkspaceHistory(workspaceId: WorkspaceId): Promise<void>;
  search(
    workspaceId: WorkspaceId,
    query: string,
    scope: SearchScope,
    limit?: number,
  ): Promise<SearchResponse>;
  rebuild(workspaceId: WorkspaceId, documents: readonly SearchIndexDocument[]): Promise<void>;
  verify(): Promise<boolean>;
}
