import { failure, type Result, success } from "../domain/result";
import type { WorkspaceRepository, WorkspaceRepositoryError } from "./workspace-repository";
import type { ExportedFileResult, WorkspaceAdapterError } from "./workspace-adapter";
import type { WorkspaceShareError, WorkspaceShareSource } from "./workspace-file-share";
import type { WorkspacePath } from "./workspace-path";

export type CopyWorkspaceFileForShare = (
  path: WorkspacePath,
  destinationUri: string,
) => Promise<Result<ExportedFileResult, WorkspaceAdapterError>>;

function sourceFailure(
  code: WorkspaceShareError["code"],
  path: string,
  message: string,
): Result<never, WorkspaceShareError> {
  return failure(Object.freeze({ code, path, message }));
}

function mapRepositoryError(error: WorkspaceRepositoryError): Result<never, WorkspaceShareError> {
  const code =
    error.code === "INVALID_PATH" || error.code === "NOT_FOUND" ? error.code : "IO_FAILURE";
  return sourceFailure(code, error.path, "The managed workspace file could not be prepared");
}

function mapAdapterError(error: WorkspaceAdapterError): Result<never, WorkspaceShareError> {
  const code: WorkspaceShareError["code"] =
    error.code === "ALREADY_EXISTS" || error.code === "EXTERNAL_MODIFICATION"
      ? "IO_FAILURE"
      : error.code;
  return sourceFailure(code, error.path, error.message);
}

export function createRepositoryShareSource(
  repository: WorkspaceRepository,
  writeText: (uri: string, contents: string) => Promise<void>,
): WorkspaceShareSource {
  return Object.freeze({
    async exportFile(path, destination) {
      let document: Awaited<ReturnType<WorkspaceRepository["read"]>>;
      try {
        document = await repository.read(path);
      } catch {
        return sourceFailure("IO_FAILURE", path, "The managed workspace file could not be read");
      }
      if (!document.ok) return mapRepositoryError(document.error);
      try {
        await writeText(destination.uri, document.value.markdown);
        return success(Object.freeze({ uri: destination.uri, contentType: "text/markdown" }));
      } catch {
        return sourceFailure("IO_FAILURE", path, "The temporary share file could not be written");
      }
    },
  });
}

export function createAdapterShareSource(
  copyFile: CopyWorkspaceFileForShare,
): WorkspaceShareSource {
  return Object.freeze({
    async exportFile(path, destination) {
      try {
        const copied = await copyFile(path, destination.uri);
        return copied.ok
          ? success(Object.freeze({ ...copied.value }))
          : mapAdapterError(copied.error);
      } catch {
        return sourceFailure("IO_FAILURE", path, "The linked workspace file could not be copied");
      }
    },
  });
}
