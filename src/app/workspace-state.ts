import type { DocumentId, SessionId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import type {
  EditorDiagnostic,
  EditorEditMessage,
  EditorSelectionChangeMessage,
} from "../editor-bridge/editor-message";
import { applyTextChanges } from "../editor-bridge/text-change";
import { formatIdForPath, resolveFormatForPath } from "../formats/format-path";
import type { HistorySnapshot } from "../history/history-store";
import type { RecoveryDraft } from "../recovery/recovery-draft-store";
import type { EditorMode, SessionSelection } from "../session/document-session";
import type { WorkspaceDocumentSnapshot } from "../workspace/workspace-repository";

export type WorkspaceSaveState =
  "loading" | "editing" | "saving" | "saved" | "recovery-only" | "conflict" | "error";

export type OpenWorkspaceDocument = Readonly<{
  documentId: DocumentId;
  path: string;
  markdown: string;
  baseMarkdown: string | null;
  baseHash: string | null;
  revision: number;
  selection: SessionSelection;
  mode: EditorMode;
  formatId: string;
  dirty: boolean;
  recovered: boolean;
}>;

export type WorkspaceState = Readonly<{
  sessionId: SessionId;
  documents: readonly OpenWorkspaceDocument[];
  activeDocument: OpenWorkspaceDocument;
  saveState: WorkspaceSaveState;
  errorMessage: string | null;
  conflictSnapshot: WorkspaceDocumentSnapshot | null;
  diagnostics: readonly EditorDiagnostic[];
}>;

export type WorkspaceStateError = Readonly<{
  code:
    | "SESSION_MISMATCH"
    | "DOCUMENT_MISMATCH"
    | "STALE_REVISION"
    | "INVALID_CHANGE"
    | "UNSUPPORTED_MODE";
}>;

export type CreateWorkspaceStateInput = Readonly<{
  documents: readonly WorkspaceDocumentSnapshot[];
  recoveryDrafts: readonly RecoveryDraft[];
  sessionId: SessionId;
  blankDocumentId: DocumentId;
}>;

function freezeDocument(document: OpenWorkspaceDocument): OpenWorkspaceDocument {
  return Object.freeze({
    ...document,
    selection: Object.freeze({ ...document.selection }),
  });
}

function assertUniqueDocuments(
  documents: readonly OpenWorkspaceDocument[],
  activeDocument: OpenWorkspaceDocument,
): void {
  if (documents.length === 0) throw new Error("Workspace state must contain a document");
  const documentIds = new Set<DocumentId>();
  const paths = new Set<string>();
  let activeMatches = 0;
  for (const document of documents) {
    if (documentIds.has(document.documentId)) {
      throw new Error(`Workspace state contains duplicate document ID: ${document.documentId}`);
    }
    if (paths.has(document.path)) {
      throw new Error(`Workspace state contains duplicate document path: ${document.path}`);
    }
    documentIds.add(document.documentId);
    paths.add(document.path);
    if (document.documentId === activeDocument.documentId) activeMatches += 1;
  }
  if (activeMatches !== 1) {
    throw new Error("Workspace active document must occur exactly once in the document list");
  }
}

function replaceDocumentIdentity(
  documents: readonly OpenWorkspaceDocument[],
  previousDocumentId: DocumentId,
  replacement: OpenWorkspaceDocument,
): readonly OpenWorkspaceDocument[] {
  const next: OpenWorkspaceDocument[] = [];
  let inserted = false;
  for (const document of documents) {
    if (document.documentId === previousDocumentId) {
      if (!inserted) {
        next.push(replacement);
        inserted = true;
      }
      continue;
    }
    if (document.documentId === replacement.documentId || document.path === replacement.path) {
      continue;
    }
    next.push(document);
  }
  if (!inserted) next.push(replacement);
  return Object.freeze(next);
}

function freezeState(
  input: Omit<WorkspaceState, "documents" | "diagnostics"> & {
    documents: readonly OpenWorkspaceDocument[];
    diagnostics: readonly EditorDiagnostic[];
  },
): WorkspaceState {
  assertUniqueDocuments(input.documents, input.activeDocument);
  return Object.freeze({
    ...input,
    documents: Object.freeze([...input.documents]),
    diagnostics: Object.freeze([...input.diagnostics]),
  });
}

function fromSnapshot(
  document: WorkspaceDocumentSnapshot,
  recovery: RecoveryDraft | undefined,
): OpenWorkspaceDocument {
  const useRecovery = recovery !== undefined && recovery.markdown !== document.markdown;
  const formatId = formatIdForPath(document.path);
  return freezeDocument({
    documentId: document.documentId,
    path: document.path,
    markdown: useRecovery ? recovery.markdown : document.markdown,
    baseMarkdown: document.markdown,
    baseHash: document.contentHash,
    revision: useRecovery ? recovery.revision : 0,
    selection: Object.freeze({ anchor: 0, head: 0 }),
    mode: resolveFormatForPath(document.path).defaultView,
    formatId,
    dirty: useRecovery,
    recovered: useRecovery,
  });
}

function fromRecovery(draft: RecoveryDraft): OpenWorkspaceDocument {
  const formatId = formatIdForPath(draft.path);
  return freezeDocument({
    documentId: draft.documentId,
    path: draft.path,
    markdown: draft.markdown,
    baseMarkdown: null,
    baseHash: draft.baseHash,
    revision: draft.revision,
    selection: Object.freeze({ anchor: 0, head: 0 }),
    mode: resolveFormatForPath(draft.path).defaultView,
    formatId,
    dirty: true,
    recovered: true,
  });
}

export function createWorkspaceState(input: CreateWorkspaceStateInput): WorkspaceState {
  const recoveries = [...input.recoveryDrafts].sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    return updated === 0 ? right.revision - left.revision : updated;
  });
  const usedRecoveryDrafts = new Set<RecoveryDraft>();
  const documentIds = new Set<DocumentId>();
  const paths = new Set<string>();
  const documents: OpenWorkspaceDocument[] = [];

  for (const document of input.documents) {
    if (documentIds.has(document.documentId) || paths.has(document.path)) continue;
    const recovery = recoveries.find(
      (draft) =>
        !usedRecoveryDrafts.has(draft) &&
        (draft.documentId === document.documentId || draft.path === document.path),
    );
    if (recovery) usedRecoveryDrafts.add(recovery);
    documents.push(fromSnapshot(document, recovery));
    documentIds.add(document.documentId);
    paths.add(document.path);
  }

  for (const recovery of recoveries) {
    if (
      usedRecoveryDrafts.has(recovery) ||
      documentIds.has(recovery.documentId) ||
      paths.has(recovery.path)
    ) {
      continue;
    }
    documents.push(fromRecovery(recovery));
    documentIds.add(recovery.documentId);
    paths.add(recovery.path);
  }

  const blank = freezeDocument({
    documentId: input.blankDocumentId,
    path: "Untitled.md",
    markdown: "",
    baseMarkdown: "",
    baseHash: null,
    revision: 0,
    selection: Object.freeze({ anchor: 0, head: 0 }),
    mode: "wysiwyg",
    formatId: "markdown",
    dirty: false,
    recovered: false,
  });
  const openDocuments = documents.length > 0 ? documents : [blank];
  const activeDocument = openDocuments[0] ?? blank;
  const hasRecovery = openDocuments.some((document) => document.recovered);

  return freezeState({
    sessionId: input.sessionId,
    documents: openDocuments,
    activeDocument,
    saveState: hasRecovery ? "recovery-only" : "saved",
    errorMessage: null,
    conflictSnapshot: null,
    diagnostics: Object.freeze([]),
  });
}

