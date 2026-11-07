import { parseWorkspacePath } from "../workspace/workspace-path";

function filenameExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot) : "";
}

export type NoteRenameTarget =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; code: "EMPTY" | "PATH_SYMBOL" | "INVALID" }>;

export function editableNoteName(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.slice(0, filename.length - filenameExtension(filename).length);
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
  const extension = filenameExtension(filename);
  const normalizedName =
    extension && name.toLowerCase().endsWith(extension.toLowerCase())
      ? name.slice(0, -extension.length).trimEnd()
      : name;
  if (!normalizedName.trim()) {
    return Object.freeze({ ok: false, code: "EMPTY" });
  }

  if (normalizedName === "." || normalizedName === "..") {
    return Object.freeze({ ok: false, code: "PATH_SYMBOL" });
  }

  const target = `${directory}${normalizedName}${extension}`;
  const parsed = parseWorkspacePath(target);
  if (!parsed.ok) {
    return Object.freeze({ ok: false, code: "INVALID" });
  }
  return Object.freeze({ ok: true, path: parsed.value });
}
