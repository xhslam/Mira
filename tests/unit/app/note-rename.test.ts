import { describe, expect, it } from "vitest";

import { editableNoteName, noteRenameTargetPath } from "../../../src/app/note-rename";

describe("note rename", () => {
  it("renames only the note leaf while preserving its folder and Markdown extension", () => {
    expect(noteRenameTargetPath("journal/Today.md", " 明天 ")).toEqual({
      ok: true,
      path: "journal/明天.md",
    });
    expect(noteRenameTargetPath("Today.markdown", "Tomorrow.markdown")).toEqual({
      ok: true,
      path: "Tomorrow.markdown",
    });
  });

  it("returns the editable name without exposing a Markdown extension", () => {
    expect(editableNoteName("journal/Today.md")).toBe("Today");
    expect(editableNoteName("data.json")).toBe("data.json");
  });

  it("rejects empty names and path traversal instead of turning rename into move", () => {
    expect(noteRenameTargetPath("Today.md", "  ")).toEqual({
      ok: false,
      code: "EMPTY",
    });
    expect(noteRenameTargetPath("Today.md", "../Tomorrow")).toEqual({
      ok: false,
      code: "PATH_SYMBOL",
    });
  });
});