export function applyWorkspaceSnapshot(
  state: WorkspaceState,
  message: EditorEditMessage,
): Result<WorkspaceState, WorkspaceStateError> {
  if (message.sessionId !== state.sessionId) {
    return failure(Object.freeze({ code: "SESSION_MISMATCH" }));
  }
  if (message.documentId !== state.activeDocument.documentId) {
    return failure(Object.freeze({ code: "DOCUMENT_MISMATCH" }));
  }
  if (
    message.baseRevision !== state.activeDocument.revision ||
    message.revision <= message.baseRevision
  ) {
    return failure(Object.freeze({ code: "STALE_REVISION" }));
  }
  if (!resolveFormatForPath(state.activeDocument.path).supportedViews.includes(message.mode)) {
    return failure(Object.freeze({ code: "UNSUPPORTED_MODE" }));
  }

  const markdown =
    message.type === "editor.snapshot"
      ? success(message.markdown)
      : applyTextChanges(state.activeDocument.markdown, message.changes);
  if (!markdown.ok) {
    return failure(Object.freeze({ code: "INVALID_CHANGE" }));
  }

  const activeDocument = freezeDocument({
    ...state.activeDocument,
    markdown: markdown.value,
    revision: message.revision,
    selection: message.selection,
    mode: message.mode,
    dirty: true,
  });
  const unresolvedConflict = state.saveState === "conflict" && state.conflictSnapshot !== null;
  return success(
    freezeState({
      ...state,
      documents: state.documents.map((document) =>
        document.documentId === activeDocument.documentId ? activeDocument : document,
      ),
      activeDocument,
      saveState: unresolvedConflict ? "conflict" : "editing",
      errorMessage: unresolvedConflict ? state.errorMessage : null,
      conflictSnapshot: unresolvedConflict ? state.conflictSnapshot : null,
    }),
  );
}

