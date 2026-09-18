import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("sidebar visibility regression", () => {
  test("keeps sidebar toggle button on the home/overview screen of notes, but replaces with back button in editor", () => {
    const notesOverview = readSource("src/app/notes-overview-screen.tsx");
    const editor = readSource("src/app/editor-workspace-screen.tsx");
    const header = readSource("src/app/workspace-header.tsx");

    // Notes overview is the root home screen for notes
    expect(notesOverview).toContain("<SidebarToggleIcon");
    expect(notesOverview).toContain('accessibilityLabel="打开全局侧边栏"');

    // Editor is a detail screen: it should not open drawer or render sidebar toggle button
    expect(editor).toContain("onBack={() => {");
    expect(editor).toContain("onExitToNotes?.();");
    expect(editor).not.toContain("onOpenDrawer={() => {");

    // WorkspaceHeader renders onBack with ChevronLeft and only falls back to onOpenDrawer if explicitly passed
    expect(header).toContain("onBack ? (");
    expect(header).toContain("<ChevronLeft");
    expect(header).toContain('label={t("header.backToOverview")}');
  });

  test("keeps sidebar toggle button on the home section of learn, and removes it from subpages and floating overlays", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");

    // Only home ("今天") section renders the sidebar button
    expect(learningScreen).toContain('section === "home" ? (');
    expect(learningScreen).toContain("<SidebarToggleIcon");

    // Subpages only render back button
    expect(learningScreen).toContain(
      'section === "practice" || section === "settings" || section === "url-import" ? (',
    );
    expect(learningScreen).toContain("<ChevronLeft");

    // FloatingSidebarButton is eliminated from phrase-memory and craft
    expect(learningScreen).not.toContain("<FloatingSidebarButton");
    expect(learningScreen).not.toContain("floatingMenu");
  });

  test("keeps sidebar toggle button on AI markdown home screen, and removes it from English coach", () => {
    const aiScreen = readSource("src/app/ai-workspace-screen.tsx");
    const englishCoach = readSource("src/app/english-coach-screen.tsx");

    // AI workspace in default markdown mode is the home screen
    expect(aiScreen).toContain("<SidebarToggleIcon");
    expect(aiScreen).toContain('accessibilityLabel="打开全局侧边栏"');

    // English coach does not display sidebar toggle button
    expect(englishCoach).not.toContain("<SidebarToggleIcon");
    expect(englishCoach).not.toContain('accessibilityLabel="打开全局侧边栏"');
  });

  test("keeps sidebar toggle button on drawings, settings, and inside global sidebar itself", () => {
    const drawings = readSource("src/app/drawings-screen.tsx");
    const settings = readSource("src/app/settings-screen.tsx");
    const sidebar = readSource("src/app/global-sidebar.tsx");

    expect(drawings).toContain("<SidebarToggleIcon");
    expect(drawings).toContain('accessibilityLabel="打开全局侧边栏"');

    expect(settings).toContain("<SidebarToggleIcon");
    expect(settings).toContain('accessibilityLabel="打开全局侧边栏"');

    expect(sidebar).toContain("<SidebarToggleIcon");
    expect(sidebar).toContain("expanded={visible}");
  });
});
