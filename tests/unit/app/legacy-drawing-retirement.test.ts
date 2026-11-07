import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import { resolveFormatForPath, isEditableTextFormat } from "../../../src/formats/format-path";
import { decideFileOpen } from "../../../src/app/file-open-policy";
import { buildFileBrowserModel } from "../../../src/app/file-browser-model";
import { nextEditorMode } from "../../../src/app/editor-mode-cycle";
import {
  applyWorkspaceSnapshot,
  createWorkspaceState,
  setWorkspaceMode,
} from "../../../src/app/workspace-state";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

const root = resolve(__dirname, "../../..");
const source = (file: string) => readFileSync(resolve(root, file), "utf8");
const documentId = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const sessionId = "123e4567-e89b-42d3-a456-426614174001" as SessionId;
const originals = [
  [
    "Archive/Map.excalidraw",
    '{"type":"excalidraw","version":2,"elements":[],"unknown":{"keep":true}}\r\n',
  ],
  [
    "Archive/Map.EXCALIDRAW.MD",
    "---\r\nexcalidraw-plugin: parsed\r\ncustom: keep\r\n---\r\n# Notes\r\n![[Other.excalidraw|640x360]]\r\n# Excalidraw Data\r\n```compressed-json\r\nopaque-data==\r\n```\r\n",
  ],
] as const;

describe("legacy drawings after canvas retirement", () => {
  it.each(originals)(
    "keeps %s visible, source-only and non-editable without parsing or rewriting",
    (name, original) => {
      const parsed = parseWorkspacePath(name);
      if (!parsed.ok) throw new Error("Invalid fixture path");
      const entry = Object.freeze({
        path: parsed.value,
        name: name.split("/").at(-1)!,
        kind: "file" as const,
        size: original.length,
        modifiedAt: null,
        contentType: "text/markdown",
      });
      expect(resolveFormatForPath(name, entry.contentType)).toMatchObject({
        id: "legacy-drawing",
        editable: false,
        defaultView: "source",
        supportedViews: ["source"],
      });
      // The existing text repository still reads these files, rather than hiding
      // them or sharing automatically when a user requests source inspection.
      expect(isEditableTextFormat(entry)).toBe(true);
      expect(decideFileOpen(entry)).toMatchObject({
        formatId: "legacy-drawing",
        editable: false,
        mode: "source",
        rejected: false,
      });
      expect(
        buildFileBrowserModel([entry]).groups.find((group) => group.id === "other")?.files,
      ).toEqual([entry]);
      const state = createWorkspaceState({
        documents: [
          { documentId, path: parsed.value, markdown: original, contentHash: "unchanged-hash" },
        ],
        recoveryDrafts: [],
        sessionId,
        blankDocumentId: documentId,
      });
      expect(state.activeDocument.markdown).toBe(original);
      expect(state.activeDocument.dirty).toBe(false);
      expect(state.activeDocument.mode).toBe("source");
      expect(nextEditorMode("source", state.activeDocument.formatId)).toBe("source");
      expect(setWorkspaceMode(state, "wysiwyg")).toBe(state);
      expect(
        applyWorkspaceSnapshot(state, {
          protocolVersion: 1,
          type: "editor.snapshot",
          sessionId,
          documentId,
          baseRevision: 0,
          revision: 1,
          markdown: "rewritten",
          selection: { anchor: 0, head: 0 },
          mode: "source",
        }),
      ).toMatchObject({ ok: false, error: { code: "READ_ONLY" } });
      expect(state.activeDocument.markdown).toBe(original);
    },
  );

  it("does not load a canvas renderer, create canvas content, or offer editing opt-in", () => {
    expect(existsSync(resolve(root, "src/app/drawings-screen.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/formats/excalidraw/excalidraw-editor.tsx"))).toBe(false);
    const kernel = source("src/editor-kernel/editor-kernel.dom.tsx");
    expect(kernel).not.toContain("ExcalidrawEditor");
    expect(kernel).toContain('readOnly={props.readOnly || props.formatId === "legacy-drawing"}');
    expect(source("src/app/editor-workspace-screen.tsx")).toContain("{legacyDrawing ? null : (");
    expect(source("src/app/use-entry-creation.ts")).not.toContain("contentForNewExcalidrawPath");
    const controller = source("src/app/use-editor-workspace.ts");
    // Both recovery writes and source saves fail closed; existing recovery
    // drafts remain untouched for explicit recovery outside the retired editor.
    expect(
      controller.match(/resolveFormatForPath\(document.path\).editable === false/g),
    ).toHaveLength(2);
  });

  it("retires only drawing assets while retaining offline math and bundle guards", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      dependencies: Record<string, string>;
      name: string;
    };
    expect(packageJson.name).toBe("mira");
    expect(packageJson.dependencies["@excalidraw/excalidraw"]).toBeUndefined();
    expect(packageJson.dependencies["lz-string"]).toBeUndefined();
    expect(packageJson.dependencies.katex).toBeDefined();
    for (const file of [
      "scripts/android-release-assets.mjs",
      "scripts/android-release-assets.d.mts",
      "scripts/build-android-release.mjs",
      "scripts/export-android.mjs",
      "scripts/export-ios.mjs",
    ]) {
      expect(source(file)).not.toContain("Excalidraw");
      expect(source(file)).toContain("installKatexReleaseFonts");
      expect(source(file)).toContain("assertSingleDomBundle");
    }
    expect(source("tests/unit/editor-kernel/extended-markdown.test.ts")).toContain(
      "![[System.excalidraw|640x360]]",
    );
  });
});