export function markWorkspaceSaving(state: WorkspaceState): WorkspaceState {
  return freezeState({ ...state, saveState: "saving", errorMessage: null });
}

export function applyWorkspaceSelectionChange(
  state: WorkspaceState,
  message: EditorSelectionChangeMessage,
): Result<WorkspaceState, WorkspaceStateError> {
  if (message.sessionId !== state.sessionId) {
    return failure(Object.freeze({ code: "SESSION_MISMATCH" }));
  }
  if (message.documentId !== state.activeDocument.documentId) {
    return failure(Object.freeze({ code: "DOCUMENT_MISMATCH" }));
  }

  const range = message.ranges[0];
  if (!range) return success(state);
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    selection: Object.freeze({ anchor: range.anchor, head: range.head }),
  });
  return success(
    freezeState({
      ...state,
      documents: state.documents.map((document) =>
        document.documentId === activeDocument.documentId ? activeDocument : document,
      ),
      activeDocument,
    }),
  );
}

export function setWorkspaceSelection(
  state: WorkspaceState,
  selection: Readonly<{ anchor: number; head: number }>,
): WorkspaceState {
  const length = state.activeDocument.markdown.length;
  const normalized = Object.freeze({
    anchor: Math.max(0, Math.min(selection.anchor, length)),
    head: Math.max(0, Math.min(selection.head, length)),
  });
  const activeDocument = freezeDocument({ ...state.activeDocument, selection: normalized });
  return freezeState({
    ...state,
    activeDocument,
    documents: state.documents.map((document) =>
      document.documentId === activeDocument.documentId ? activeDocument : document,
    ),
  });
}

export function applyWorkspaceDiagnostics(
  state: WorkspaceState,
  documentId: DocumentId,
  diagnostics: readonly EditorDiagnostic[],
): WorkspaceState {
  const scoped =
    documentId === state.activeDocument.documentId
      ? Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })))
      : state.diagnostics;
  return freezeState({
    ...state,
    diagnostics: scoped,
  });
}

export function confirmWorkspaceSave(
  state: WorkspaceState,
  saved: WorkspaceDocumentSnapshot,
): WorkspaceState {
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    documentId: saved.documentId,
    path: saved.path,
    markdown: saved.markdown,
    baseMarkdown: saved.markdown,
    baseHash: saved.contentHash,
    dirty: false,
    recovered: false,
  });
  return freezeState({
    ...state,
    documents: replaceDocumentIdentity(
      state.documents,
      state.activeDocument.documentId,
      activeDocument,
    ),
    activeDocument,
    saveState: "saved",
    errorMessage: null,
    conflictSnapshot: null,
  });
}

export function acknowledgeWorkspaceSave(
  state: WorkspaceState,
  saved: WorkspaceDocumentSnapshot,
  savedRevision: number,
): WorkspaceState {
  if (state.activeDocument.revision === savedRevision) {
    return confirmWorkspaceSave(state, saved);
  }

  const previousDocumentId = state.activeDocument.documentId;
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    documentId: saved.documentId,
    path: saved.path,
    baseHash: saved.contentHash,
    baseMarkdown: saved.markdown,
    dirty: true,
  });
  return freezeState({
    ...state,
    documents: replaceDocumentIdentity(state.documents, previousDocumentId, activeDocument),
    activeDocument,
    saveState: "editing",
    errorMessage: null,
    conflictSnapshot: null,
  });
}

