import { parseWorkspacePath } from "../workspace/workspace-path";

export type DrawingCreateTarget =
  Readonly<{ ok: true; path: string }> | Readonly<{ ok: false; code: "EMPTY" | "INVALID" }>;

export function drawingCreateTarget(nameInput: string): DrawingCreateTarget {
  const normalized = nameInput
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\.excalidraw(?:\.md)?$/iu, "")
    .replace(/[. ]+$/gu, "")
    .trim();
  if (!normalized) return Object.freeze({ ok: false, code: "EMPTY" });

  const parsed = parseWorkspacePath(`${normalized}.excalidraw.md`);
  return parsed.ok
    ? Object.freeze({ ok: true, path: parsed.value })
    : Object.freeze({ ok: false, code: "INVALID" });
}
