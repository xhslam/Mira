import { describe, expect, it } from "vitest";

import {
  parseDocumentId,
  parseSessionId,
  type DocumentId,
  type SessionId,
} from "../../../src/domain/identifiers";
import {
  applyEditorSnapshot,
  createDocumentSession,
  type DocumentSession,
  type EditorMode,
} from "../../../src/session/document-session";

function documentId(value = "123e4567-e89b-42d3-a456-426614174000"): DocumentId {
  const result = parseDocumentId(value);
  if (!result.ok) {
    throw new Error("invalid document ID in test");
  }
  return result.value;
}

function sessionId(value = "123e4567-e89b-42d3-b456-426614174000"): SessionId {
  const result = parseSessionId(value);
  if (!result.ok) {
    throw new Error("invalid session ID in test");
  }
  return result.value;
}

function createSession(): DocumentSession {
  return createDocumentSession({
    sessionId: sessionId(),
    documentId: documentId(),
    markdown: "# Original\n",
    selection: { anchor: 0, head: 0 },
    mode: "wysiwyg",
    baseFileHash: "sha256:original",
    lastConfirmedSave: {
      revision: 0,
      contentHash: "sha256:original",
      savedAt: "2026-07-30T00:00:00.000Z",
    },
  });
}

describe("createDocumentSession", () => {
  it("creates a deeply frozen initial state without aliasing nested input", () => {
    const selection = { anchor: 2, head: 4 };
    const lastConfirmedSave = {
      revision: 0,
      contentHash: "sha256:initial",
      savedAt: "2026-07-30T00:00:00.000Z",
    };

    const session = createDocumentSession({
      sessionId: sessionId(),
      documentId: documentId(),
      markdown: "Hello\n",
      selection,
      mode: "source",
      baseFileHash: "sha256:initial",
      lastConfirmedSave,
    });

    expect(session).toMatchObject({
      revision: 0,
      markdown: "Hello\n",
      mode: "source",
      baseFileHash: "sha256:initial",
      dirty: false,
    });
    expect(session.selection).toEqual(selection);
    expect(session.selection).not.toBe(selection);
    expect(session.lastConfirmedSave).toEqual(lastConfirmedSave);
    expect(session.lastConfirmedSave).not.toBe(lastConfirmedSave);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.selection)).toBe(true);
    expect(Object.isFrozen(session.lastConfirmedSave)).toBe(true);
  });
});

describe("applyEditorSnapshot", () => {
  it("advances an immutable session and preserves confirmed file state", () => {
    const session = createSession();
    const originalSession = structuredClone(session);
    const selection = { anchor: 3, head: 8 };
    const snapshot = {
      sessionId: session.sessionId,
      documentId: session.documentId,
      baseRevision: 0,
      revision: 1,
      markdown: "# Hello\n",
      selection,
      mode: "source" as const,
    };

    const result = applyEditorSnapshot(session, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).not.toBe(session);
    expect(result.value).toMatchObject({
      revision: 1,
      markdown: "# Hello\n",
      mode: "source",
      baseFileHash: "sha256:original",
      dirty: true,
      lastConfirmedSave: session.lastConfirmedSave,
    });
    expect(result.value.selection).toEqual(selection);
    expect(result.value.selection).not.toBe(selection);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.selection)).toBe(true);
    expect(Object.isFrozen(result.value.lastConfirmedSave)).toBe(true);
    expect(session).toEqual(originalSession);
    expect(snapshot).toEqual({ ...snapshot, selection });
  });

  it.each([
    [
      "wrong session ID",
      { sessionId: sessionId("123e4567-e89b-42d3-8456-426614174001") },
      "SESSION_MISMATCH",
    ],
    [
      "wrong document ID",
      { documentId: documentId("123e4567-e89b-42d3-8456-426614174002") },
      "DOCUMENT_MISMATCH",
    ],
    ["stale base revision", { baseRevision: -1 }, "STALE_BASE_REVISION"],
    ["duplicate revision", { revision: 0 }, "DUPLICATE_REVISION"],
    ["non-monotonic revision", { revision: -1 }, "NON_MONOTONIC_REVISION"],
    ["unsupported mode", { mode: "unknown-mode" as EditorMode }, "UNSUPPORTED_MODE"],
  ])("rejects %s", (_name, overrides, code) => {
    const session = createSession();
    const snapshot = {
      sessionId: session.sessionId,
      documentId: session.documentId,
      baseRevision: 0,
      revision: 1,
      markdown: "Changed\n",
      selection: { anchor: 0, head: 0 },
      mode: "source" as EditorMode,
      ...overrides,
    };

    const result = applyEditorSnapshot(session, snapshot);

    expect(result).toEqual({ ok: false, error: { code } });
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) {
      expect(Object.isFrozen(result.error)).toBe(true);
    }
  });
});
