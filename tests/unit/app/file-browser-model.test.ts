import { describe, expect, it } from "vitest";

import {
  buildFileBrowserModel,
  filesForActivityPaths,
  sortBrowserFiles,
  upsertBrowserFile,
} from "../../../src/app/file-browser-model";
import { parseWorkspacePath, type WorkspacePath } from "../../../src/workspace/workspace-path";
import type { FileEntry } from "../../../src/workspace/workspace-adapter";

function path(input: string): WorkspacePath {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

function file(
  inputPath: string,
  size: number,
  modifiedAt: string | null = "2026-07-31T00:00:00.000Z",
): FileEntry {
  return Object.freeze({
    path: path(inputPath),
    name: inputPath.split("/").at(-1) ?? inputPath,
    kind: "file",
    size,
    modifiedAt,
    contentType: null,
  });
}

function directory(inputPath: string): FileEntry {
  return Object.freeze({
    path: path(inputPath),
    name: inputPath.split("/").at(-1) ?? inputPath,
    kind: "directory",
    size: null,
    modifiedAt: null,
    contentType: null,
  });
}

describe("file browser model", () => {
  it("builds the required format groups with counts in stable display order", () => {
    const model = buildFileBrowserModel([
      file("README.md", 10),
      file("map.excalidraw.md", 11),
      file("config.yaml", 20),
      file("data.json", 30),
      file("settings.toml", 40),
      file("flow.mmd", 50),
      file("logo.svg", 60),
      file("index.html", 70),
      file("main.ts", 80),
      file("notes.xyz", 90),
      file("archive.bin", 100),
    ]);

    expect(model.groups.map((group) => [group.id, group.count])).toEqual([
      ["markdown", 1],
      ["excalidraw", 1],
      ["yaml", 1],
      ["json", 1],
      ["toml", 1],
      ["mermaid", 1],
      ["svg", 1],
      ["html", 1],
      ["code", 1],
      ["other", 2],
    ]);
    expect(model.fileCount).toBe(11);
  });

  it("builds an immutable real directory tree without hiding root files", () => {
    const model = buildFileBrowserModel([
      directory("docs"),
      directory("docs/guides"),
      file("docs/guides/start.md", 12),
      file("README.md", 8),
    ]);

    expect(model.tree).toMatchObject([
      {
        path: "docs",
        kind: "directory",
        children: [
          {
            path: "docs/guides",
            kind: "directory",
            children: [{ path: "docs/guides/start.md", kind: "file" }],
          },
        ],
      },
      { path: "README.md", kind: "file" },
    ]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.groups)).toBe(true);
    expect(Object.isFrozen(model.tree)).toBe(true);
    expect(Object.isFrozen(model.tree[0]?.children)).toBe(true);
  });

  it("sorts files by name, modified time, type, and size without mutating input", () => {
    const input = Object.freeze([
      file("zeta.md", 3, "2026-07-30T00:00:00.000Z"),
      file("alpha.json", 9, "2026-07-31T00:00:00.000Z"),
      file("middle.md", 1, null),
    ]);

    expect(sortBrowserFiles(input, "name").map((item) => item.name)).toEqual([
      "alpha.json",
      "middle.md",
      "zeta.md",
    ]);
    expect(sortBrowserFiles(input, "modified").map((item) => item.name)).toEqual([
      "alpha.json",
      "zeta.md",
      "middle.md",
    ]);
    expect(sortBrowserFiles(input, "type").map((item) => item.name)).toEqual([
      "alpha.json",
      "middle.md",
      "zeta.md",
    ]);
    expect(sortBrowserFiles(input, "size").map((item) => item.name)).toEqual([
      "alpha.json",
      "zeta.md",
      "middle.md",
    ]);
    expect(input.map((item) => item.name)).toEqual(["zeta.md", "alpha.json", "middle.md"]);
  });

  it("applies the selected sort within every directory tree level", () => {
    const input = Object.freeze([
      file("docs/alpha.md", 1),
      file("docs/zeta.md", 20),
      file("alpha.md", 2),
      file("zeta.md", 30),
    ]);

    const model = buildFileBrowserModel(input, "size");

    expect(model.tree.map((node) => node.path)).toEqual(["docs", "zeta.md", "alpha.md"]);
    expect(model.tree[0]?.children.map((node) => node.path)).toEqual([
      "docs/zeta.md",
      "docs/alpha.md",
    ]);
    expect(input.map((entry) => entry.path)).toEqual([
      "docs/alpha.md",
      "docs/zeta.md",
      "alpha.md",
      "zeta.md",
    ]);
  });

  it("updates saved file metadata without mutating the current browser entries", () => {
    const input = Object.freeze([file("notes.md", 3), file("other.md", 5)]);

    const updated = upsertBrowserFile(input, file("notes.md", 12, null));
    const added = upsertBrowserFile(updated, file("new.md", 7, null));

    expect(updated.map((entry) => [entry.path, entry.size])).toEqual([
      ["notes.md", 12],
      ["other.md", 5],
    ]);
    expect(added.map((entry) => entry.path)).toEqual(["new.md", "notes.md", "other.md"]);
    expect(input.map((entry) => [entry.path, entry.size])).toEqual([
      ["notes.md", 3],
      ["other.md", 5],
    ]);
    expect(Object.isFrozen(updated)).toBe(true);
    expect(Object.isFrozen(updated[0])).toBe(true);
  });

  it("resolves activity paths in recorded order and drops stale or directory entries", () => {
    const entries = Object.freeze([
      file("alpha.md", 1),
      directory("docs"),
      file("docs/guide.md", 2),
    ]);

    const result = filesForActivityPaths(entries, [
      "docs/guide.md",
      "missing.md",
      "docs",
      "alpha.md",
    ]);

    expect(result.map((entry) => entry.path)).toEqual(["docs/guide.md", "alpha.md"]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
