import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRIMARY_TABS,
  completeWorkspaceCheck,
  createAppShellState,
  openManagedWorkspace,
  selectPrimaryTab,
} from "../../../src/app/app-shell-state";

const source = (file: string) => readFileSync(resolve(__dirname, "../../..", file), "utf8");

describe("four-page primary navigation", () => {
  it("uses exactly Agent, learning, files, settings in priority order", () => {
    expect(PRIMARY_TABS).toEqual(["agent", "learn", "files", "settings"]);
    const shell = source("src/app/app-shell-screen.tsx");
    const navigation = source("src/app/primary-navigation.tsx");
    const definitions = [...navigation.matchAll(/id: "(agent|learn|files|settings)", labelKey:/g)];
    expect(definitions.map((match) => match[1])).toEqual(PRIMARY_TABS);
    expect(shell).not.toContain("DrawingsScreen");
    expect(shell).not.toContain('activeTab === "ai"');
  });

  it("defaults to Agent on startup, recovery-only startup, and workspace activation", () => {
    const initial = createAppShellState();
    expect(initial.activeTab).toBe("agent");
    expect(completeWorkspaceCheck(initial, 2).activeTab).toBe("agent");
    expect(completeWorkspaceCheck(initial, 0, 1).activeTab).toBe("agent");
    const learning = selectPrimaryTab(openManagedWorkspace(initial), "learn");
    expect(openManagedWorkspace(learning).activeTab).toBe("agent");
    expect(learning.activeTab).toBe("learn");
  });

  it("uses the same circular navigation for all main pages and the notes editor", () => {
    const home = source("src/app/agent-home-screen.tsx");
    const shell = source("src/app/app-shell-screen.tsx");
    const navigation = source("src/app/primary-navigation.tsx");
    expect(home).toMatch(/<PrimaryNavigation\s+activeTab="agent"/u);
    expect(shell.match(/<PrimaryNavigation\b/gu)).toHaveLength(4);
    expect(shell).toContain('activeTab="files"');
    expect(shell).toMatch(
      /<LearningScreen[\s\S]*?renderBottomNavigation=\{\(actions\) => \(\s*<PrimaryNavigation\s+activeTab="learn"[\s\S]*?\{actions\}\s*<\/PrimaryNavigation>/u,
    );
    expect(shell).not.toContain('accessibilityRole="tablist"');
    expect(navigation).toContain(".filter(({ id }) => id !== activeTab)");
    expect(navigation).toContain("selected={open}");
    expect(navigation).toMatch(/setOpen\(false\);[\s\S]*?onSelect\(id\);/u);
  });

  it("places the editor toolbar inside the navigation footer as independent scroll content", () => {
    const shell = source("src/app/app-shell-screen.tsx");
    const editor = source("src/app/editor-workspace-screen.tsx");
    const toolbar = source("src/app/formatting-toolbar.tsx");
    expect(editor).toContain("renderBottomNavigation?.(formattingToolbar)");
    expect(shell).toMatch(
      /renderBottomNavigation=\{\(toolbar\)[\s\S]*?<PrimaryNavigation[\s\S]*?\{toolbar\}\s*<\/PrimaryNavigation>/u,
    );
    expect(source("src/app/primary-navigation.tsx")).toMatch(
      /dismissArea:\s*\{[^}]*bottom: FOOTER_HEIGHT/u,
    );
    expect(toolbar).toMatch(/<ScrollView[\s\S]*?\bhorizontal\b/u);
  });

  it("keeps workspace browsing in the sidebar without detaching the editor", () => {
    const sidebar = source("src/app/global-sidebar.tsx");
    expect(sidebar).toContain("onOpenNotes(null)");
    expect(sidebar).toContain("onChooseWorkspace");
    expect(sidebar).not.toContain("onSelectTab");
    const shell = source("src/app/app-shell-screen.tsx");
    expect(shell).toContain("styles.hiddenDestination");
    expect(shell).toMatch(/hiddenDestination:\s*\{[^}]*right: 0,[^}]*bottom: 0,/u);
    expect(shell).toContain('pointerEvents={editorVisible ? "auto" : "none"}');
    expect(shell).toContain("<EditorWorkspaceView");
    expect(shell).not.toContain('display: "none",');
  });
  it("releases Android editor input when the attached editor is hidden", () => {
    const shell = source("src/app/app-shell-screen.tsx");
    const native = source(
      "modules/inkstone-workspace-access/android/src/main/java/app/inkstone/workspace/InkstoneWorkspaceAccessModule.kt",
    );

    expect(shell).toContain(
      'const editorVisible = state.activeTab === "files" && notesSurface === "editor"',
    );
    expect(shell).toMatch(
      /findNodeHandle\(editorDestination.current\)[\s\S]*?setEditorInputEnabled\(viewId, editorVisible\)/u,
    );
    expect(shell).toMatch(/ref=\{editorDestination\}\s+collapsable=\{false\}/u);
    expect(native).toMatch(
      /FOCUS_BLOCK_DESCENDANTS[\s\S]*?if \(!enabled\)[\s\S]*?editor\.findFocus\(\)[\s\S]*?hideSoftInputFromWindow[\s\S]*?focused\.clearFocus\(\)/u,
    );

    expect(native).toMatch(
      /activity\.currentFocus == null[\s\S]*?decorView\.apply[\s\S]*?requestFocus\(\)/u,
    );
  });
});
