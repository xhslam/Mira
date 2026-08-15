import { describe, expect, it } from "vitest";

import {
  createUiSoundPlayer,
  UI_SOUND_CUES,
  type UiSoundCue,
  type UiSoundVoice,
} from "../../../src/feedback/ui-sound";

type VoiceCall = Readonly<{ cue: UiSoundCue; volume: number }>;

function voiceHarness() {
  const calls: VoiceCall[] = [];
  let stops = 0;
  let releases = 0;
  const voice: UiSoundVoice = {
    async play(cue, volume) {
      calls.push(Object.freeze({ cue, volume }));
    },
    async stop() {
      stops += 1;
    },
    release() {
      releases += 1;
    },
  };
  return {
    calls,
    voice,
    get releases() {
      return releases;
    },
    get stops() {
      return stops;
    },
  };
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("UI sound player", () => {
  it("does not expose high-frequency sound cues", () => {
    expect(UI_SOUND_CUES).not.toContain("typing");
    expect(UI_SOUND_CUES).not.toContain("press");
    expect(UI_SOUND_CUES).not.toContain("hover");
    expect(UI_SOUND_CUES).not.toContain("focus");
    expect(UI_SOUND_CUES).not.toContain("seek");
    expect(UI_SOUND_CUES).not.toContain("volume-change");
    expect(UI_SOUND_CUES).not.toContain("progress-step");
    expect(UI_SOUND_CUES).not.toContain("loading");
  });

  it("stays silent until the persistent preference enables it", async () => {
    const harness = voiceHarness();
    const player = createUiSoundPlayer({ createVoice: () => harness.voice, voiceCount: 1 });

    expect(player.play("success")).toBe(false);
    await flushTasks();
    expect(harness.calls).toEqual([]);
  });

  it("plays an enabled low-frequency cue at its semantic volume", async () => {
    const harness = voiceHarness();
    const player = createUiSoundPlayer({ createVoice: () => harness.voice, voiceCount: 1 });
    player.setEnabled(true);
    player.setVolume(0.5);

    expect(player.play("success")).toBe(true);
    await flushTasks();

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.cue).toBe("success");
    expect(harness.calls[0]?.volume).toBeCloseTo(0.115);
  });

  it("drops repeated cues during their cooldown", async () => {
    const harness = voiceHarness();
    let now = 1_000;
    const player = createUiSoundPlayer({
      createVoice: () => harness.voice,
      now: () => now,
      voiceCount: 1,
    });
    player.setEnabled(true);

    expect(player.play("select")).toBe(true);
    now += 100;
    expect(player.play("select")).toBe(false);
    now += 300;
    expect(player.play("select")).toBe(true);
    await flushTasks();

    expect(harness.calls.map((call) => call.cue)).toEqual(["select", "select"]);
  });

  it("stops while suppressed and releases every voice on destroy", async () => {
    const harnesses = [voiceHarness(), voiceHarness()];
    let index = 0;
    const player = createUiSoundPlayer({
      createVoice: () => harnesses[index++]?.voice ?? harnesses[0]!.voice,
      voiceCount: 2,
    });
    player.setEnabled(true);
    player.setSuppressed(true);

    expect(player.play("error")).toBe(false);
    player.destroy();
    await flushTasks();

    expect(harnesses.every((harness) => harness.stops >= 1)).toBe(true);
    expect(harnesses.map((harness) => harness.releases)).toEqual([1, 1]);
  });
});