export type WorkspaceSaveCompletionPlan = Readonly<{
  state: WorkspaceState;
  recoveryDocument: OpenWorkspaceDocument | null;
  removeRecoveryDocumentIds: readonly DocumentId[];
}>;

/**
 * Plans recovery-journal updates after a verified filesystem save. If a newer
 * editor revision arrived while the older revision was being written, the
 * newer draft must replace the journal before any obsolete identity is
 * removed. This closes the kill window between an old save acknowledgement and
 * its catch-up save.
 */
export function planWorkspaceSaveCompletion(
  state: WorkspaceState,
  saved: WorkspaceDocumentSnapshot,
  savedRevision: number,
  previousDocumentId: DocumentId,
): WorkspaceSaveCompletionPlan {
  const acknowledged = acknowledgeWorkspaceSave(state, saved, savedRevision);
  if (acknowledged.activeDocument.dirty) {
    return Object.freeze({
      state: acknowledged,
      recoveryDocument: acknowledged.activeDocument,
      removeRecoveryDocumentIds: Object.freeze(
        previousDocumentId === acknowledged.activeDocument.documentId ? [] : [previousDocumentId],
      ),
    });
  }
  return Object.freeze({
    state: acknowledged,
    recoveryDocument: null,
    removeRecoveryDocumentIds: Object.freeze([
      ...new Set([previousDocumentId, acknowledged.activeDocument.documentId]),
    ]),
  });
}

export function failWorkspaceSave(state: WorkspaceState, code: string): WorkspaceState {
  const conflict = code === "EXTERNAL_MODIFICATION";
  return freezeState({
    ...state,
    saveState: conflict ? "conflict" : "recovery-only",
    errorMessage: conflict
      ? "This note changed outside the app. Your local text is preserved for conflict review."
      : "The workspace write failed. Your recovery draft is still available.",
  });
}

export function failEditorFlush(state: WorkspaceState): WorkspaceState {
  return freezeState({
    ...state,
    saveState: "recovery-only",
    errorMessage:
      "The editor could not confirm its latest changes. Keep the app open and retry save.",
  });
}

export function setWorkspaceConflictSnapshot(
  state: WorkspaceState,
  snapshot: WorkspaceDocumentSnapshot,
): WorkspaceState {
  return freezeState({
    ...state,
    saveState: "conflict",
    conflictSnapshot: Object.freeze({ ...snapshot }),
    errorMessage: "This note changed outside the app. Review the external version before saving.",
  });
}

export function loadWorkspaceConflictSnapshot(
  state: WorkspaceState,
  snapshot: WorkspaceDocumentSnapshot,
): WorkspaceState {
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    markdown: snapshot.markdown,
    baseMarkdown: snapshot.markdown,
    baseHash: snapshot.contentHash,
    revision: state.activeDocument.revision + 1,
    selection: Object.freeze({ anchor: 0, head: 0 }),
    dirty: false,
    recovered: false,
  });
  return freezeState({
    ...state,
    documents: state.documents.map((document) =>
      document.documentId === activeDocument.documentId ? activeDocument : document,
    ),
    activeDocument,
    saveState: "saved",
    errorMessage: null,
    conflictSnapshot: null,
  });
}

export function createConflictCopyPath(path: string, occupiedPaths: readonly string[]): string {
  const markdownSuffix = /\.md$/i.test(path) ? path.slice(-3) : ".md";
  const base = /\.md$/i.test(path) ? path.slice(0, -3) : path;
  const occupied = new Set(occupiedPaths);
  let sequence = 1;
  let candidate = `${base} (local copy)${markdownSuffix}`;
  while (occupied.has(candidate)) {
    sequence += 1;
    candidate = `${base} (local copy ${sequence})${markdownSuffix}`;
  }
  return candidate;
}

