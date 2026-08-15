import type { AudioPlayer, AudioStatus } from "expo-audio";
import type {
  MediaEngineAdapter,
  MediaEngineEvent,
} from "../../application/player-session/media-engine";

function statusEvents(status: AudioStatus): readonly MediaEngineEvent[] {
  const events: MediaEngineEvent[] = [
    Object.freeze({
      type: "time",
      positionMs: Math.max(0, Math.round(status.currentTime * 1_000)),
      durationMs: status.duration > 0 ? Math.round(status.duration * 1_000) : null,
    }),
  ];
  if (status.didJustFinish) events.push(Object.freeze({ type: "status", status: "ended" }));
  else if (status.isBuffering) events.push(Object.freeze({ type: "status", status: "buffering" }));
  else if (status.playing) events.push(Object.freeze({ type: "status", status: "playing" }));
  else if (status.isLoaded) events.push(Object.freeze({ type: "status", status: "paused" }));
  return Object.freeze(events);
}

/**
 * useAudioPlayer owns native release. Android can reject a native call
 * asynchronously after a SharedObject was released, so every bridge command is
 * awaited and contained here rather than relying on a synchronous try/catch.
 */
export class ExpoAudioMediaEngine implements MediaEngineAdapter {
  private released = false;

  public constructor(private readonly player: AudioPlayer) {}

  public async load(
    input: Readonly<{
      uri: string;
      restoredPositionMs: number;
      playbackRate: number;
      volume: number;
    }>,
  ): Promise<number | null> {
    if (!(await this.invoke(() => this.player.replace(input.uri)))) return null;
    if (!(await this.invoke(() => (this.player.playbackRate = input.playbackRate)))) return null;
    if (!(await this.invoke(() => (this.player.volume = input.volume)))) return null;
    if (
      !(await this.invoke(
        () => (this.player.currentTime = Math.max(0, input.restoredPositionMs / 1_000)),
      ))
    ) {
      return null;
    }
    return this.readDuration();
  }

  public async play(): Promise<void> {
    await this.invoke(() => this.player.play());
  }

  public async pause(): Promise<void> {
    await this.invoke(() => this.player.pause());
  }

  public async seekTo(positionMs: number): Promise<void> {
    await this.invoke(() => (this.player.currentTime = Math.max(0, positionMs / 1_000)));
  }

  public async setPlaybackRate(rate: number): Promise<void> {
    await this.invoke(() => (this.player.playbackRate = rate));
  }

  public async setVolume(volume: number): Promise<void> {
    await this.invoke(() => (this.player.volume = Math.max(0, Math.min(1, volume))));
  }

  public subscribe(listener: (event: MediaEngineEvent) => void): () => void {
    if (this.released) return () => undefined;
    try {
      const subscription = this.player.addListener("playbackStatusUpdate", (status) => {
        if (this.released) return;
        statusEvents(status).forEach(listener);
      });
      return () => subscription.remove();
    } catch (error) {
      this.markReleasedIfNeeded(error);
      return () => undefined;
    }
  }

  public async dispose(): Promise<void> {
    // The owner hook stops and releases the native player. Do not pause here:
    // unmount ordering makes that bridge call race native release on Android.
    this.released = true;
  }

  private readDuration(): number | null {
    if (this.released) return null;
    try {
      const duration = this.player.currentStatus.duration;
      return duration > 0 ? Math.round(duration * 1_000) : null;
    } catch (error) {
      this.markReleasedIfNeeded(error);
      return null;
    }
  }

  private async invoke(command: () => unknown): Promise<boolean> {
    if (this.released) return false;
    try {
      // Expo's type surface declares some Android commands as void, but their
      // bridge may still return a rejecting Promise after the object is freed.
      await command();
      return true;
    } catch (error) {
      this.markReleasedIfNeeded(error);
      return false;
    }
  }

  private markReleasedIfNeeded(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (/already released|shared object|AudioPlayer/i.test(message)) this.released = true;
  }
}
