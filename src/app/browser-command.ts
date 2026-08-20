import type { WorkspaceBrowserError } from "../workspace/workspace-browser";

export type BrowserCommandResult = Readonly<{
  ok: boolean;
  errorCode: WorkspaceBrowserError["code"] | "CONFIRMATION_REQUIRED" | null;
  error: string | null;
}>;

export function browserErrorMessage(error: WorkspaceBrowserError): string {
  if (error.code === "ALREADY_EXISTS") return "A file or folder already exists at that path.";
  if (error.code === "INVALID_PATH") return "Enter a valid path inside this workspace.";
  if (error.code === "PERMISSION_REVOKED") return "Workspace access needs to be authorized again.";
  if (error.code === "READ_ONLY") return "This workspace is read-only.";
  if (error.code === "OFFLINE") return "The workspace provider is offline.";
  if (error.code === "UNSUPPORTED") return "This workspace does not support that operation.";
  if (error.code === "LIMIT_EXCEEDED") return "This workspace is too large to browse safely.";
  return error.message || "The workspace operation failed.";
}

export function browserCommandSuccess(): BrowserCommandResult {
  return Object.freeze({ ok: true, errorCode: null, error: null });
}

export function browserCommandFailure(
  error: string,
  errorCode: WorkspaceBrowserError["code"] | "CONFIRMATION_REQUIRED" | null = null,
): BrowserCommandResult {
  return Object.freeze({ ok: false, errorCode, error });
}
