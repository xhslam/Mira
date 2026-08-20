import { describe, expect, it, vi } from "vitest";
import {
  PlayerSessionController,
  type MediaEngineAdapter,
  type MediaEngineEvent,
} from "../../../src/learning/application/player-session/media-engine";

function createEngine() {
  let listener: ((event: MediaEngineEvent) => void) | null = null;
  const load = vi.fn(async () => 3_000);
  const play = vi.fn(async () => undefined);
  const pause = vi.fn(async () => undefined);
  const seekTo = vi.fn(async () => undefined);
  const dispose = vi.fn(async () => undefined);
  const engine: MediaEngineAdapter = {
    load,
    play,
    pause,
    seekTo,
    setPlaybackRate: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    subscribe: (nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    },
    dispose,
  };
  return Object.freeze({
    engine,
    load,
    play,
    pause,
    seekTo,
    dispose,
    emit: (event: MediaEngineEvent) => listener?.(event),
  });
}

describe("PlayerSessionController lifecycle", () => {
  it("makes cleanup idempotent and ignores delayed media commands", async () => {
    const fake = createEngine();
    const controller = new PlayerSessionController(fake.engine, {
      save: vi.fn(async () => undefined),
    });

    await Promise.all([controller.dispose(), controller.dispose()]);
    await controller.play();
    await controller.pause();
    await controller.seekTo(500);

    expect(fake.dispose).toHaveBeenCalledOnce();
    expect(fake.play).not.toHaveBeenCalled();
    expect(fake.pause).not.toHaveBeenCalled();
    expect(fake.seekTo).not.toHaveBeenCalled();
  });

  it("does not publish an async load result after teardown", async () => {
    let resolveLoad!: (durationMs: number) => void;
    const pendingLoad = new Promise<number>((resolve) => {
      resolveLoad = resolve;
    });
    const fake = createEngine();
    fake.load.mockImplementation(() => pendingLoad);
    const controller = new PlayerSessionController(fake.engine, {
      save: vi.fn(async () => undefined),
    });
    const states: string[] = [];
    controller.subscribe((state) => states.push(state.status));

    const loading = controller.load({
      mediaId: "media-1",
      uri: "file:///sample.mp3",
      cues: [],
      restoredPositionMs: 0,
    });
    await controller.dispose();
    resolveLoad(3_000);
    await loading;

    expect(states).toEqual(["idle", "loading"]);
  });

  it("contains a progress-store failure while unmounting", async () => {
    const fake = createEngine();
    const controller = new PlayerSessionController(fake.engine, {
      save: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    });

    await expect(controller.dispose()).resolves.toBeUndefined();
    expect(fake.dispose).toHaveBeenCalledOnce();
  });
});
