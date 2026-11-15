import { describe, expect, test } from "vitest";

import {
  completeWorkspaceCheck,
  createAppShellState,
  failWorkspaceCheck,
  openManagedWorkspace,
  returnToPreviousTab,
  selectPrimaryTab,
} from "../../../src/app/app-shell-state";

describe("app shell state", () => {
  test("starts by checking workspace access instead of authentication", () => {
    expect(createAppShellState()).toEqual({
      startup: "checking-workspace",
      activeTab: "agent",
      backTabs: [],
      errorMessage: null,
    });
  });

  test("shows workspace guidance when no managed documents exist", () => {
    const initial = createAppShellState();

    const next = completeWorkspaceCheck(initial, 0);

    expect(next.startup).toBe("needs-workspace");
    expect(initial.startup).toBe("checking-workspace");
  });

  test("opens Personal Agent when the managed workspace is accessible", () => {
    const next = completeWorkspaceCheck(createAppShellState(), 2);

    expect(next).toEqual({
      startup: "ready",
      activeTab: "agent",
      backTabs: [],
      errorMessage: null,
    });
  });

  test("opens Personal Agent immediately when only a recovery draft exists", () => {
    const next = completeWorkspaceCheck(createAppShellState(), 0, 1);

    expect(next.startup).toBe("ready");
    expect(next.activeTab).toBe("agent");
  });

  test("opens the real app-managed workspace without creating a fake grant", () => {
    const guidance = completeWorkspaceCheck(createAppShellState(), 0);

    const next = openManagedWorkspace(guidance);

    expect(next.startup).toBe("ready");
    expect(next.activeTab).toBe("agent");
  });

  test("switches among primary destinations only after startup", () => {
    const ready = completeWorkspaceCheck(createAppShellState(), 1);

    const files = selectPrimaryTab(ready, "files");
    const next = selectPrimaryTab(files, "agent");

    expect(next.activeTab).toBe("agent");
    expect(files.activeTab).toBe("files");
    expect(ready.activeTab).toBe("agent");
    expect(selectPrimaryTab(createAppShellState(), "settings").activeTab).toBe("agent");
  });

  test("returns through the visited tabs without adding new history", () => {
    const home = openManagedWorkspace(createAppShellState());
    const learning = selectPrimaryTab(home, "learn");
    const settings = selectPrimaryTab(learning, "settings");
    expect(returnToPreviousTab(selectPrimaryTab(settings, "settings"))).toEqual(learning);
    expect(returnToPreviousTab(learning)).toEqual(home);
    expect(returnToPreviousTab(home)).toBe(home);
    expect(returnToPreviousTab(openManagedWorkspace(settings)).activeTab).toBe("agent");
  });

  test("exposes a recoverable workspace error without claiming readiness", () => {
    const next = failWorkspaceCheck(createAppShellState());

    expect(next.startup).toBe("workspace-error");
    expect(next.errorMessage).toContain("could not be checked");
  });
});
