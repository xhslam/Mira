import { describe, expect, it } from "vitest";

import { parseEditorMessage } from "../../../src/editor-bridge/editor-message";

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
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.selection)).toBe(true);
      expect(result.value).not.toBe(validMessage);
      expect(result.value.selection).not.toBe(validMessage.selection);
    }
  });

  it.each([
    ["unknown type", { ...validMessage, type: "editor.command" }, "UNKNOWN_MESSAGE_TYPE"],
    ["unknown protocol", { ...validMessage, protocolVersion: 2 }, "UNSUPPORTED_PROTOCOL"],
    ["unsupported mode", { ...validMessage, mode: "preview" }, "INVALID_MESSAGE"],
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
