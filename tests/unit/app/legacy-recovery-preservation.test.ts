import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import type { RecoveryDraft } from "../../../src/recovery/recovery-draft-store";
import type { WorkspaceDocumentSnapshot } from "../../../src/workspace/workspace-repository";
import {
  addBlankWorkspaceDocument,
  closeWorkspaceDocument,
  createWorkspaceState,
  focusWorkspaceDocument,
  legacyRecoveryTextExport,
  openWorkspaceDocument,
  selectWorkspaceDocument,
} from "../../../src/app/workspace-state";

const documentId = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const secondId = "123e4567-e89b-42d3-a456-426614174002" as DocumentId;
const sessionId = "123e4567-e89b-42d3-a456-426614174001" as SessionId;
const contents =
  "---\r\nexcalidraw-plugin: parsed\r\n---\r\n草稿 😀\r\n```compressed-json\r\nopaque==\r\n```\r\n";
function fixture(
  path: string,
): Readonly<{ draft: RecoveryDraft; original: WorkspaceDocumentSnapshot }> {
  return Object.freeze({
    draft: Object.freeze({
      documentId,
      path,
      markdown: contents,
      revision: 7,
      baseHash: "original-hash",
      updatedAt: "2026-11-05T02:00:00.000Z",
    }),
    original: Object.freeze({
      documentId,
      path: path as WorkspaceDocumentSnapshot["path"],
      markdown: "ORIGINAL, DO NOT OVERWRITE",
      contentHash: "original-hash",
    }),
  });
}
const source = (file: string) => readFileSync(resolve(__dirname, "../../..", file), "utf8");

describe("preserved legacy drawing recovery", () => {
  it.each(["Map.excalidraw", "Map.excalidraw.md"])(
    "isolates %s recovery from pending source saves without discarding it",
    (path) => {
      const { draft, original } = fixture(path);
      const state = createWorkspaceState({
        documents: [original],
        recoveryDrafts: [draft],
        sessionId,
        blankDocumentId: secondId,
      });
      expect(state.activeDocument).toMatchObject({
        markdown: contents,
        baseMarkdown: original.markdown,
        baseHash: "original-hash",
        revision: 7,
        recovered: true,
        dirty: false,
        mode: "source",
      });
      expect(state.saveState).toBe("recovery-only");
      // Reopening via the overview must not replace the preserved draft with disk.
      const reopened = openWorkspaceDocument(state, original);
      expect(reopened.activeDocument.markdown).toBe(contents);
      expect(reopened.saveState).toBe("recovery-only");
      const withNote = addBlankWorkspaceDocument(state, secondId);
      expect(withNote.documents.some((document) => document.dirty)).toBe(false);
      const focused = focusWorkspaceDocument(withNote, secondId);
      expect(
        focused.documents.find((document) => document.documentId === documentId)?.markdown,
      ).toBe(contents);
      expect(selectWorkspaceDocument(focused, documentId).saveState).toBe("recovery-only");
      const closed = closeWorkspaceDocument(focused, documentId);
      expect(closed.documents.map((document) => document.documentId)).toEqual([secondId]);
      expect(closed.activeDocument.documentId).toBe(secondId);
      expect(draft.markdown).toBe(contents);
      expect(original.markdown).toBe("ORIGINAL, DO NOT OVERWRITE");
      // A later workspace activation restores the same independently persisted draft.
      expect(
        createWorkspaceState({
          documents: [original],
          recoveryDrafts: [draft],
          sessionId,
          blankDocumentId: secondId,
        }).activeDocument.markdown,
      ).toBe(contents);
    },
  );

  it("keeps orphan recovery readable, exportable and closable without creating a source file", () => {
    const { draft } = fixture("Deleted.excalidraw.md");
    const state = createWorkspaceState({
      documents: [],
      recoveryDrafts: [draft],
      sessionId,
      blankDocumentId: secondId,
    });
    expect(state.activeDocument).toMatchObject({
      markdown: contents,
      baseMarkdown: null,
      recovered: true,
      dirty: false,
    });
    const closed = closeWorkspaceDocument(addBlankWorkspaceDocument(state, secondId), documentId);
    expect(closed.documents).toHaveLength(1);
    const exported = legacyRecoveryTextExport(draft);
    expect(exported).toEqual({ name: "Deleted.excalidraw.md.recovery.txt", contents });
    expect(new TextEncoder().encode(exported?.contents)).toEqual(
      new TextEncoder().encode(contents),
    );
    expect(Object.isFrozen(exported)).toBe(true);
    expect(legacyRecoveryTextExport({ ...draft, path: "ordinary.md" })).toBeNull();
  });

  it("bypasses only immutable source flushes and retains native save guards", () => {
    const controller = source("src/app/use-editor-workspace.ts");
    const flush = controller.slice(
      controller.indexOf("const requestEditorFlush"),
      controller.indexOf("const captureAiSnapshot"),
    );
    expect(flush).toContain("resolveFormatForPath(current.activeDocument.path).editable === false");
    expect(flush.indexOf("editable === false")).toBeLessThan(flush.indexOf("setTimeout"));
    expect(
      controller.match(/resolveFormatForPath\(document.path\).editable === false/g),
    ).toHaveLength(2);
    const close = controller.slice(
      controller.indexOf("const closeDocument"),
      controller.indexOf("const addDocument"),
    );
    expect(close).toContain('current.documents.length === 1) return "last"');
    expect(close).not.toContain("recoveryStore.remove");
    for (const name of ["restoreHistory", "loadExternalVersion", "saveConflictCopy"]) {
      const action = controller.slice(controller.indexOf(`const ${name} =`));
      const guard = action.indexOf('current.activeDocument.formatId === "legacy-drawing"');
      expect(guard).toBeGreaterThan(-1);
      if (name !== "restoreHistory") {
        expect(guard).toBeLessThan(action.indexOf("recoveryStore.remove"));
      }
    }
  });

  it("provides a persistent recovery-store access entry and an explicit inert-text export", () => {
    const screen = source("src/app/editor-workspace-screen.tsx");
    expect(screen).toContain('label="绘图恢复草稿"');
    const panel = screen.slice(screen.indexOf("function LegacyRecoveryPanel"));
    expect(panel).toContain("store");
    expect(panel).toContain(".list()");
    expect(panel).not.toContain("store.remove");
    expect(panel).not.toContain("store.write");
    expect(panel).not.toContain("repository");
    expect(panel).toContain("createWorkspaceFileShare({");
    expect(panel).toContain("file.create({ overwrite: false })");
    expect(panel).toContain("file.write(payload.contents)");
    expect(panel).toContain("导出恢复原文（.txt）");
    expect(panel).toContain("<Text selectable");
    expect(screen).toContain("!activeDocument.recovered &&");
  });
});
