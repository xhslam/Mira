import { failure, type Result, success } from "../domain/result";

declare const workspacePathBrand: unique symbol;

export type WorkspacePath = string & Readonly<{ [workspacePathBrand]: "WorkspacePath" }>;

export type WorkspacePathErrorCode =
  | "PATH_TYPE"
  | "PATH_EMPTY"
  | "PATH_ABSOLUTE"
  | "PATH_DRIVE_PREFIX"
  | "PATH_BACKSLASH"
  | "PATH_NUL"
  | "PATH_DOT_SEGMENT"
  | "PATH_TRAVERSAL"
  | "PATH_REPEATED_SEPARATOR"
  | "PATH_TRAILING_SEPARATOR";

export type WorkspacePathError = Readonly<{
  code: WorkspacePathErrorCode;
  input: string | null;
}>;

function pathFailure(
  code: WorkspacePathErrorCode,
  input: string | null,
): Result<never, WorkspacePathError> {
  return failure(Object.freeze({ code, input }));
}

export function parseWorkspacePath(input: unknown): Result<WorkspacePath, WorkspacePathError> {
  if (typeof input !== "string") {
    return pathFailure("PATH_TYPE", null);
  }

  if (input.length === 0) {
    return pathFailure("PATH_EMPTY", input);
  }

  if (input.startsWith("/")) {
    return pathFailure("PATH_ABSOLUTE", input);
  }

  if (/^[a-z]:/i.test(input)) {
    return pathFailure("PATH_DRIVE_PREFIX", input);
  }

  if (input.includes("\\")) {
    return pathFailure("PATH_BACKSLASH", input);
  }

  if (input.includes("\0")) {
    return pathFailure("PATH_NUL", input);
  }

  const normalized = input.normalize("NFC");
  const segments = normalized.split("/");

  if (segments.includes("..")) {
    return pathFailure("PATH_TRAVERSAL", input);
  }

  if (segments.includes(".")) {
    return pathFailure("PATH_DOT_SEGMENT", input);
  }

  if (segments.includes("")) {
    const code = normalized.endsWith("/") ? "PATH_TRAILING_SEPARATOR" : "PATH_REPEATED_SEPARATOR";
    return pathFailure(code, input);
  }

  return success(normalized as WorkspacePath);
}
