import type { EditorMode } from "../session/document-session";

const markdownModes = ["wysiwyg", "source", "reading"] as const;
const structuredModes = ["tree", "table", "source"] as const;
const sourceModes = ["source"] as const;

export function editorModes(formatId: string): readonly EditorMode[] {
  if (formatId === "markdown") return markdownModes;
  if (formatId === "json" || formatId === "yaml" || formatId === "toml") return structuredModes;
  return sourceModes;
}

export function nextEditorMode(mode: EditorMode, formatId: string): EditorMode {
  const modes = editorModes(formatId);
  return modes[(modes.indexOf(mode) + 1) % modes.length] ?? "source";
}
