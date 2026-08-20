import { describe, expect, test } from "vitest";

import {
  editorRuntimeErrorMessage,
  isRecoverableEditorRuntimeError,
} from "../../../src/editor-kernel/editor-runtime-error";

describe("editor runtime error classification", () => {
  test.each([
    new Error("Failed to fetch"),
    "Failed to load split bundle from URL",
    { message: "Loading chunk 42 failed" },
    { message: "Module not loaded: locale" },
    { message: "asyncRequire could not load locale" },
  ])("recovers resource and split-bundle failures", (input) => {
    expect(isRecoverableEditorRuntimeError(input)).toBe(true);
  });

  test("does not hide unrelated editor programming errors", () => {
    expect(isRecoverableEditorRuntimeError(new Error("Invalid scene state"))).toBe(false);
    expect(editorRuntimeErrorMessage({ code: "UNKNOWN" })).toBe("");
  });
});
