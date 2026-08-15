import { describe, expect, test, vi } from "vitest";
import { pauseAudioSafely } from "../../../src/learning/safe-audio-player";

describe("pauseAudioSafely", () => {
  test("pauses a live native player", () => {
    const pause = vi.fn();
    expect(pauseAudioSafely(pause)).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
  });

  test("contains a released native player rejection during cleanup", () => {
    const pause = vi.fn(() => {
      throw new Error("Cannot use shared object that was already released");
    });
    expect(() => pauseAudioSafely(pause)).not.toThrow();
    expect(pauseAudioSafely(pause)).toBe(false);
  });
});
