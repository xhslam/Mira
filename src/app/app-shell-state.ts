export const PRIMARY_TABS = ["files", "drawings", "ai", "learn", "settings"] as const;

export type PrimaryTab = (typeof PRIMARY_TABS)[number];
export type AppStartupState =
  "checking-workspace" | "needs-workspace" | "ready" | "workspace-error";

export type AppShellState = Readonly<{
  startup: AppStartupState;
  activeTab: PrimaryTab;
  errorMessage: string | null;
}>;

export function createAppShellState(): AppShellState {
  return Object.freeze({
    startup: "checking-workspace",
    activeTab: "files",
    errorMessage: null,
  });
}

export function completeWorkspaceCheck(
  state: AppShellState,
  documentCount: number,
  recoveryDraftCount = 0,
): AppShellState {
  return Object.freeze({
    ...state,
    startup: documentCount + recoveryDraftCount > 0 ? "ready" : "needs-workspace",
    activeTab: "files",
    errorMessage: null,
  });
}

export function failWorkspaceCheck(state: AppShellState): AppShellState {
  return Object.freeze({
    ...state,
    startup: "workspace-error",
    errorMessage:
      "The app-managed workspace could not be checked. Your existing files have not been changed.",
  });
}

export function retryWorkspaceCheck(state: AppShellState): AppShellState {
  return Object.freeze({
    ...state,
    startup: "checking-workspace",
    errorMessage: null,
  });
}

export function openManagedWorkspace(state: AppShellState): AppShellState {
  return Object.freeze({
    ...state,
    startup: "ready",
    activeTab: "files",
    errorMessage: null,
  });
}

export function selectPrimaryTab(state: AppShellState, activeTab: PrimaryTab): AppShellState {
  if (state.startup !== "ready") {
    return state;
  }

  return Object.freeze({ ...state, activeTab });
}
