import { describe, expect, test } from "vitest";

import {
  acknowledgeEditorFlush,
  createEditorSaveRequestedMessage,
} from "../../../src/editor-bridge/editor-flush";

const request = Object.freeze({
  requestId: 7,
  sessionId: "123e4567-e89b-42d3-b456-426614174000",
  documentId: "123e4567-e89b-42d3-a456-426614174000",
});

const base = Object.freeze({
  sessionId: request.sessionId,
  documentId: request.documentId,
  revision: 3,
  markdown: "current",
});

describe("editor flush handshake", () => {
  test("creates a frozen save request for the current bridge base", () => {
    const result = createEditorSaveRequestedMessage(request, base);

    expect(result).toEqual({
      ok: true,
      value: {
        protocolVersion: 1,
        type: "document.saveRequested",
        sessionId: request.sessionId,
        documentId: request.documentId,
        revision: 3,
        requestId: 7,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });

  test("does not acknowledge a flush request against another document base", () => {
    expect(
      createEditorSaveRequestedMessage(request, {
        ...base,
        documentId: "123e4567-e89b-42d3-a456-426614174001",
      }),
    ).toEqual({ ok: false, error: { code: "IDENTITY_MISMATCH" } });
  });

  test("acknowledges only the matching request identity and revision", () => {
    const message = createEditorSaveRequestedMessage(request, base);
    if (!message.ok) throw new Error("flush message failed");

    expect(acknowledgeEditorFlush(request, 3, message.value)).toEqual({ ok: true, value: true });
    expect(acknowledgeEditorFlush(request, 4, message.value)).toEqual({
      ok: false,
      error: { code: "REVISION_MISMATCH" },
    });
    expect(acknowledgeEditorFlush({ ...request, requestId: 8 }, 3, message.value)).toEqual({
      ok: false,
      error: { code: "REQUEST_MISMATCH" },
    });
    expect(
      acknowledgeEditorFlush(
        { ...request, documentId: "123e4567-e89b-42d3-a456-426614174001" },
        3,
        message.value,
      ),
    ).toEqual({ ok: false, error: { code: "IDENTITY_MISMATCH" } });
  });
});
