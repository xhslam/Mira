import { describe, expect, test } from "vitest";

import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import type { RecoveryDraft } from "../../../src/recovery/recovery-draft-store";
import type { HistorySnapshot } from "../../../src/history/history-store";
import {
  acknowledgeWorkspaceSave,
  addBlankWorkspaceDocument,
  applyWorkspaceDiagnostics,
  applyWorkspaceSelectionChange,
  applyWorkspaceSnapshot,
  confirmWorkspaceSave,
  createWorkspaceState,
  failWorkspaceSave,
  failEditorFlush,
  markWorkspaceSaving,
  planWorkspaceSaveCompletion,
  loadWorkspaceConflictSnapshot,
  setWorkspaceConflictSnapshot,
  createConflictCopyPath,
  resolveWorkspaceConflictAsCopy,
  selectWorkspaceDocumentByPath,
  pathAfterBrowserMutation,
  restoreWorkspaceHistorySnapshot,
  setWorkspaceMode,
} from "../../../src/app/workspace-state";
import type { EditorSnapshotMessage } from "../../../src/editor-bridge/editor-message";
import type { WorkspaceDocumentSnapshot } from "../../../src/workspace/workspace-repository";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001" as SessionId;
const SECOND_DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174002" as DocumentId;
const THIRD_DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174003" as DocumentId;

const document: WorkspaceDocumentSnapshot = Object.freeze({
  documentId: DOCUMENT_ID,
  path: "Notes.md" as WorkspaceDocumentSnapshot["path"],
  markdown: "saved",
  contentHash: "hash:saved",
});

function recovery(markdown: string): RecoveryDraft {
  return Object.freeze({
    documentId: DOCUMENT_ID,
    path: "Notes.md",
    markdown,
    revision: 4,
    baseHash: "hash:saved",
    updatedAt: "2026-07-30T10:00:00.000Z",
  });
}

