import { resolveFormatForPath } from "../formats/format-path";
import { decideLargeFileOpen, type LargeFileOpenDecision } from "../formats/large-file-policy";
import type { FileEntry } from "../workspace/workspace-adapter";
import type { EditorMode } from "../session/document-session";

type InitialEditorMode = EditorMode;

export type FileOpenDecision = Readonly<{
  formatId: string;
  mode: InitialEditorMode;
  editable: boolean;
  requiresConfirmation: boolean;
  rejected: boolean;
  reason: string;
}>;

function editorModeFor(decision: LargeFileOpenDecision): InitialEditorMode {
  return decision.initialView;
}

export function decideFileOpen(
  entry: Pick<FileEntry, "name" | "contentType" | "size">,
): FileOpenDecision {
  const format = resolveFormatForPath(entry.name, entry.contentType);
  // Missing provider metadata must not optimistically select a rich renderer.
  const decision = decideLargeFileOpen(
    entry.size ?? 1024 * 1024,
    format.largeFilePolicy,
    format.defaultView,
  );
  return Object.freeze({
    formatId: format.id,
    mode: editorModeFor(decision),
    editable: decision.editable && format.editable !== false,
    requiresConfirmation: decision.requiresConfirmation,
    rejected: decision.rejected,
    reason: decision.reason,
  });
}
