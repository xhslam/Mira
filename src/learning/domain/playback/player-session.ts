export const PLAYER_SESSION_STATES = [
  "idle",
  "loading",
  "ready",
  "playing",
  "paused",
  "buffering",
  "ended",
  "error",
] as const;

export type PlayerSessionStatus = (typeof PLAYER_SESSION_STATES)[number];

export type PlayerCue = Readonly<{
  id: string;
  startMs: number | null;
  endMs: number | null;
}>;

export type PlayerLoopRange = Readonly<{
  startMs: number;
  endMs: number;
}>;

export type PlayerSessionState = Readonly<{
  status: PlayerSessionStatus;
  mediaId: string | null;
  positionMs: number;
  durationMs: number | null;
  playbackRate: 0.75 | 1 | 1.25 | 1.5 | 2;
  volume: number;
  activeCueId: string | null;
  loopRange: PlayerLoopRange | null;
  followTranscript: boolean;
  error: string | null;
}>;

export type PlayerSessionEvent =
  | Readonly<{ type: "mediaLoading"; mediaId: string }>
  | Readonly<{ type: "mediaReady"; durationMs: number | null; restoredPositionMs: number }>
  | Readonly<{ type: "play" }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "buffering" }>
  | Readonly<{ type: "ended" }>
  | Readonly<{ type: "failed"; message: string }>
  | Readonly<{ type: "timeUpdated"; positionMs: number; activeCueId: string | null }>
  | Readonly<{ type: "userSeeked"; positionMs: number; activeCueId: string | null }>
  | Readonly<{ type: "rateChanged"; playbackRate: PlayerSessionState["playbackRate"] }>
  | Readonly<{ type: "volumeChanged"; volume: number }>
  | Readonly<{ type: "loopChanged"; loopRange: PlayerLoopRange | null }>
  | Readonly<{ type: "followChanged"; followTranscript: boolean }>;

export const initialPlayerSessionState: PlayerSessionState = Object.freeze({
  status: "idle",
  mediaId: null,
  positionMs: 0,
  durationMs: null,
  playbackRate: 1,
  volume: 1,
  activeCueId: null,
  loopRange: null,
  followTranscript: true,
  error: null,
});

function boundedPosition(positionMs: number, durationMs: number | null): number {
  const lowerBound = Math.max(0, Math.round(positionMs));
  return durationMs === null ? lowerBound : Math.min(lowerBound, durationMs);
}

export function cueAtPosition(cues: readonly PlayerCue[], positionMs: number): string | null {
  const cue = cues.find(
    (item) =>
      item.startMs !== null &&
      positionMs >= item.startMs &&
      (item.endMs === null || positionMs < item.endMs),
  );
  return cue?.id ?? null;
}

export function reducePlayerSession(
  state: PlayerSessionState,
  event: PlayerSessionEvent,
): PlayerSessionState {
  switch (event.type) {
    case "mediaLoading":
      return Object.freeze({
        ...initialPlayerSessionState,
        status: "loading",
        mediaId: event.mediaId,
      });
    case "mediaReady":
      return Object.freeze({
        ...state,
        status: "ready",
        durationMs: event.durationMs,
        positionMs: boundedPosition(event.restoredPositionMs, event.durationMs),
        error: null,
      });
    case "play":
      return state.status === "ready" || state.status === "paused" || state.status === "ended"
        ? Object.freeze({ ...state, status: "playing" })
        : state;
    case "pause":
      return state.status === "playing" || state.status === "buffering"
        ? Object.freeze({ ...state, status: "paused" })
        : state;
    case "buffering":
      return state.status === "playing" ? Object.freeze({ ...state, status: "buffering" }) : state;
    case "ended":
      return Object.freeze({ ...state, status: "ended" });
    case "failed":
      return Object.freeze({ ...state, status: "error", error: event.message });
    case "timeUpdated":
      return Object.freeze({
        ...state,
        positionMs: boundedPosition(event.positionMs, state.durationMs),
        activeCueId: event.activeCueId,
      });
    case "userSeeked":
      return Object.freeze({
        ...state,
        positionMs: boundedPosition(event.positionMs, state.durationMs),
        activeCueId: event.activeCueId,
      });
    case "rateChanged":
      return Object.freeze({ ...state, playbackRate: event.playbackRate });
    case "volumeChanged":
      return Object.freeze({ ...state, volume: Math.max(0, Math.min(1, event.volume)) });
    case "loopChanged":
      return Object.freeze({ ...state, loopRange: event.loopRange });
    case "followChanged":
      return Object.freeze({ ...state, followTranscript: event.followTranscript });
  }
}

export function activeLoopShouldRestart(state: PlayerSessionState): boolean {
  return (
    state.status === "playing" &&
    state.loopRange !== null &&
    state.positionMs >= state.loopRange.endMs
  );
}

export function progressDeltaMs(
  previousPositionMs: number,
  currentPositionMs: number,
  wasPlaying: boolean,
): number {
  if (!wasPlaying || currentPositionMs <= previousPositionMs) return 0;
  return currentPositionMs - previousPositionMs;
}
