import { describe, expect, it } from "vitest";

import {
  noteFilesInFolder,
  noteFolderSummaries,
  noteMoveTargetPath,
} from "../../../src/app/note-file-management";
import type { FileEntry } from "../../../src/workspace/workspace-adapter";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

function entry(path: string, kind: FileEntry["kind"]): FileEntry {
  const parsed = parseWorkspacePath(path);
  if (!parsed.ok) throw new Error(`invalid fixture path: ${path}`);
  return Object.freeze({
    path: parsed.value,
    name: path.split("/").at(-1) ?? path,
    kind,
    size: null,
    modifiedAt: null,
    contentType: null,
  });
}

describe("note file management", () => {
  const entries = Object.freeze([
    entry("empty", "directory"),
    entry("work/today.md", "file"),
    entry("work/archive/old.md", "file"),
    entry("root.md", "file"),
    entry("sketch.excalidraw.md", "file"),
  ]);

  it("keeps empty and inferred folders while counting descendant notes", () => {
    expect(noteFolderSummaries(entries)).toEqual([
      { path: "empty", name: "empty", depth: 0, count: 0 },
      { path: "work", name: "work", depth: 0, count: 2 },
      { path: "work/archive", name: "archive", depth: 1, count: 1 },
    ]);
  });

  it("lists only direct Markdown children and excludes canvases", () => {
    expect(noteFilesInFolder(entries, "work").map((item) => item.path)).toEqual(["work/today.md"]);
    expect(noteFilesInFolder(entries, null).map((item) => item.path)).toEqual(["root.md"]);
  });

  it("moves a note by preserving its leaf name and rejects a no-op", () => {
    expect(noteMoveTargetPath("work/today.md", "personal")).toEqual({
      ok: true,
      path: "personal/today.md",
    });
    expect(noteMoveTargetPath("work/today.md", "work")).toEqual({
      ok: false,
      code: "SAME",
    });
  });
});
