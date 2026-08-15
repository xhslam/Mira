import { DEFAULT_FORMAT_REGISTRY } from "../formats/format-registry";
import type { FileEntry } from "../workspace/workspace-adapter";
import { parseWorkspacePath, type WorkspacePath } from "../workspace/workspace-path";

export const FILE_BROWSER_GROUP_IDS = [
  "markdown",
  "excalidraw",
  "yaml",
  "json",
  "toml",
  "mermaid",
  "svg",
  "html",
  "code",
  "other",
] as const;

export type FileBrowserGroupId = (typeof FILE_BROWSER_GROUP_IDS)[number];
export type FileBrowserSort = "name" | "modified" | "type" | "size";

export type FileBrowserGroup = Readonly<{
  id: FileBrowserGroupId;
  label: string;
  count: number;
  files: readonly FileEntry[];
}>;

export type FileBrowserTreeNode = Readonly<{
  path: WorkspacePath;
  name: string;
  kind: FileEntry["kind"];
  entry: FileEntry;
  children: readonly FileBrowserTreeNode[];
}>;

export type FileBrowserModel = Readonly<{
  fileCount: number;
  groups: readonly FileBrowserGroup[];
  tree: readonly FileBrowserTreeNode[];
}>;

const GROUP_LABELS: Readonly<Record<FileBrowserGroupId, string>> = Object.freeze({
  markdown: "Markdown",
  excalidraw: "Excalidraw",
  yaml: "YAML",
  json: "JSON",
  toml: "TOML",
  mermaid: "Mermaid",
  svg: "SVG",
  html: "HTML",
  code: "Code",
  other: "Other",
});

function extensionFor(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function browserGroupFor(entry: FileEntry): FileBrowserGroupId {
  const extension = extensionFor(entry.name);
  if (extension === ".svg") return "svg";
  if (extension === ".html" || extension === ".htm") return "html";
  const format = DEFAULT_FORMAT_REGISTRY.resolve(entry.name, entry.contentType);
  if (
    format.id === "markdown" ||
    format.id === "excalidraw" ||
    format.id === "yaml" ||
    format.id === "json" ||
    format.id === "toml" ||
    format.id === "mermaid" ||
    format.id === "code"
  ) {
    return format.id;
  }
  return "other";
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

export function sortBrowserFiles(
  files: readonly FileEntry[],
  sort: FileBrowserSort,
): readonly FileEntry[] {
  return Object.freeze([...files].sort((left, right) => compareBrowserEntries(left, right, sort)));
}

export function upsertBrowserFile(
  entries: readonly FileEntry[],
  savedFile: FileEntry,
): readonly FileEntry[] {
  const next = entries.some((entry) => entry.path === savedFile.path)
    ? entries.map((entry) => (entry.path === savedFile.path ? savedFile : entry))
    : [...entries, savedFile];
  return Object.freeze(
    next
      .map((entry) => Object.freeze({ ...entry }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

export function filesForActivityPaths(
  entries: readonly FileEntry[],
  paths: readonly string[],
): readonly FileEntry[] {
  const filesByPath = new Map(
    entries.filter((entry) => entry.kind === "file").map((entry) => [entry.path, entry]),
  );
  return Object.freeze(
    paths.flatMap((path) => {
      const entry = filesByPath.get(path as WorkspacePath);
      return entry ? [Object.freeze({ ...entry })] : [];
    }),
  );
}

function compareBrowserEntries(left: FileEntry, right: FileEntry, sort: FileBrowserSort): number {
  if (sort === "modified") {
    const comparison = compareNullableNumbers(
      left.modifiedAt === null ? null : Date.parse(left.modifiedAt),
      right.modifiedAt === null ? null : Date.parse(right.modifiedAt),
    );
    return comparison || left.name.localeCompare(right.name);
  }
  if (sort === "size") {
    return compareNullableNumbers(left.size, right.size) || left.name.localeCompare(right.name);
  }
  if (sort === "type") {
    return (
      browserGroupFor(left).localeCompare(browserGroupFor(right)) ||
      left.name.localeCompare(right.name)
    );
  }
  return left.name.localeCompare(right.name);
}

function parentPath(path: WorkspacePath): string {
  return path.split("/").slice(0, -1).join("/");
}

function synthesizeDirectories(entries: readonly FileEntry[]): readonly FileEntry[] {
  const synthesized = entries.flatMap((entry) => {
    const segments = entry.path.split("/").slice(0, -1);
    return segments.map((name, index) => {
      const value = segments.slice(0, index + 1).join("/");
      const parsed = parseWorkspacePath(value);
      if (!parsed.ok) throw new Error("Workspace browser contains an invalid path");
      return Object.freeze({
        path: parsed.value,
        name,
        kind: "directory" as const,
        size: null,
        modifiedAt: null,
        contentType: null,
      });
    });
  });
  return Object.freeze(
    [...entries, ...synthesized].filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.path === entry.path) === index,
    ),
  );
}

function buildTreeLevel(
  entries: readonly FileEntry[],
  parent: string,
  sort: FileBrowserSort,
): readonly FileBrowserTreeNode[] {
  const children = entries
    .filter((entry) => parentPath(entry.path) === parent)
    .sort(
      (left, right) =>
        Number(right.kind === "directory") - Number(left.kind === "directory") ||
        compareBrowserEntries(left, right, sort),
    );
  return Object.freeze(
    children.map((entry) =>
      Object.freeze({
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        entry: Object.freeze({ ...entry }),
        children:
          entry.kind === "directory"
            ? buildTreeLevel(entries, entry.path, sort)
            : Object.freeze([]),
      }),
    ),
  );
}

export function buildFileBrowserModel(
  entries: readonly FileEntry[],
  sort: FileBrowserSort = "name",
): FileBrowserModel {
  const frozenEntries = Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
  const files = frozenEntries.filter((entry) => entry.kind === "file");
  const groups = FILE_BROWSER_GROUP_IDS.map((id) => {
    const groupedFiles = sortBrowserFiles(
      files.filter((entry) => browserGroupFor(entry) === id),
      "name",
    );
    return Object.freeze({
      id,
      label: GROUP_LABELS[id],
      count: groupedFiles.length,
      files: groupedFiles,
    });
  });
  return Object.freeze({
    fileCount: files.length,
    groups: Object.freeze(groups),
    tree: buildTreeLevel(synthesizeDirectories(frozenEntries), "", sort),
  });
}
