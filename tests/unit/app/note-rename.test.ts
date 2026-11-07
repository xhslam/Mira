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

  it("returns the editable name without its extension", () => {
    expect(editableNoteName("journal/Today.md")).toBe("Today");
    expect(editableNoteName("data.json")).toBe("data");
    expect(noteRenameTargetPath("archive/data.json", "Current.JSON")).toEqual({
      ok: true,
      path: "archive/Current.json",
    });
    expect(noteRenameTargetPath("Legacy note", "New title")).toEqual({
      ok: true,
      path: "New title",
    });
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
