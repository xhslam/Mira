import { describe, expect, test } from "vitest";

import {
  completeWorkspaceCheck,
  createAppShellState,
  failWorkspaceCheck,
  openManagedWorkspace,
  selectPrimaryTab,
} from "../../../src/app/app-shell-state";

describe("app shell state", () => {
  test("starts by checking workspace access instead of authentication", () => {
    expect(createAppShellState()).toEqual({
      startup: "checking-workspace",
      activeTab: "files",
      errorMessage: null,
    });
  });

  test("shows workspace guidance when no managed documents exist", () => {
    const initial = createAppShellState();

    const next = completeWorkspaceCheck(initial, 0);

    expect(next.startup).toBe("needs-workspace");
    expect(initial.startup).toBe("checking-workspace");
  });

  test("restores the Files destination when the managed workspace is accessible", () => {
    const next = completeWorkspaceCheck(createAppShellState(), 2);

    expect(next).toEqual({
      startup: "ready",
      activeTab: "files",
      errorMessage: null,
    });
  });

  test("opens Files immediately when only a recovery draft exists", () => {
    const next = completeWorkspaceCheck(createAppShellState(), 0, 1);

    expect(next.startup).toBe("ready");
    expect(next.activeTab).toBe("files");
  });

  test("opens the real app-managed workspace without creating a fake grant", () => {
    const guidance = completeWorkspaceCheck(createAppShellState(), 0);

    const next = openManagedWorkspace(guidance);

    expect(next.startup).toBe("ready");
    expect(next.activeTab).toBe("files");
  });

  test("switches among the four primary destinations only after startup", () => {
    const ready = completeWorkspaceCheck(createAppShellState(), 1);

    const drawings = selectPrimaryTab(ready, "drawings");
    const next = selectPrimaryTab(drawings, "ai");

    expect(next.activeTab).toBe("ai");
    expect(drawings.activeTab).toBe("drawings");
    expect(ready.activeTab).toBe("files");
    expect(selectPrimaryTab(createAppShellState(), "settings").activeTab).toBe("files");
  });

  test("exposes a recoverable workspace error without claiming readiness", () => {
    const next = failWorkspaceCheck(createAppShellState());

    expect(next.startup).toBe("workspace-error");
    expect(next.errorMessage).toContain("could not be checked");
  });
});
