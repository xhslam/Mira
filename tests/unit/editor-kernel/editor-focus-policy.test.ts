import { describe, expect, test } from "vitest";

import {
  planFlushCompositionCommit,
  shouldApplyIncomingSelection,
} from "../../../src/editor-kernel/editor-focus-policy";

describe("editor focus policy: incoming selection ownership", () => {
  test("the focused editor ignores echoed selections", () => {
    // While the user is typing, native document-open messages echo the
    // selection the editor itself just sent. Applying them would yank the
    // cursor because Markdown offsets and ProseMirror positions differ.
    expect(shouldApplyIncomingSelection({ editorFocused: true, contentChanged: false })).toBe(
      false,
    );
  });

  test("content replacement always repositions the cursor, even while focused", () => {
    expect(shouldApplyIncomingSelection({ editorFocused: true, contentChanged: true })).toBe(true);
  });

  test("an unfocused editor accepts native selections", () => {
    expect(shouldApplyIncomingSelection({ editorFocused: false, contentChanged: false })).toBe(
      true,
    );
    expect(shouldApplyIncomingSelection({ editorFocused: false, contentChanged: true })).toBe(true);
  });
});

describe("editor focus policy: flush composition commit", () => {
  test("a flush with a pending IME composition must commit it explicitly", () => {
    expect(planFlushCompositionCommit({ compositionPending: true })).toEqual({
      commitRequired: true,
      reason: "composition-pending",
    });
  });

  test("a flush without pending composition commits nothing", () => {
    expect(planFlushCompositionCommit({ compositionPending: false })).toEqual({
      commitRequired: false,
      reason: "no-pending-composition",
    });
  });
});
