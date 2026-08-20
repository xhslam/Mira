import { failure, type Result, success } from "../domain/result";
import type { WorkspacePath } from "./workspace-path";

export type WorkspaceShareErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "PERMISSION_REVOKED"
  | "READ_ONLY"
  | "OFFLINE"
  | "UNSUPPORTED"
  | "UNAVAILABLE"
  | "SHARE_FAILED"
  | "IO_FAILURE";

export type WorkspaceShareError = Readonly<{
  code: WorkspaceShareErrorCode;
  path: string;
  message: string;
}>;

export type ExportedWorkspaceFile = Readonly<{
  uri: string;
  contentType: string | null;
}>;

export type WorkspaceShareDestination = Readonly<{ uri: string }>;

export type WorkspaceShareSource = Readonly<{
  exportFile(
    path: WorkspacePath,
    destination: WorkspaceShareDestination,
  ): Promise<Result<ExportedWorkspaceFile, WorkspaceShareError>>;
}>;

export type WorkspaceFileShare = Readonly<{
  share(path: WorkspacePath, name: string): Promise<Result<void, WorkspaceShareError>>;
}>;

export type WorkspaceFileShareOptions = Readonly<{
  source: WorkspaceShareSource;
  cacheDirectoryUri: string;
  createId: () => string;
  isAvailable: () => Promise<boolean>;
  share: (
    uri: string,
    options: Readonly<{ dialogTitle: string; mimeType?: string }>,
  ) => Promise<void>;
  remove: (uri: string) => Promise<void>;
  cleanupExpired: () => Promise<void>;
}>;

function shareFailure(
  code: WorkspaceShareErrorCode,
  path: string,
  message: string,
): Result<never, WorkspaceShareError> {
  return failure(Object.freeze({ code, path, message }));
}

function normalizeCacheDirectory(uri: string): string {
  if (!/^file:\/\/\//i.test(uri) || uri.includes("\0")) {
    throw new Error("Share cache must be a local file URI");
  }
  return uri.endsWith("/") ? uri : `${uri}/`;
}

function safeCacheName(name: string): string {
  const leaf = name.split("/").at(-1)?.normalize("NFC") ?? "file";
  const ascii = leaf.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return (ascii || "file").slice(-160);
}

function safeDisplayName(name: string): string {
  const normalized = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  return (normalized || "file").slice(0, 120);
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9-]{1,128}$/.test(id);
}

function safeMimeType(contentType: string | null): string {
  return contentType !== null &&
    /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(contentType)
    ? contentType
    : "application/octet-stream";
}

export function createWorkspaceFileShare(options: WorkspaceFileShareOptions): WorkspaceFileShare {
  const cacheDirectoryUri = normalizeCacheDirectory(options.cacheDirectoryUri);

  return Object.freeze({
    async share(path, name) {
      try {
        await options.cleanupExpired();
      } catch {
        // Old cache maintenance must not block a new user-initiated share.
      }
      let available: boolean;
      try {
        available = await options.isAvailable();
      } catch {
        return shareFailure(
          "UNAVAILABLE",
          path,
          "System sharing availability could not be checked",
        );
      }
      if (!available) {
        return shareFailure("UNAVAILABLE", path, "System sharing is unavailable on this device");
      }

      const id = options.createId();
      if (!validId(id)) {
        return shareFailure("IO_FAILURE", path, "The temporary share identity is invalid");
      }
      const destinationUri = `${cacheDirectoryUri}inkstone-share-${id}-${safeCacheName(name)}`;
      let outcome: Result<void, WorkspaceShareError>;
      try {
        const exported = await options.source.exportFile(path, { uri: destinationUri });
        if (!exported.ok) {
          outcome = exported;
        } else if (exported.value.uri !== destinationUri) {
          outcome = shareFailure(
            "IO_FAILURE",
            path,
            "The temporary share file is outside the cache target",
          );
        } else {
          const shareOptions = Object.freeze({
            dialogTitle: `Share ${safeDisplayName(name)}`,
            mimeType: safeMimeType(exported.value.contentType),
          });
          await options.share(exported.value.uri, shareOptions);
          outcome = success(undefined);
        }
      } catch {
        outcome = shareFailure("SHARE_FAILED", path, "The system share panel could not be opened");
      }

      if (!outcome.ok) {
        try {
          await options.remove(destinationUri);
        } catch {
          return failure(
            Object.freeze({
              ...outcome.error,
              message: `${outcome.error.message}. Temporary cache cleanup also failed`,
            }),
          );
        }
      }
      return outcome;
    },
  });
}
