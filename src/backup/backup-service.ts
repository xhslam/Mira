import type { WorkspaceId } from "../domain/identifiers";
import type { Result } from "../domain/result";
import type { WorkspaceRepository } from "../workspace/workspace-repository";

export type BackupConflictPolicy = "fail" | "replace" | "keep-both";

export type BackupManifest = Readonly<{
  format: "inkstone-workspace-backup";
  version: 1;
  backupId: string;
  workspaceId: WorkspaceId;
  createdAt: string;
  fileCount: number;
}>;

export type BackupPreflight = Readonly<{
  manifest: BackupManifest;
  files: readonly Readonly<{ path: string; size: number; checksum: string; conflict: boolean }>[];
  conflicts: readonly string[];
  totalBytes: number;
}>;

export type BackupError = Readonly<{
  code: "INVALID_ARCHIVE" | "UNSUPPORTED_VERSION" | "CHECKSUM_MISMATCH" | "CONFLICT" | "IO_FAILURE";
  message: string;
  path: string | null;
}>;

export type BackupService = Readonly<{
  create(workspaceId: WorkspaceId): Promise<Result<Uint8Array, BackupError>>;
  preflight(archive: Uint8Array): Promise<Result<BackupPreflight, BackupError>>;
  restore(
    archive: Uint8Array,
    policy: BackupConflictPolicy,
    dryRun?: boolean,
  ): Promise<Result<BackupPreflight, BackupError>>;
}>;

export type BackupServiceOptions = Readonly<{
  repository: WorkspaceRepository;
  binaryWorkspace?: BackupBinaryWorkspace;
  createId: () => string;
  now: () => Date;
  sha256: (contents: Uint8Array) => Promise<string>;
}>;

export type BackupBinaryFile = Readonly<{
  path: string;
  contents: Uint8Array;
  revision: string;
}>;

export type BackupBinaryWorkspace = Readonly<{
  list(): Promise<readonly BackupBinaryFile[]>;
  read(path: string): Promise<BackupBinaryFile>;
  create(path: string, contents: Uint8Array): Promise<void>;
  replace(path: string, contents: Uint8Array, expectedRevision: string): Promise<void>;
  remove(path: string): Promise<void>;
}>;
