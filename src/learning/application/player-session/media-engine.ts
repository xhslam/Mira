import {
  cueAtPosition,
  initialPlayerSessionState,
  reducePlayerSession,
  type PlayerCue,
  type PlayerSessionEvent,
  type PlayerSessionState,
} from "../../domain/playback/player-session";

export type MediaEngineStatus = "ready" | "playing" | "paused" | "buffering" | "ended" | "error";

export type MediaEngineEvent =
  | Readonly<{ type: "status"; status: MediaEngineStatus }>
  | Readonly<{ type: "time"; positionMs: number; durationMs: number | null }>
  | Readonly<{ type: "error"; message: string }>;

export interface MediaEngineAdapter {
  load(
    input: Readonly<{
      uri: string;
      restoredPositionMs: number;
      playbackRate: number;
      volume: number;
    }>,
  ): Promise<number | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  subscribe(listener: (event: MediaEngineEvent) => void): () => void;
  dispose(): Promise<void>;
}

export interface PlayerSessionProgressStore {
  save(
    input: Readonly<{
      mediaId: string;
      positionMs: number;
      playedDeltaMs: number;
      occurredAt: string;
    }>,
  ): Promise<void>;
}

export type PlayerSessionListener = (state: PlayerSessionState) => void;

/** The controller owns the only authoritative playback state, outside of any screen. */
export class PlayerSessionController {
  private state: PlayerSessionState = initialPlayerSessionState;
  private readonly listeners = new Set<PlayerSessionListener>();
  private readonly unsubscribeEngine: () => void;
  private cues: readonly PlayerCue[] = [];
  private lastCommittedPositionMs = 0;
  private lastPersistedAtMs = 0;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  public constructor(
    private readonly engine: MediaEngineAdapter,
    private readonly progressStore: PlayerSessionProgressStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.unsubscribeEngine = engine.subscribe((event) => this.onEngineEvent(event));
  }

  public getState(): PlayerSessionState {
    return this.state;
  }

  public subscribe(listener: PlayerSessionListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async load(
    input: Readonly<{
      mediaId: string;
      uri: string;
      cues: readonly PlayerCue[];
      restoredPositionMs: number;
    }>,
  ): Promise<void> {
    if (this.disposed) return;
    this.cues = input.cues;
    this.lastCommittedPositionMs = input.restoredPositionMs;
    this.lastPersistedAtMs = this.now().getTime();
    this.dispatch({ type: "mediaLoading", mediaId: input.mediaId });
    try {
      const durationMs = await this.engine.load({
        uri: input.uri,
        restoredPositionMs: input.restoredPositionMs,
        playbackRate: this.state.playbackRate,
        volume: this.state.volume,
      });
      if (this.disposed) return;
      this.dispatch({
        type: "mediaReady",
        durationMs,
        restoredPositionMs: input.restoredPositionMs,
      });
      this.dispatch({
        type: "timeUpdated",
        positionMs: input.restoredPositionMs,
        activeCueId: cueAtPosition(this.cues, input.restoredPositionMs),
      });
    } catch (error) {
      if (!this.disposed)
        this.dispatch({
          type: "failed",
          message: error instanceof Error ? error.message : "媒体无法加载。",
        });
    }
  }

  public async play(): Promise<void> {
    if (this.disposed) return;
    if (this.state.status === "ended") await this.seekTo(0);
    if (this.disposed) return;
    await this.engine.play();
    if (!this.disposed) this.dispatch({ type: "play" });
  }

  public async pause(): Promise<void> {
    if (this.disposed) return;
    await this.engine.pause();
    if (this.disposed) return;
    this.dispatch({ type: "pause" });
    await this.commitProgress(true);
  }

  public async seekTo(positionMs: number): Promise<void> {
    if (this.disposed) return;
    await this.engine.seekTo(positionMs);
    if (!this.disposed)
      this.dispatch({
        type: "userSeeked",
        positionMs,
        activeCueId: cueAtPosition(this.cues, positionMs),
      });
  }

  public async selectCue(cue: PlayerCue): Promise<void> {
    if (!this.disposed) await this.seekTo(cue.startMs ?? 0);
  }

  public async setPlaybackRate(playbackRate: PlayerSessionState["playbackRate"]): Promise<void> {
    if (this.disposed) return;
    await this.engine.setPlaybackRate(playbackRate);
    if (!this.disposed) this.dispatch({ type: "rateChanged", playbackRate });
  }

  public async setVolume(volume: number): Promise<void> {
    if (this.disposed) return;
    await this.engine.setVolume(volume);
    if (!this.disposed) this.dispatch({ type: "volumeChanged", volume });
  }

  public setFollowTranscript(followTranscript: boolean): void {
    if (!this.disposed) this.dispatch({ type: "followChanged", followTranscript });
  }

  public async flush(): Promise<void> {
    if (!this.disposed) await this.commitProgress(true);
  }

  public dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.listeners.clear();
    try {
      this.unsubscribeEngine();
    } catch {
      // Native subscription may already be released.
    }
    this.disposePromise = this.disposeSafely();
    return this.disposePromise;
  }

  private async disposeSafely(): Promise<void> {
    try {
      await this.commitProgress(true);
    } catch {
      // Unmount persistence is best effort.
    }
    try {
      await this.engine.dispose();
    } catch {
      // useAudioPlayer owns the native release.
    }
  }

  private onEngineEvent(event: MediaEngineEvent): void {
    if (this.disposed) return;
    if (event.type === "time") {
      this.dispatch({
        type: "timeUpdated",
        positionMs: event.positionMs,
        activeCueId: cueAtPosition(this.cues, event.positionMs),
      });
      void this.commitProgress(false);
      return;
    }
    if (event.type === "error") {
      this.dispatch({ type: "failed", message: event.message });
      return;
    }
    if (event.status === "ended") {
      this.dispatch({ type: "ended" });
      void this.commitProgress(true);
    } else if (event.status === "buffering") {
      this.dispatch({ type: "buffering" });
    } else if (event.status === "paused") {
      this.dispatch({ type: "pause" });
      void this.commitProgress(true);
    }
  }

  private dispatch(event: PlayerSessionEvent): void {
    if (this.disposed) return;
    this.state = reducePlayerSession(this.state, event);
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async commitProgress(force: boolean): Promise<void> {
    if (!this.state.mediaId) return;
    const nowMs = this.now().getTime();
    if (!force && nowMs - this.lastPersistedAtMs < 5_000) return;
    const playedDeltaMs =
      this.state.status === "playing"
        ? Math.max(0, this.state.positionMs - this.lastCommittedPositionMs)
        : 0;
    await this.progressStore.save({
      mediaId: this.state.mediaId,
      positionMs: this.state.positionMs,
      playedDeltaMs,
      occurredAt: this.now().toISOString(),
    });
    this.lastCommittedPositionMs = this.state.positionMs;
    this.lastPersistedAtMs = nowMs;
  }
}