describe("workspace state", () => {
  test("collapses duplicate snapshots and recovery rows before rendering tabs", () => {
    const newerRecovery = Object.freeze({
      ...recovery("newest recovered edit"),
      revision: 6,
      updatedAt: "2026-07-30T12:00:00.000Z",
    });
    const state = createWorkspaceState({
      documents: [document, Object.freeze({ ...document })],
      recoveryDrafts: [recovery("stale recovered edit"), newerRecovery],
      sessionId: SESSION_ID,
      blankDocumentId: THIRD_DOCUMENT_ID,
    });

    expect(state.documents).toHaveLength(1);
    expect(state.activeDocument).toMatchObject({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "newest recovered edit",
      revision: 6,
    });
  });

  test("reattaches a temporary recovery identity to the persisted document path", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [
        Object.freeze({
          ...recovery("edit saved during an interrupted identity transition"),
          documentId: SECOND_DOCUMENT_ID,
          revision: 7,
        }),
      ],
      sessionId: SESSION_ID,
      blankDocumentId: THIRD_DOCUMENT_ID,
    });

    expect(state.documents).toHaveLength(1);
    expect(state.activeDocument).toMatchObject({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "edit saved during an interrupted identity transition",
      revision: 7,
      dirty: true,
    });
  });

  test("restores a newer draft instead of silently discarding it", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("recovered edit")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    expect(state.activeDocument.markdown).toBe("recovered edit");
    expect(state.activeDocument.revision).toBe(4);
    expect(state.activeDocument.dirty).toBe(true);
    expect(state.saveState).toBe("recovery-only");
  });

  test("restores a legacy extensionless note in WYSIWYG Markdown mode", () => {
    const state = createWorkspaceState({
      documents: [
        Object.freeze({
          ...document,
          path: "备考" as WorkspaceDocumentSnapshot["path"],
        }),
      ],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    expect(state.activeDocument).toMatchObject({
      path: "备考",
      formatId: "markdown",
      mode: "wysiwyg",
    });
  });

  test("applies a matching editor revision immutably", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const message: EditorSnapshotMessage = Object.freeze({
      protocolVersion: 1,
      type: "editor.snapshot",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 0,
      revision: 1,
      mode: "source",
      markdown: "edited",
      selection: Object.freeze({ anchor: 6, head: 6 }),
    });

    const next = applyWorkspaceSnapshot(state, message);

    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error("snapshot failed");
    expect(next.value).not.toBe(state);
    expect(next.value.activeDocument.markdown).toBe("edited");
    expect(next.value.activeDocument.mode).toBe("source");
    expect(next.value.saveState).toBe("editing");
    expect(state.activeDocument.markdown).toBe("saved");
  });

  test("rejects bridge snapshots whose mode is unsupported by the active format", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    expect(
      applyWorkspaceSnapshot(state, {
        protocolVersion: 1,
        type: "editor.snapshot",
        sessionId: SESSION_ID,
        documentId: DOCUMENT_ID,
        baseRevision: 0,
        revision: 1,
        mode: "tree",
        markdown: "edited",
        selection: { anchor: 0, head: 0 },
      }),
    ).toEqual({ ok: false, error: { code: "UNSUPPORTED_MODE" } });
  });

  test("keeps Tree and Table for structured documents but rejects them for Markdown", () => {
    const markdownState = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    expect(setWorkspaceMode(markdownState, "tree")).toBe(markdownState);
    expect(setWorkspaceMode(markdownState, "reading").activeDocument.mode).toBe("reading");

    const jsonState = createWorkspaceState({
      documents: [
        Object.freeze({
          ...document,
          path: "data.json" as WorkspaceDocumentSnapshot["path"],
          markdown: '{"name":"Mira"}',
        }),
      ],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    expect(setWorkspaceMode(jsonState, "table").activeDocument.mode).toBe("table");
    expect(setWorkspaceMode(jsonState, "tree").activeDocument.mode).toBe("tree");
    expect(setWorkspaceMode(jsonState, "wysiwyg")).toBe(jsonState);
  });

  test("applies an incremental editor change immutably", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const next = applyWorkspaceSnapshot(state, {
      protocolVersion: 1,
      type: "document.change",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 0,
      revision: 1,
      mode: "source",
      changes: [{ from: 5, to: 5, insert: " incrementally" }],
      selection: { anchor: 19, head: 19 },
    });

    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error("change failed");
    expect(next.value.activeDocument.markdown).toBe("saved incrementally");
    expect(state.activeDocument.markdown).toBe("saved");
  });

  test("rejects an out-of-range incremental change without altering state", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const next = applyWorkspaceSnapshot(state, {
      protocolVersion: 1,
      type: "document.change",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 0,
      revision: 1,
      mode: "source",
      changes: [{ from: 0, to: 99, insert: "bad" }],
      selection: { anchor: 3, head: 3 },
    });

    expect(next).toEqual({ ok: false, error: { code: "INVALID_CHANGE" } });
    expect(state.activeDocument.markdown).toBe("saved");
  });

  test("reports Saved only after the verified snapshot is confirmed", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const saving = markWorkspaceSaving(state);
    const confirmed = confirmWorkspaceSave(saving, {
      ...document,
      markdown: "saved again",
      contentHash: "hash:saved-again",
    });

    expect(saving.saveState).toBe("saving");
    expect(confirmed.saveState).toBe("saved");
    expect(confirmed.activeDocument.dirty).toBe(false);
    expect(confirmed.activeDocument.baseHash).toBe("hash:saved-again");
  });

  test("merges an identity transition with an already open persisted document", () => {
    const persisted = Object.freeze({
      ...document,
      documentId: SECOND_DOCUMENT_ID,
      path: "Persisted.md" as WorkspaceDocumentSnapshot["path"],
    });
    const state = createWorkspaceState({
      documents: [document, persisted],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: THIRD_DOCUMENT_ID,
    });

    const confirmed = confirmWorkspaceSave(state, {
      ...persisted,
      markdown: "saved through temporary tab",
      contentHash: "hash:transition",
    });

    expect(confirmed.documents).toHaveLength(1);
    expect(confirmed.activeDocument).toMatchObject({
      documentId: SECOND_DOCUMENT_ID,
      path: "Persisted.md",
      markdown: "saved through temporary tab",
    });
  });

  test("keeps newer edits dirty when an older revision finishes saving", () => {
    const initial = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("revision four")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const newer = applyWorkspaceSnapshot(initial, {
      protocolVersion: 1,
      type: "editor.snapshot",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 4,
      revision: 5,
      mode: "wysiwyg",
      markdown: "revision five",
      selection: { anchor: 13, head: 13 },
    });
    if (!newer.ok) throw new Error("snapshot failed");

    const acknowledged = acknowledgeWorkspaceSave(
      newer.value,
      { ...document, markdown: "revision four", contentHash: "hash:revision-four" },
      4,
    );

    expect(acknowledged.activeDocument.markdown).toBe("revision five");
    expect(acknowledged.activeDocument.baseHash).toBe("hash:revision-four");
    expect(acknowledged.activeDocument.dirty).toBe(true);
    expect(acknowledged.saveState).toBe("editing");
  });

  test("rewrites the latest recovery draft before an older save can clear it", () => {
    const initial = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("revision four")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const newer = applyWorkspaceSnapshot(initial, {
      protocolVersion: 1,
      type: "editor.snapshot",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 4,
      revision: 5,
      mode: "source",
      markdown: "revision five",
      selection: { anchor: 13, head: 13 },
    });
    if (!newer.ok) throw new Error("snapshot failed");

    const completion = planWorkspaceSaveCompletion(
      newer.value,
      { ...document, markdown: "revision four", contentHash: "hash:revision-four" },
      4,
      DOCUMENT_ID,
    );

    expect(completion.state.activeDocument.markdown).toBe("revision five");
    expect(completion.recoveryDocument).toMatchObject({
      documentId: DOCUMENT_ID,
      markdown: "revision five",
      revision: 5,
      baseHash: "hash:revision-four",
      dirty: true,
    });
    expect(completion.removeRecoveryDocumentIds).toEqual([]);
  });

  test("clears both temporary and persisted identities only after a clean save", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const completion = planWorkspaceSaveCompletion(
      state,
      { ...document, documentId: SECOND_DOCUMENT_ID },
      0,
      DOCUMENT_ID,
    );

    expect(completion.recoveryDocument).toBeNull();
    expect(completion.removeRecoveryDocumentIds).toEqual([DOCUMENT_ID, SECOND_DOCUMENT_ID]);
    expect(completion.state.saveState).toBe("saved");
  });

  test("keeps dirty text and exposes conflicts", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("local")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const failed = failWorkspaceSave(state, "EXTERNAL_MODIFICATION");

    expect(failed.saveState).toBe("conflict");
    expect(failed.activeDocument.markdown).toBe("local");
    expect(failed.errorMessage).toContain("changed outside");
  });

  test("does not report saved when the editor cannot confirm a flush", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("unconfirmed local")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const failed = failEditorFlush(state);

    expect(failed.saveState).toBe("recovery-only");
    expect(failed.activeDocument.markdown).toBe("unconfirmed local");
    expect(failed.errorMessage).toContain("could not confirm");
  });

  test("stores an external version for explicit conflict review and can load it cleanly", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("local")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const external = { ...document, markdown: "external", contentHash: "hash:external" };
    const conflicted = setWorkspaceConflictSnapshot(state, external);
    const loaded = loadWorkspaceConflictSnapshot(conflicted, external);

    expect(conflicted.conflictSnapshot?.markdown).toBe("external");
    expect(loaded.activeDocument.markdown).toBe("external");
    expect(loaded.activeDocument.dirty).toBe(false);
    expect(loaded.saveState).toBe("saved");
    expect(loaded.conflictSnapshot).toBeNull();
  });

  test("keeps conflict resolution active while accepting newer local edits", () => {
    const base = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("local")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const external = { ...document, markdown: "external", contentHash: "hash:external" };
    const conflicted = setWorkspaceConflictSnapshot(base, external);

    const edited = applyWorkspaceSnapshot(conflicted, {
      protocolVersion: 1,
      type: "editor.snapshot",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 4,
      revision: 5,
      mode: "source",
      markdown: "newer local",
      selection: { anchor: 11, head: 11 },
    });

    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error("snapshot failed");
    expect(edited.value.saveState).toBe("conflict");
    expect(edited.value.conflictSnapshot?.markdown).toBe("external");
    expect(edited.value.activeDocument.markdown).toBe("newer local");
  });

  test("creates a collision-free local conflict copy path", () => {
    expect(createConflictCopyPath("notes/Plan.md", ["notes/Plan (local copy).md"])).toBe(
      "notes/Plan (local copy 2).md",
    );
    expect(createConflictCopyPath("README", [])).toBe("README (local copy).md");
  });

  test("keeps the external original and local copy as separate documents", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [recovery("local")],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const external = { ...document, markdown: "external", contentHash: "hash:external" };
    const copy = {
      ...document,
      documentId: SECOND_DOCUMENT_ID,
      path: "Notes (local copy).md" as WorkspaceDocumentSnapshot["path"],
      markdown: "local",
      contentHash: "hash:local",
    };

    const resolved = resolveWorkspaceConflictAsCopy(state, external, copy);

    expect(resolved.documents.map((item) => [item.documentId, item.path])).toEqual([
      [DOCUMENT_ID, "Notes.md"],
      [SECOND_DOCUMENT_ID, "Notes (local copy).md"],
    ]);
    expect(resolved.activeDocument.documentId).toBe(SECOND_DOCUMENT_ID);
    expect(resolved.activeDocument.markdown).toBe("local");
    expect(resolved.saveState).toBe("saved");
  });

  test("opens a collision-free blank tab without creating a file", () => {
    const state = createWorkspaceState({
      documents: [
        document,
        {
          ...document,
          documentId: SECOND_DOCUMENT_ID,
          path: "Untitled.md" as WorkspaceDocumentSnapshot["path"],
        },
      ],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const next = addBlankWorkspaceDocument(state, THIRD_DOCUMENT_ID);

    expect(next.activeDocument.path).toBe("Untitled 2.md");
    expect(next.activeDocument.baseHash).toBeNull();
    expect(next.activeDocument.dirty).toBe(false);
    expect(next.documents).toHaveLength(3);
  });

  test("selects a reloaded document by path without mutating the prior state", () => {
    const state = createWorkspaceState({
      documents: [
        document,
        Object.freeze({
          ...document,
          documentId: SECOND_DOCUMENT_ID,
          path: "Guides/Start.md" as WorkspaceDocumentSnapshot["path"],
        }),
      ],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: THIRD_DOCUMENT_ID,
    });

    const selected = selectWorkspaceDocumentByPath(state, "Guides/Start.md");

    expect(selected.activeDocument.documentId).toBe(SECOND_DOCUMENT_ID);
    expect(state.activeDocument.documentId).toBe(DOCUMENT_ID);
  });

  test("preserves or translates the active path after browser mutations", () => {
    expect(pathAfterBrowserMutation("notes/current.md", "other.md", "renamed.md")).toBe(
      "notes/current.md",
    );
    expect(pathAfterBrowserMutation("notes/current.md", "notes", "archive")).toBe(
      "archive/current.md",
    );
    expect(pathAfterBrowserMutation("notes/current.md", "notes/current.md", "renamed.md")).toBe(
      "renamed.md",
    );
    expect(pathAfterBrowserMutation("notes/current.md", "notes", null)).toBeNull();
    expect(pathAfterBrowserMutation("notes/current.md", "other", null)).toBe("notes/current.md");
  });

  test("restores history as a new dirty revision without overwriting the saved base", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const snapshot: HistorySnapshot = Object.freeze({
      snapshotId: "snapshot-1",
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "older",
      contentHash: "hash:older",
      createdAt: "2026-07-30T09:00:00.000Z",
      source: "manual",
      metadataOnly: false,
    });

    const restored = restoreWorkspaceHistorySnapshot(state, snapshot);

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("restore failed");
    expect(restored.value).not.toBe(state);
    expect(restored.value.activeDocument.markdown).toBe("older");
    expect(restored.value.activeDocument.revision).toBe(1);
    expect(restored.value.activeDocument.baseHash).toBe("hash:saved");
    expect(restored.value.activeDocument.dirty).toBe(true);
    expect(restored.value.saveState).toBe("editing");
    expect(state.activeDocument.markdown).toBe("saved");
  });

  test("rejects history from another document", () => {
    const state = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const restored = restoreWorkspaceHistorySnapshot(state, {
      snapshotId: "snapshot-2",
      documentId: SECOND_DOCUMENT_ID,
      path: "Other.md",
      markdown: "other",
      contentHash: "hash:other",
      createdAt: "2026-07-30T08:00:00.000Z",
      source: "auto",
      metadataOnly: false,
    });

    expect(restored).toEqual({ ok: false, error: { code: "DOCUMENT_MISMATCH" } });
  });
});

