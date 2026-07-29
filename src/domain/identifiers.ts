import { failure, type Result, success } from "./result";

declare const workspaceIdBrand: unique symbol;
declare const documentIdBrand: unique symbol;
declare const sessionIdBrand: unique symbol;

export type WorkspaceId = string & Readonly<{ [workspaceIdBrand]: "WorkspaceId" }>;
export type DocumentId = string & Readonly<{ [documentIdBrand]: "DocumentId" }>;
export type SessionId = string & Readonly<{ [sessionIdBrand]: "SessionId" }>;

export type IdentifierKind = "workspace" | "document" | "session";

export type IdentifierError = Readonly<{
  code: "INVALID_IDENTIFIER";
  kind: IdentifierKind;
  input: string | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidIdentifier(kind: IdentifierKind, input: unknown): IdentifierError {
  return Object.freeze({
    code: "INVALID_IDENTIFIER",
    kind,
    input: typeof input === "string" ? input : null,
  });
}

export function parseWorkspaceId(input: unknown): Result<WorkspaceId, IdentifierError> {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) {
    return failure(invalidIdentifier("workspace", input));
  }

  return success(input as WorkspaceId);
}

export function parseDocumentId(input: unknown): Result<DocumentId, IdentifierError> {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) {
    return failure(invalidIdentifier("document", input));
  }

  return success(input as DocumentId);
}

export function parseSessionId(input: unknown): Result<SessionId, IdentifierError> {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) {
    return failure(invalidIdentifier("session", input));
  }

  return success(input as SessionId);
}
