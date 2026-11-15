export const PRIMARY_TABS = ["agent", "learn", "files", "settings"] as const;

export type PrimaryTab = (typeof PRIMARY_TABS)[number];
export type AppStartupState =
  "checking-workspace" | "needs-workspace" | "ready" | "workspace-error";

export type AppShellState = Readonly<{
  startup: AppStartupState;
  activeTab: PrimaryTab;
  errorMessage: string | null;
  backTabs: readonly PrimaryTab[];
}>;

export function createAppShellState(): AppShellState {
  return Object.freeze({
    startup: "checking-workspace",
    activeTab: "agent",
    backTabs: Object.freeze([]),
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
    activeTab: "agent",
    backTabs: Object.freeze([]),
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
    activeTab: "agent",
    backTabs: Object.freeze([]),
    errorMessage: null,
  });
}

export function selectPrimaryTab(state: AppShellState, activeTab: PrimaryTab): AppShellState {
  if (state.startup !== "ready") {
    return state;
  }

  if (state.activeTab === activeTab) return state;
  return Object.freeze({
    ...state,
    activeTab,
    backTabs: Object.freeze([...state.backTabs, state.activeTab]),
  });
}

export function returnToPreviousTab(state: AppShellState): AppShellState {
  const activeTab = state.backTabs.at(-1);
  if (state.startup !== "ready" || activeTab === undefined) return state;
  return Object.freeze({
    ...state,
    activeTab,
    backTabs: Object.freeze(state.backTabs.slice(0, -1)),
  });
}