describe("workspace state protocol consumers", () => {
  function freshState() {
    return createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
  }

  test("applies selection.change to the active document", () => {
    const state = freshState();
    const result = applyWorkspaceSelectionChange(state, {
      protocolVersion: 1,
      type: "selection.change",
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      revision: 1,
      ranges: [{ anchor: 2, head: 5 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("selection change failed");
    expect(result.value.activeDocument.selection).toEqual({ anchor: 2, head: 5 });
    expect(Object.isFrozen(result.value.activeDocument.selection)).toBe(true);
  });

  test("rejects selection.change for another session or document", () => {
    const state = freshState();
    expect(
      applyWorkspaceSelectionChange(state, {
        protocolVersion: 1,
        type: "selection.change",
        sessionId: "123e4567-e89b-42d3-a456-426614174009" as SessionId,
        documentId: DOCUMENT_ID,
        revision: 1,
        ranges: [{ anchor: 0, head: 1 }],
      }),
    ).toEqual({ ok: false, error: { code: "SESSION_MISMATCH" } });
    expect(
      applyWorkspaceSelectionChange(state, {
        protocolVersion: 1,
        type: "selection.change",
        sessionId: SESSION_ID,
        documentId: SECOND_DOCUMENT_ID,
        revision: 1,
        ranges: [{ anchor: 0, head: 1 }],
      }),
    ).toEqual({ ok: false, error: { code: "DOCUMENT_MISMATCH" } });
  });

  test("stores diagnostics scoped to the active document", () => {
    const state = freshState();
    const next = applyWorkspaceDiagnostics(state, DOCUMENT_ID, [
      { from: 0, to: 4, severity: "warning", message: "Check heading" },
    ]);

    expect(next.diagnostics).toEqual([
      { from: 0, to: 4, severity: "warning", message: "Check heading" },
    ]);
    expect(Object.isFrozen(next.diagnostics)).toBe(true);
    expect(Object.isFrozen(next.diagnostics[0])).toBe(true);
  });

  test("ignores diagnostics for an inactive document", () => {
    const state = freshState();
    const next = applyWorkspaceDiagnostics(state, SECOND_DOCUMENT_ID, [
      { from: 0, to: 2, severity: "error", message: "Broken" },
    ]);

    expect(next.diagnostics).toEqual([]);
  });
});
