import { describe, expect, test } from "vitest";

import {
  applyTextChanges,
  createIncrementalTextChange,
  selectEditorBridgeBase,
} from "../../../src/editor-bridge/text-change";

describe("incremental text changes", () => {
  test("encodes a middle insertion without resending unchanged text", () => {
    expect(createIncrementalTextChange("alpha omega", "alpha beta omega")).toEqual([
      { from: 6, to: 6, insert: "beta " },
    ]);
  });

  test("encodes a deletion using UTF-16 offsets", () => {
    expect(createIncrementalTextChange("A😀BC", "A😀C")).toEqual([{ from: 3, to: 4, insert: "" }]);
  });

  test("returns no changes when the documents are equal", () => {
    expect(createIncrementalTextChange("same", "same")).toEqual([]);
  });

  test("applies ordered non-overlapping changes without mutating the input", () => {
    const source = "one two three";
    const result = applyTextChanges(source, [
      { from: 0, to: 3, insert: "ONE" },
      { from: 8, to: 13, insert: "THREE" },
    ]);

    expect(result).toEqual({ ok: true, value: "ONE two THREE" });
    expect(source).toBe("one two three");
  });

  test.each([
    ["reversed range", [{ from: 3, to: 2, insert: "" }]],
    ["out of bounds", [{ from: 0, to: 4, insert: "" }]],
    [
      "overlap",
      [
        { from: 0, to: 2, insert: "a" },
        { from: 1, to: 3, insert: "b" },
      ],
    ],
  ])("rejects %s", (_name, changes) => {
    expect(applyTextChanges("abc", changes)).toEqual({
      ok: false,
      error: { code: "INVALID_CHANGE_RANGE" },
    });
  });
});

describe("editor bridge base selection", () => {
  const current = Object.freeze({
    sessionId: "session",
    documentId: "first",
    revision: 4,
    markdown: "newer local",
  });

  test("keeps a newer local base when an older acknowledgement arrives", () => {
    expect(
      selectEditorBridgeBase(current, {
        sessionId: "session",
        documentId: "first",
        revision: 3,
        markdown: "older native",
      }),
    ).toBe(current);
  });

  test("accepts a lower revision when document identity changes", () => {
    expect(
      selectEditorBridgeBase(current, {
        sessionId: "session",
        documentId: "second",
        revision: 0,
        markdown: "second document",
      }),
    ).toEqual({
      sessionId: "session",
      documentId: "second",
      revision: 0,
      markdown: "second document",
    });
  });
});
