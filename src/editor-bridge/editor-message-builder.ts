import type { DocumentId, SessionId } from "../domain/identifiers";
import type { EditorMode } from "../session/document-session";
import type { TextChange } from "./text-change";
import {
  EDITOR_PROTOCOL_VERSION,
  type EditorChangeMessage,
  type EditorDiagnostic,
  type EditorDiagnosticsUpdateMessage,
  type EditorDocumentOpenMessage,
  type EditorReadyMessage,
  type EditorSavedMessage,
  type EditorSelectionChangeMessage,
  type EditorSnapshotMessage,
  type EditorSelection,
} from "./editor-message";

export type EditorEnvelopeInput = Readonly<{
  sessionId: string;
  documentId: string;
}>;

function freezeSelection(selection: EditorSelection): EditorSelection {
  return Object.freeze({ anchor: selection.anchor, head: selection.head });
}

function sessionId(value: string): SessionId {
  return value as SessionId;
}

function documentId(value: string): DocumentId {
  return value as DocumentId;
}

export function createEditorReadyMessage(input: EditorEnvelopeInput): EditorReadyMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "editor.ready",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
  });
}

export function createEditorDocumentOpenMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      revision: number;
      content: string;
      view: EditorMode;
      selection: EditorSelection;
    }>,
): EditorDocumentOpenMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "document.open",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    revision: input.revision,
    content: input.content,
    view: input.view,
    selection: freezeSelection(input.selection),
  });
}

export function createEditorSnapshotMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      baseRevision: number;
      revision: number;
      mode: EditorMode;
      markdown: string;
      selection: EditorSelection;
    }>,
): EditorSnapshotMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "editor.snapshot",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    baseRevision: input.baseRevision,
    revision: input.revision,
    mode: input.mode,
    markdown: input.markdown,
    selection: freezeSelection(input.selection),
  });
}

export function createEditorChangeMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      baseRevision: number;
      revision: number;
      mode: EditorMode;
      changes: readonly TextChange[];
      selection: EditorSelection;
    }>,
): EditorChangeMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "document.change",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    baseRevision: input.baseRevision,
    revision: input.revision,
    mode: input.mode,
    changes: Object.freeze(input.changes.map((change) => Object.freeze({ ...change }))),
    selection: freezeSelection(input.selection),
  });
}

export function createEditorSavedMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      revision: number;
      contentHash: string;
    }>,
): EditorSavedMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "document.saved",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    revision: input.revision,
    contentHash: input.contentHash,
  });
}

export function createEditorSelectionChangeMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      revision: number;
      ranges: readonly EditorSelection[];
    }>,
): EditorSelectionChangeMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "selection.change",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    revision: input.revision,
    ranges: Object.freeze(input.ranges.map((range) => freezeSelection(range))),
  });
}

export function createEditorDiagnosticsUpdateMessage(
  input: EditorEnvelopeInput &
    Readonly<{
      revision: number;
      items: readonly EditorDiagnostic[];
    }>,
): EditorDiagnosticsUpdateMessage {
  return Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    type: "diagnostics.update",
    sessionId: sessionId(input.sessionId),
    documentId: documentId(input.documentId),
    revision: input.revision,
    items: Object.freeze(input.items.map((item) => Object.freeze({ ...item }))),
  });
}
