export const MAX_EDITOR_RENDERER_RECOVERY_ATTEMPTS = 3;

export type EditorRendererRecoveryState = Readonly<{
  status: "ready" | "recovering" | "failed";
  generation: number;
  consecutiveFailures: number;
  readyVersionTarget: number | null;
}>;

export function createEditorRendererRecoveryState(): EditorRendererRecoveryState {
  return Object.freeze({
    status: "ready",
    generation: 0,
    consecutiveFailures: 0,
    readyVersionTarget: null,
  });
}

export function beginEditorRendererRecovery(
  state: EditorRendererRecoveryState,
  currentReadyVersion: number,
): EditorRendererRecoveryState {
  const consecutiveFailures = state.consecutiveFailures + 1;
  if (consecutiveFailures > MAX_EDITOR_RENDERER_RECOVERY_ATTEMPTS) {
    return Object.freeze({
      ...state,
      status: "failed",
      consecutiveFailures,
      readyVersionTarget: null,
    });
  }

  return Object.freeze({
    status: "recovering",
    generation: state.generation + 1,
    consecutiveFailures,
    readyVersionTarget: currentReadyVersion + 1,
  });
}

export function acknowledgeEditorRendererReady(
  state: EditorRendererRecoveryState,
  readyVersion: number,
): EditorRendererRecoveryState {
  if (
    state.status !== "recovering" ||
    state.readyVersionTarget === null ||
    readyVersion < state.readyVersionTarget
  ) {
    return state;
  }

  return Object.freeze({
    status: "ready",
    generation: state.generation,
    consecutiveFailures: 0,
    readyVersionTarget: null,
  });
}

export function retryEditorRendererRecovery(
  state: EditorRendererRecoveryState,
  currentReadyVersion: number,
): EditorRendererRecoveryState {
  if (state.status !== "failed") return state;

  return Object.freeze({
    status: "recovering",
    generation: state.generation + 1,
    consecutiveFailures: 1,
    readyVersionTarget: currentReadyVersion + 1,
  });
}
