import type { FileEntry } from "../workspace/workspace-adapter";
import { parseWorkspacePath } from "../workspace/workspace-path";

export type NoteFolderSummary = Readonly<{
  path: string;
  name: string;
  depth: number;
  count: number;
}>;

export type NoteMoveTarget =
  Readonly<{ ok: true; path: string }> | Readonly<{ ok: false; code: "SAME" | "INVALID" }>;

export function isNoteFileEntry(entry: FileEntry): boolean {
  return (
    entry.kind === "file" &&
    /\.(?:md|markdown|mdown|mkd)$/iu.test(entry.path) &&
    !/\.excalidraw\.md$/iu.test(entry.path)
  );
}

export function noteParentFolder(path: string): string | null {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? null : path.slice(0, separator);
}

export function noteFilesInFolder(
  entries: readonly FileEntry[],
  folder: string | null,
): readonly FileEntry[] {
  return Object.freeze(
    entries
      .filter(isNoteFileEntry)
      .filter((entry) => noteParentFolder(entry.path) === folder)
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

export function noteFolderSummaries(entries: readonly FileEntry[]): readonly NoteFolderSummary[] {
  const folderPaths = new Set<string>();
  const notes = entries.filter(isNoteFileEntry);

  for (const entry of entries) {
    if (entry.kind === "directory") folderPaths.add(entry.path);
  }
  for (const note of notes) {
    const parts = note.path.split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      folderPaths.add(parts.slice(0, index).join("/"));
    }
  }

  return Object.freeze(
    [...folderPaths]
      .sort((left, right) => left.localeCompare(right))
      .map((path) =>
        Object.freeze({
          path,
          name: path.split("/").at(-1) ?? path,
          depth: Math.max(0, path.split("/").length - 1),
          count: notes.filter((entry) => entry.path.startsWith(`${path}/`)).length,
        }),
      ),
  );
}

export function noteMoveTargetPath(path: string, folder: string | null): NoteMoveTarget {
  const name = path.split("/").at(-1);
  if (!name) return Object.freeze({ ok: false, code: "INVALID" });
  const target = folder ? `${folder}/${name}` : name;
  if (target === path) return Object.freeze({ ok: false, code: "SAME" });
  const parsed = parseWorkspacePath(target);
  return parsed.ok
    ? Object.freeze({ ok: true, path: parsed.value })
    : Object.freeze({ ok: false, code: "INVALID" });
}
