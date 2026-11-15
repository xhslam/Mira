import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("notes navigation regression", () => {
  test("keeps notes overview ahead of the editor and the sidebar at app-shell scope", () => {
    const shell = readSource("src/app/app-shell-screen.tsx");

    expect(shell).toContain('useState<"overview" | "editor">("overview")');
    expect(shell).toContain("<NotesOverviewScreen");
    expect(shell).toContain("<GlobalSidebar");
    expect(shell).toContain('setNotesSurface("editor")');
  });

  test("keeps a close action on every document tab", () => {
    const tabs = readSource("src/app/document-tabs.tsx");
    const editor = readSource("src/app/editor-workspace-screen.tsx");

    expect(tabs).toContain('accessibilityLabel={t("tabs.closeNote"');
    expect(tabs).toContain("onClose(document.documentId)");
    expect(editor).toContain("controller.closeDocument(documentId)");
    expect(editor).toContain('result === "last"');
  });

  test("mounts the sidebar only in notes and keeps both notes entry points", () => {
    const shell = readSource("src/app/app-shell-screen.tsx");

    expect(shell).toMatch(/state\.activeTab === "files" \? \(\s*<GlobalSidebar/u);
    expect(shell.match(/onOpenSidebar=\{/gu)).toHaveLength(2);
    expect(readSource("src/app/notes-overview-screen.tsx")).toContain("onPress={onOpenSidebar}");
    expect(readSource("src/app/editor-workspace-screen.tsx")).toContain("onOpenSidebar?.()");
  });

  test.each(["learning", "english-coach", "agent-home", "settings"])(
    "omits the notes sidebar action from %s",
    (screen) => {
      const source = readSource(`src/app/${screen}-screen.tsx`);

      expect(source).not.toMatch(/onOpenSidebar|SidebarToggleIcon|打开全局侧边栏/u);
    },
  );

  test("keeps open notes reachable when the editor strip overflows", () => {
    const tabs = readSource("src/app/document-tabs.tsx");

    expect(tabs).toContain("flexShrink: 0");
    expect(tabs).toContain("right > scrollOffset.current + viewportWidth");
    expect(tabs).toContain("documents.length > 1");
    expect(tabs).toContain("renderDocument(document, true)");
    expect(tabs).toContain("onSelect(document.documentId)");
  });

  test("switches between panel direction icons with a reduced-motion-aware spring", () => {
    const icon = readSource("src/app/sidebar-toggle-icon.tsx");

    expect(icon).toContain("Animated.spring(progress");
    expect(icon).toContain("useReducedMotion()");
    expect(icon).toContain("<PanelLeftOpen");
    expect(icon).toContain("<PanelLeftClose");
    expect(icon).toContain("opacity: progress");
  });

  test("uses the same plain title control for opening and closing the notes sidebar", () => {
    const overview = readSource("src/app/notes-overview-screen.tsx");
    const sidebar = readSource("src/app/global-sidebar.tsx");
    const control = readSource("src/app/sidebar-toggle-icon.tsx");

    expect(overview).toContain("<SidebarTitleButton expanded={false} onPress={onOpenSidebar}");
    expect(sidebar).toContain("<SidebarTitleButton expanded={visible} onPress={onClose}");
    expect(control).toContain("accessibilityState={{ expanded }}");
    expect(control).toContain("minHeight: 48");
  });

  test("keeps note rename inline and progressively discloses backup settings", () => {
    const editor = readSource("src/app/editor-workspace-screen.tsx");
    const header = readSource("src/app/workspace-header.tsx");

    expect(header).toContain('accessibilityLabel={t("header.renameNoteInput")}');
    expect(header).toContain("onSubmitEditing={rename.onSubmit}");
    expect(editor).toContain(
      "controller.renameActiveDocument(renameDocumentId, target.path, conflict)",
    );
    expect(editor).toContain('setMenuPage("backup")');
    expect(editor).not.toContain("icon={FilePlus2}");
    expect(editor).not.toContain("icon={Save}");
  });
});
