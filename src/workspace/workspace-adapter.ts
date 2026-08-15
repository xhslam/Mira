import type { WorkspaceId } from "../domain/identifiers";
import type { Result } from "../domain/result";
import type { WorkspacePath } from "./workspace-path";

export type WorkspaceProvider = "managed" | "android-saf" | "ios-bookmark";

export type WorkspaceGrantStatus = "authorized" | "needs-reauthorization" | "offline";

export type WorkspaceGrant = Readonly<{
  workspaceId: WorkspaceId;
  provider: WorkspaceProvider;
  displayName: string;
  locationSummary: string;
  serializedGrant: string;
  status: WorkspaceGrantStatus;
  createdAt: string;
  lastOpenedAt: string | null;
}>;

export type WorkspaceCapability = Readonly<{
  read: boolean;
  write: boolean;
  atomicReplace: boolean;
  create: boolean;
  rename: boolean;
  move: boolean;
  copy: boolean;
  remove: boolean;
  trash: boolean;
  watch: boolean;
  share: boolean;
}>;

export type WorkspaceEntryKind = "file" | "directory";

export type FileEntry = Readonly<{
  path: WorkspacePath;
  name: string;
  kind: WorkspaceEntryKind;
  size: number | null;
  modifiedAt: string | null;
  contentType: string | null;
}>;

export type FileStat = Readonly<{
  path: WorkspacePath;
  kind: WorkspaceEntryKind;
  size: number | null;
  modifiedAt: string | null;
  revision: string;
}>;

export type TextReadResult = Readonly<{
  path: WorkspacePath;
  content: string;
  revision: string;
}>;

export type BinaryReadResult = Readonly<{
  path: WorkspacePath;
  content: Uint8Array;
  revision: string;
  contentType: string | null;
}>;

export type TextWriteResult = Readonly<{
  path: WorkspacePath;
  revision: string;
  atomic: boolean;
}>;

export type ExportedFileResult = Readonly<{
  uri: string;
  contentType: string | null;
}>;

export type WorkspaceAdapterErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "PERMISSION_REVOKED"
  | "READ_ONLY"
  | "OFFLINE"
  | "UNSUPPORTED"
  | "EXTERNAL_MODIFICATION"
  | "IO_FAILURE";

export type WorkspaceAdapterError = Readonly<{
  code: WorkspaceAdapterErrorCode;
  path: string;
  message: string;
}>;

export type WorkspaceAdapter = Readonly<{
  readonly grant: WorkspaceGrant;
  readonly capabilities: WorkspaceCapability;
  list(path?: WorkspacePath): Promise<Result<readonly FileEntry[], WorkspaceAdapterError>>;
  stat(path: WorkspacePath): Promise<Result<FileStat, WorkspaceAdapterError>>;
  readText(path: WorkspacePath): Promise<Result<TextReadResult, WorkspaceAdapterError>>;
  readBytes?(path: WorkspacePath): Promise<Result<BinaryReadResult, WorkspaceAdapterError>>;
  writeTextAtomic(
    path: WorkspacePath,
    content: string,
    expectedRevision: string | null,
  ): Promise<Result<TextWriteResult, WorkspaceAdapterError>>;
  createFile(
    path: WorkspacePath,
    content: string,
  ): Promise<Result<TextWriteResult, WorkspaceAdapterError>>;
  createFileBytes?(
    path: WorkspacePath,
    content: Uint8Array,
  ): Promise<Result<TextWriteResult, WorkspaceAdapterError>>;
  writeBytes?(
    path: WorkspacePath,
    content: Uint8Array,
    expectedRevision: string | null,
  ): Promise<Result<TextWriteResult, WorkspaceAdapterError>>;
  createDirectory(path: WorkspacePath): Promise<Result<FileEntry, WorkspaceAdapterError>>;
  rename(from: WorkspacePath, to: WorkspacePath): Promise<Result<FileEntry, WorkspaceAdapterError>>;
  move(from: WorkspacePath, to: WorkspacePath): Promise<Result<FileEntry, WorkspaceAdapterError>>;
  copy(from: WorkspacePath, to: WorkspacePath): Promise<Result<FileEntry, WorkspaceAdapterError>>;
  remove(
    path: WorkspacePath,
    mode: "trash" | "permanent",
  ): Promise<Result<void, WorkspaceAdapterError>>;
  exportFile(
    path: WorkspacePath,
    destinationUri: string,
  ): Promise<Result<ExportedFileResult, WorkspaceAdapterError>>;
}>;
