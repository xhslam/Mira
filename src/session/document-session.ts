import type { DocumentId, SessionId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";

export const EDITOR_MODES = Object.freeze([
  "wysiwyg",
  "source",
  "reading",
  "tree",
  "table",
] as const);

export type EditorMode = (typeof EDITOR_MODES)[number];

export type SessionSelection = Readonly<{
  anchor: number;
  head: number;
}>;

export type ConfirmedSave = Readonly<{
  revision: number;
  contentHash: string;
  savedAt: string;
}>;

export type DocumentSession = Readonly<{
  sessionId: SessionId;
  documentId: DocumentId;
  revision: number;
  markdown: string;
  selection: SessionSelection;
  mode: EditorMode;
  baseFileHash: string | null;
  dirty: boolean;
  lastConfirmedSave: ConfirmedSave | null;
}>;

export type CreateDocumentSessionInput = Readonly<{
  sessionId: SessionId;
  documentId: DocumentId;
  markdown: string;
  selection: SessionSelection;
  mode: EditorMode;
  baseFileHash: string | null;
  lastConfirmedSave: ConfirmedSave | null;
}>;

export type EditorSnapshot = Readonly<{
  sessionId: SessionId;
  documentId: DocumentId;
  baseRevision: number;
  revision: number;
  markdown: string;
  selection: SessionSelection;
  mode: EditorMode;
}>;

export type SessionTransitionErrorCode =
  | "SESSION_MISMATCH"
  | "DOCUMENT_MISMATCH"
  | "STALE_BASE_REVISION"
  | "DUPLICATE_REVISION"
  | "NON_MONOTONIC_REVISION"
  | "UNSUPPORTED_MODE";

export type SessionTransitionError = Readonly<{
  code: SessionTransitionErrorCode;
}>;

export function isEditorMode(value: unknown): value is EditorMode {
  return typeof value === "string" && EDITOR_MODES.some((mode) => mode === value);
}

function cloneSelection(selection: SessionSelection): SessionSelection {
  return Object.freeze({ anchor: selection.anchor, head: selection.head });
}

function cloneConfirmedSave(save: ConfirmedSave | null): ConfirmedSave | null {
  if (save === null) {
    return null;
  }

  return Object.freeze({
    revision: save.revision,
    contentHash: save.contentHash,
    savedAt: save.savedAt,
  });
}

function transitionFailure(
  code: SessionTransitionErrorCode,
): Result<never, SessionTransitionError> {
  return failure(Object.freeze({ code }));
}

export function createDocumentSession(input: CreateDocumentSessionInput): DocumentSession {
  return Object.freeze({
    sessionId: input.sessionId,
    documentId: input.documentId,
    revision: 0,
    markdown: input.markdown,
    selection: cloneSelection(input.selection),
    mode: input.mode,
    baseFileHash: input.baseFileHash,
    dirty: false,
    lastConfirmedSave: cloneConfirmedSave(input.lastConfirmedSave),
  });
}

export function applyEditorSnapshot(
  session: DocumentSession,
  snapshot: EditorSnapshot,
): Result<DocumentSession, SessionTransitionError> {
  if (snapshot.sessionId !== session.sessionId) {
    return transitionFailure("SESSION_MISMATCH");
  }

  if (snapshot.documentId !== session.documentId) {
    return transitionFailure("DOCUMENT_MISMATCH");
  }

  if (snapshot.baseRevision !== session.revision) {
    return transitionFailure("STALE_BASE_REVISION");
  }

  if (snapshot.revision === session.revision) {
    return transitionFailure("DUPLICATE_REVISION");
  }

  if (snapshot.revision < session.revision) {
    return transitionFailure("NON_MONOTONIC_REVISION");
  }

  if (!isEditorMode(snapshot.mode)) {
    return transitionFailure("UNSUPPORTED_MODE");
  }

  const nextSession: DocumentSession = Object.freeze({
    sessionId: session.sessionId,
    documentId: session.documentId,
    revision: snapshot.revision,
    markdown: snapshot.markdown,
    selection: cloneSelection(snapshot.selection),
    mode: snapshot.mode,
    baseFileHash: session.baseFileHash,
    dirty: true,
    lastConfirmedSave: session.lastConfirmedSave,
  });

  return success(nextSession);
}
