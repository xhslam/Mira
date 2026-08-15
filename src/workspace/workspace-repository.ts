import type { DocumentId } from "../domain/identifiers";
import type { Result } from "../domain/result";
import type { WorkspacePath } from "./workspace-path";

export type WorkspaceRepositoryCapabilities = Readonly<{
  atomicReplace: boolean;
  persistedExternalGrants: boolean;
}>;

export type WorkspaceDocumentSnapshot = Readonly<{
  documentId: DocumentId;
  path: WorkspacePath;
  markdown: string;
  contentHash: string;
}>;

export type CreateWorkspaceDocumentRequest = Readonly<{
  path: string;
  markdown: string;
}>;

export type WriteVerifiedRequest = Readonly<{
  path: string;
  expectedBaseHash: string;
  markdown: string;
}>;

export type RenameWorkspaceDocumentRequest = Readonly<{
  from: string;
  to: string;
}>;

export type RemovedWorkspaceDocument = Readonly<{
  documentId: DocumentId;
  path: WorkspacePath;
}>;

export type WorkspaceRepositoryErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "EXTERNAL_MODIFICATION"
  | "HASH_FAILED"
  | "ID_GENERATION_FAILED"
  | "IO_FAILURE";

export type WorkspaceRepositoryError = Readonly<{
  code: WorkspaceRepositoryErrorCode;
  path: string;
}>;

export interface WorkspaceRepository {
  readonly capabilities: WorkspaceRepositoryCapabilities;
  list(): Promise<Result<readonly WorkspaceDocumentSnapshot[], WorkspaceRepositoryError>>;
  read(path: string): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>>;
  create(
    request: CreateWorkspaceDocumentRequest,
  ): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>>;
  writeVerified(
    request: WriteVerifiedRequest,
  ): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>>;
  rename(
    request: RenameWorkspaceDocumentRequest,
  ): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>>;
  remove(path: string): Promise<Result<RemovedWorkspaceDocument, WorkspaceRepositoryError>>;
}
