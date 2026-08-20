import type { EditorMode } from "../session/document-session";

export function nextEditorMode(mode: EditorMode, formatId: string): EditorMode {
  if (formatId === "markdown") {
    if (mode === "wysiwyg") return "source";
    if (mode === "source") return "reading";
    return "wysiwyg";
  }
  if (formatId === "json" || formatId === "yaml" || formatId === "toml") {
    if (mode === "tree") return "table";
    if (mode === "table") return "source";
    return "tree";
  }
  return "source";
}
