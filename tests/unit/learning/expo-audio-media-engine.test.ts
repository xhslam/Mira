import { describe, expect, it, vi } from "vitest";
import type { AudioPlayer } from "expo-audio";
import { ExpoAudioMediaEngine } from "../../../src/learning/data/providers/expo-audio-media-engine";

function createPlayer(overrides: Partial<AudioPlayer> = {}): AudioPlayer {
  return {
    replace: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    currentStatus: { duration: 0 },
    ...overrides,
  } as unknown as AudioPlayer;
}

describe("ExpoAudioMediaEngine release guard", () => {
  it("never calls native pause after session disposal", async () => {
    const player = createPlayer();
    const engine = new ExpoAudioMediaEngine(player);

    await engine.dispose();
    await expect(engine.pause()).resolves.toBeUndefined();

    expect(player.pause).not.toHaveBeenCalled();
  });

  it("contains an already-released synchronous native pause rejection", async () => {
    const pause = vi.fn(() => {
      throw new Error("Cannot use shared object that was already released");
    });
    const engine = new ExpoAudioMediaEngine(createPlayer({ pause }));

    await expect(engine.pause()).resolves.toBeUndefined();
    await expect(engine.pause()).resolves.toBeUndefined();

    expect(pause).toHaveBeenCalledOnce();
  });

  it("contains an already-released asynchronous native pause rejection", async () => {
    const pause = vi.fn(() =>
      Promise.reject(new Error("Cannot use shared object that was already released")),
    );
    const engine = new ExpoAudioMediaEngine(createPlayer({ pause }));

    await expect(engine.pause()).resolves.toBeUndefined();
    await expect(engine.pause()).resolves.toBeUndefined();

    expect(pause).toHaveBeenCalledOnce();
  });
});
