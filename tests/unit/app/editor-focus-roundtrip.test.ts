import { describe, expect, test } from "vitest";

import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import { applyWorkspaceSnapshot, createWorkspaceState } from "../../../src/app/workspace-state";
import {
  assembleDocumentOpenTransfer,
  createDocumentOpenTransfer,
} from "../../../src/editor-bridge/document-open-transfer";
import { createEditorSnapshotMessage } from "../../../src/editor-bridge/editor-message-builder";
import { shouldApplyIncomingSelection } from "../../../src/editor-kernel/editor-focus-policy";
import type { WorkspaceDocumentSnapshot } from "../../../src/workspace/workspace-repository";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001" as SessionId;

const document: WorkspaceDocumentSnapshot = Object.freeze({
  documentId: DOCUMENT_ID,
  path: "Notes.md" as WorkspaceDocumentSnapshot["path"],
  markdown: "# Hello",
  contentHash: "hash:hello",
});

describe("editor snapshot echo round trip", () => {
  test("a typed revision applies once and its echo never changes native state", () => {
    const initial = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });

    const typed = "Hello 世界";
    const message = createEditorSnapshotMessage({
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      baseRevision: 0,
      revision: 1,
      mode: "wysiwyg",
      markdown: typed,
      selection: Object.freeze({ anchor: 6, head: 6 }),
    });
    const applied = applyWorkspaceSnapshot(initial, message);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.activeDocument.markdown).toBe(typed);
    expect(applied.value.activeDocument.revision).toBe(1);

    // The native shell echoes the new revision back as a document-open
    // transfer. The echo must be a no-op at the state layer.
    const echoTransfer = createDocumentOpenTransfer({
      sessionId: SESSION_ID,
      documentId: DOCUMENT_ID,
      revision: applied.value.activeDocument.revision,
      content: applied.value.activeDocument.markdown,
      view: applied.value.activeDocument.mode,
      selection: applied.value.activeDocument.selection,
    });
    expect(echoTransfer.ok).toBe(true);
    if (!echoTransfer.ok) return;
    const echo = assembleDocumentOpenTransfer(echoTransfer.value);
    expect(echo.ok).toBe(true);
    if (!echo.ok) return;
    expect(echo.value.revision).toBe(1);
    expect(echo.value.content).toBe(typed);
    expect(echo.value.selection).toEqual({ anchor: 6, head: 6 });
  });

  test("re-applying the same revision is rejected as stale", () => {
    const initial = createWorkspaceState({
      documents: [document],
      recoveryDrafts: [],
      sessionId: SESSION_ID,
      blankDocumentId: DOCUMENT_ID,
    });
    const first = applyWorkspaceSnapshot(
      initial,
      createEditorSnapshotMessage({
        sessionId: SESSION_ID,
        documentId: DOCUMENT_ID,
        baseRevision: 0,
        revision: 1,
        mode: "wysiwyg",
        markdown: "Hello 世界",
        selection: Object.freeze({ anchor: 6, head: 6 }),
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = applyWorkspaceSnapshot(
      first.value,
      createEditorSnapshotMessage({
        sessionId: SESSION_ID,
        documentId: DOCUMENT_ID,
        baseRevision: 0,
        revision: 1,
        mode: "wysiwyg",
        markdown: "Hello 世界",
        selection: Object.freeze({ anchor: 6, head: 6 }),
      }),
    );
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error.code).toBe("STALE_REVISION");
  });

  test("a focused editor skips the echoed selection while applying real content changes", () => {
    // While focused, an unchanged-content echo must not move the cursor.
    expect(shouldApplyIncomingSelection({ editorFocused: true, contentChanged: false })).toBe(
      false,
    );
    // A content replacement (AI write, history restore, external load) must
    // reposition the cursor even while the user is typing.
    expect(shouldApplyIncomingSelection({ editorFocused: true, contentChanged: true })).toBe(true);
    // An unfocused editor (mode switch, document open, search navigation) must
    // accept the native selection.
    expect(shouldApplyIncomingSelection({ editorFocused: false, contentChanged: false })).toBe(
      true,
    );
  });
});
