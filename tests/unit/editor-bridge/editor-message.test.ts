import { describe, expect, it } from "vitest";

import {
  MAX_EDITOR_CHANGE_COUNT,
  parseEditorMessage,
} from "../../../src/editor-bridge/editor-message";

const validMessage = {
  protocolVersion: 1,
  type: "editor.snapshot",
  sessionId: "123e4567-e89b-42d3-b456-426614174000",
  documentId: "123e4567-e89b-42d3-a456-426614174000",
  baseRevision: 2,
  revision: 3,
  mode: "source",
  markdown: "# Hello\n",
  selection: { anchor: 0, head: 4 },
} as const;

describe("parseEditorMessage", () => {
  it("returns a deeply frozen protocol v1 snapshot", () => {
    const result = parseEditorMessage(validMessage);

    expect(result).toEqual({ ok: true, value: validMessage });
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok || result.value.type !== "editor.snapshot") {
      throw new Error("snapshot message failed");
    }
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.selection)).toBe(true);
    expect(result.value).not.toBe(validMessage);
    expect(result.value.selection).not.toBe(validMessage.selection);
  });

  it("accepts and deeply freezes an incremental document change", () => {
    const input = {
      ...validMessage,
      type: "document.change",
      changes: [{ from: 2, to: 2, insert: "new" }],
    };
    delete (input as { markdown?: string }).markdown;

    const result = parseEditorMessage(input);

    expect(result).toEqual({ ok: true, value: input });
    if (!result.ok || result.value.type !== "document.change") {
      throw new Error("change message failed");
    }
    expect(Object.isFrozen(result.value.changes)).toBe(true);
    expect(result.value.changes.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ["editor.ready", {}],
    [
      "document.open",
      {
        revision: 3,
        content: "# Hello\n",
        view: "source",
        selection: { anchor: 0, head: 4 },
      },
    ],
    ["document.saveRequested", { revision: 3, requestId: 7 }],
    ["document.saved", { revision: 3, contentHash: "sha256:confirmed" }],
    ["selection.change", { revision: 3, ranges: [{ anchor: 1, head: 4 }] }],
    [
      "diagnostics.update",
      {
        revision: 3,
        items: [{ from: 0, to: 4, severity: "warning", message: "Check heading" }],
      },
    ],
  ] as const)("accepts and deeply freezes %s", (type, payload) => {
    const input = {
      protocolVersion: 1,
      type,
      sessionId: validMessage.sessionId,
      documentId: validMessage.documentId,
      ...payload,
    };

    const result = parseEditorMessage(input);

    expect(result).toEqual({ ok: true, value: input });
    if (!result.ok) throw new Error(`${type} message failed`);
    expect(Object.isFrozen(result.value)).toBe(true);
    if (result.value.type === "document.open") {
      expect(Object.isFrozen(result.value.selection)).toBe(true);
    }
    if (result.value.type === "selection.change") {
      expect(Object.isFrozen(result.value.ranges)).toBe(true);
      expect(result.value.ranges.every(Object.isFrozen)).toBe(true);
    }
    if (result.value.type === "diagnostics.update") {
      expect(Object.isFrozen(result.value.items)).toBe(true);
      expect(result.value.items.every(Object.isFrozen)).toBe(true);
    }
  });

  it("rejects protocol controls without document identity", () => {
    expect(
      parseEditorMessage({
        protocolVersion: 1,
        type: "editor.ready",
        sessionId: validMessage.sessionId,
      }),
    ).toEqual({ ok: false, error: { code: "INVALID_MESSAGE" } });
  });

  it.each([
    ["unknown type", { ...validMessage, type: "editor.command" }, "UNKNOWN_MESSAGE_TYPE"],
    ["unknown protocol", { ...validMessage, protocolVersion: 2 }, "UNSUPPORTED_PROTOCOL"],
    ["unsupported mode", { ...validMessage, mode: "unknown-mode" }, "INVALID_MESSAGE"],
    ["extra envelope key", { ...validMessage, command: "save" }, "INVALID_MESSAGE"],
    ["malformed session UUID", { ...validMessage, sessionId: "bad" }, "INVALID_MESSAGE"],
    ["malformed document UUID", { ...validMessage, documentId: "bad" }, "INVALID_MESSAGE"],
    ["negative base revision", { ...validMessage, baseRevision: -1 }, "INVALID_MESSAGE"],
    ["negative revision", { ...validMessage, revision: -1 }, "INVALID_MESSAGE"],
    ["duplicate revision", { ...validMessage, baseRevision: 3 }, "INVALID_REVISION_ORDER"],
    ["missing selection head", { ...validMessage, selection: { anchor: 0 } }, "INVALID_MESSAGE"],
    [
      "extra selection key",
      { ...validMessage, selection: { anchor: 0, head: 0, path: "/private/file.md" } },
      "INVALID_MESSAGE",
    ],
  ])("rejects %s", (_name, input, code) => {
    const result = parseEditorMessage(input);

    expect(result).toEqual({ ok: false, error: { code } });
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) {
      expect(Object.isFrozen(result.error)).toBe(true);
    }
  });

  it("measures the Markdown payload in UTF-8 bytes", () => {
    const atLimit = parseEditorMessage({
      ...validMessage,
      markdown: "é".repeat(1024 * 1024),
    });
    const aboveLimit = parseEditorMessage({
      ...validMessage,
      markdown: `${"é".repeat(1024 * 1024)}a`,
    });

    expect(atLimit.ok).toBe(true);
    expect(aboveLimit).toEqual({ ok: false, error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("measures incremental inserts in UTF-8 bytes", () => {
    const base = {
      ...validMessage,
      type: "document.change",
      changes: [{ from: 0, to: 0, insert: "é".repeat(1024 * 1024) }],
    };
    delete (base as { markdown?: string }).markdown;

    expect(parseEditorMessage(base).ok).toBe(true);
    expect(
      parseEditorMessage({
        ...base,
        changes: [{ from: 0, to: 0, insert: `${"é".repeat(1024 * 1024)}a` }],
      }),
    ).toEqual({ ok: false, error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("bounds cumulative diagnostic text in UTF-8 bytes", () => {
    const input = {
      protocolVersion: 1,
      type: "diagnostics.update",
      sessionId: validMessage.sessionId,
      documentId: validMessage.documentId,
      revision: 3,
      items: Array.from({ length: 513 }, () => ({
        from: 0,
        to: 0,
        severity: "warning",
        message: "a".repeat(4_096),
      })),
    };

    expect(parseEditorMessage(input)).toEqual({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects invalid or excessive incremental changes", () => {
    const base = {
      ...validMessage,
      type: "document.change",
    };
    delete (base as { markdown?: string }).markdown;

    expect(parseEditorMessage({ ...base, changes: [{ from: 2, to: 1, insert: "" }] })).toEqual({
      ok: false,
      error: { code: "INVALID_MESSAGE" },
    });
    expect(
      parseEditorMessage({
        ...base,
        changes: Array.from({ length: MAX_EDITOR_CHANGE_COUNT + 1 }, () => ({
          from: 0,
          to: 0,
          insert: "",
        })),
      }),
    ).toEqual({ ok: false, error: { code: "INVALID_MESSAGE" } });
  });

  it("rejects objects with a polluted prototype", () => {
    const polluted = Object.assign(Object.create({ command: "read-file" }), validMessage);

    expect(parseEditorMessage(polluted)).toEqual({
      ok: false,
      error: { code: "INVALID_MESSAGE" },
    });
    expect(({} as { command?: string }).command).toBeUndefined();
  });

  it("contains hostile proxy failures as a typed result", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile proxy");
        },
      },
    );

    expect(() => parseEditorMessage(hostile)).not.toThrow();
    expect(parseEditorMessage(hostile)).toEqual({
      ok: false,
      error: { code: "INVALID_MESSAGE" },
    });
  });
});
