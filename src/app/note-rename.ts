import { parseWorkspacePath } from "../workspace/workspace-path";

const MARKDOWN_EXTENSION = /\.(?:md|markdown|mdown|mkd)$/iu;

export type NoteRenameTarget =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; code: "EMPTY" | "PATH_SYMBOL" | "INVALID" }>;

export function editableNoteName(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(MARKDOWN_EXTENSION, "");
}

export function noteRenameTargetPath(path: string, requestedName: string): NoteRenameTarget {
  const name = requestedName.normalize("NFC").trim();
  if (!name) return Object.freeze({ ok: false, code: "EMPTY" });
  if (name === "." || name === ".." || /[\\/\u0000]/u.test(name)) {
    return Object.freeze({ ok: false, code: "PATH_SYMBOL" });
  }

  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash + 1) : "";
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const extension = MARKDOWN_EXTENSION.exec(filename)?.[0] ?? "";
  const normalizedName = extension
    ? name.replace(new RegExp(`${escapeRegExp(extension)}$`, "iu"), "")
    : name;
  if (!normalizedName.trim()) {
    return Object.freeze({ ok: false, code: "EMPTY" });
  }

  const target = `${directory}${normalizedName}${extension}`;
  const parsed = parseWorkspacePath(target);
  if (!parsed.ok) {
    return Object.freeze({ ok: false, code: "INVALID" });
  }
  return Object.freeze({ ok: true, path: parsed.value });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