export function resolveWorkspaceConflictAsCopy(
  state: WorkspaceState,
  external: WorkspaceDocumentSnapshot,
  savedCopy: WorkspaceDocumentSnapshot,
): WorkspaceState {
  const externalDocument = fromSnapshot(external, undefined);
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    documentId: savedCopy.documentId,
    path: savedCopy.path,
    markdown: savedCopy.markdown,
    baseMarkdown: savedCopy.markdown,
    baseHash: savedCopy.contentHash,
    dirty: false,
    recovered: false,
  });
  return freezeState({
    ...state,
    documents: [
      ...replaceDocumentIdentity(
        state.documents,
        state.activeDocument.documentId,
        externalDocument,
      ).filter(
        (document) =>
          document.documentId !== activeDocument.documentId &&
          document.path !== activeDocument.path,
      ),
      activeDocument,
    ],
    activeDocument,
    saveState: "saved",
    errorMessage: null,
    conflictSnapshot: null,
  });
}

export function setWorkspaceMode(state: WorkspaceState, mode: EditorMode): WorkspaceState {
  if (!resolveFormatForPath(state.activeDocument.path).supportedViews.includes(mode)) return state;
  const activeDocument = freezeDocument({ ...state.activeDocument, mode });
  return freezeState({
    ...state,
    documents: state.documents.map((document) =>
      document.documentId === activeDocument.documentId ? activeDocument : document,
    ),
    activeDocument,
  });
}

export function restoreWorkspaceHistorySnapshot(
  state: WorkspaceState,
  snapshot: HistorySnapshot,
): Result<WorkspaceState, WorkspaceStateError> {
  if (snapshot.documentId !== state.activeDocument.documentId) {
    return failure(Object.freeze({ code: "DOCUMENT_MISMATCH" }));
  }

  const selectionOffset = Math.min(state.activeDocument.selection.head, snapshot.markdown.length);
  const activeDocument = freezeDocument({
    ...state.activeDocument,
    markdown: snapshot.markdown,
    revision: state.activeDocument.revision + 1,
    selection: Object.freeze({ anchor: selectionOffset, head: selectionOffset }),
    dirty: true,
    recovered: false,
  });
  return success(
    freezeState({
      ...state,
      documents: state.documents.map((document) =>
        document.documentId === activeDocument.documentId ? activeDocument : document,
      ),
      activeDocument,
      saveState: "editing",
      errorMessage: null,
    }),
  );
}

export function selectWorkspaceDocument(
  state: WorkspaceState,
  documentId: DocumentId,
): WorkspaceState {
  const activeDocument = state.documents.find((document) => document.documentId === documentId);
  return activeDocument
    ? freezeState({
        ...state,
        activeDocument,
        saveState: activeDocument.dirty ? "editing" : "saved",
        errorMessage: null,
      })
    : state;
}

export function selectWorkspaceDocumentByPath(state: WorkspaceState, path: string): WorkspaceState {
  const document = state.documents.find((candidate) => candidate.path === path);
  return document ? selectWorkspaceDocument(state, document.documentId) : state;
}

export function pathAfterBrowserMutation(
  activePath: string,
  sourcePath: string,
  destinationPath: string | null,
): string | null {
  if (activePath !== sourcePath && !activePath.startsWith(`${sourcePath}/`)) return activePath;
  if (destinationPath === null) return null;
  return `${destinationPath}${activePath.slice(sourcePath.length)}`;
}

export function addBlankWorkspaceDocument(
  state: WorkspaceState,
  documentId: DocumentId,
): WorkspaceState {
  const paths = new Set(state.documents.map((document) => document.path));
  let sequence = 1;
  let path = "Untitled.md";
  while (paths.has(path)) {
    sequence += 1;
    path = `Untitled ${sequence}.md`;
  }

  const activeDocument = freezeDocument({
    documentId,
    path,
    markdown: "",
    baseMarkdown: "",
    baseHash: null,
    revision: 0,
    selection: Object.freeze({ anchor: 0, head: 0 }),
    mode: "wysiwyg",
    formatId: formatIdForPath(path),
    dirty: false,
    recovered: false,
  });
  return freezeState({
    ...state,
    documents: [...state.documents, activeDocument],
    activeDocument,
    saveState: "saved",
    errorMessage: null,
  });
}
