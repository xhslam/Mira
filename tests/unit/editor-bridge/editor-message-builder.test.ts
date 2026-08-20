import { describe, expect, it } from "vitest";

import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import { parseEditorMessage } from "../../../src/editor-bridge/editor-message";
import {
  createEditorChangeMessage,
  createEditorDiagnosticsUpdateMessage,
  createEditorDocumentOpenMessage,
  createEditorReadyMessage,
  createEditorSavedMessage,
  createEditorSelectionChangeMessage,
  createEditorSnapshotMessage,
} from "../../../src/editor-bridge/editor-message-builder";

const sessionId = "123e4567-e89b-42d3-b456-426614174000" as SessionId;
const documentId = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;

describe("editor message builders", () => {
  it("builds editor.ready that round-trips through the parser", () => {
    const message = createEditorReadyMessage({ sessionId, documentId });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(Object.isFrozen(message)).toBe(true);
  });

  it("builds document.open with a frozen selection", () => {
    const message = createEditorDocumentOpenMessage({
      sessionId,
      documentId,
      revision: 3,
      content: "# Hello\n",
      view: "source",
      selection: { anchor: 0, head: 4 },
    });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(message.type).toBe("document.open");
    expect(Object.isFrozen(message.selection)).toBe(true);
  });

  it("builds an incremental document.change with frozen changes", () => {
    const message = createEditorChangeMessage({
      sessionId,
      documentId,
      baseRevision: 2,
      revision: 3,
      mode: "source",
      changes: [{ from: 2, to: 2, insert: "new" }],
      selection: { anchor: 5, head: 5 },
    });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(message.type).toBe("document.change");
    expect(Object.isFrozen(message.changes)).toBe(true);
    expect(message.changes.every(Object.isFrozen)).toBe(true);
  });

  it("builds editor.snapshot for bounded recovery", () => {
    const message = createEditorSnapshotMessage({
      sessionId,
      documentId,
      baseRevision: 0,
      revision: 1,
      mode: "wysiwyg",
      markdown: "# Hello\n",
      selection: { anchor: 0, head: 2 },
    });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(message.type).toBe("editor.snapshot");
  });

  it("builds document.saved with the confirmed content hash", () => {
    const message = createEditorSavedMessage({
      sessionId,
      documentId,
      revision: 3,
      contentHash: "sha256:confirmed",
    });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(message.type).toBe("document.saved");
  });

  it("builds selection.change", () => {
    const selection = createEditorSelectionChangeMessage({
      sessionId,
      documentId,
      revision: 3,
      ranges: [{ anchor: 1, head: 4 }],
    });
    expect(parseEditorMessage(selection)).toEqual({ ok: true, value: selection });
    expect(selection.type).toBe("selection.change");
    expect(Object.isFrozen(selection.ranges)).toBe(true);
  });

  it("builds diagnostics.update with frozen items", () => {
    const message = createEditorDiagnosticsUpdateMessage({
      sessionId,
      documentId,
      revision: 3,
      items: [{ from: 0, to: 4, severity: "warning", message: "Check heading" }],
    });
    expect(parseEditorMessage(message)).toEqual({ ok: true, value: message });
    expect(message.type).toBe("diagnostics.update");
    expect(Object.isFrozen(message.items)).toBe(true);
    expect(message.items.every(Object.isFrozen)).toBe(true);
  });
});
