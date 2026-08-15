import { describe, expect, it } from "vitest";
import {
  cueAtPosition,
  initialPlayerSessionState,
  progressDeltaMs,
  reducePlayerSession,
} from "../../../src/learning/domain/playback/player-session";

describe("player session", () => {
  const cues = [
    { id: "cue-1", startMs: 0, endMs: 1_000 },
    { id: "cue-2", startMs: 1_000, endMs: 2_000 },
  ] as const;

  it("changes only activeCueId as engine time crosses a cue boundary", () => {
    const loading = reducePlayerSession(initialPlayerSessionState, {
      type: "mediaLoading",
      mediaId: "media-1",
    });
    const ready = reducePlayerSession(loading, {
      type: "mediaReady",
      durationMs: 4_000,
      restoredPositionMs: 200,
    });
    const playing = reducePlayerSession(ready, { type: "play" });
    const updated = reducePlayerSession(playing, {
      type: "timeUpdated",
      positionMs: 1_250,
      activeCueId: cueAtPosition(cues, 1_250),
    });

    expect(updated.status).toBe("playing");
    expect(updated.positionMs).toBe(1_250);
    expect(updated.activeCueId).toBe("cue-2");
  });

  it("keeps media clock progress separate from cue click seeks", () => {
    const ready = reducePlayerSession(
      reducePlayerSession(initialPlayerSessionState, { type: "mediaLoading", mediaId: "media-1" }),
      { type: "mediaReady", durationMs: 4_000, restoredPositionMs: 0 },
    );
    const selected = reducePlayerSession(ready, {
      type: "userSeeked",
      positionMs: 1_000,
      activeCueId: "cue-2",
    });

    expect(selected.status).toBe("ready");
    expect(selected.positionMs).toBe(1_000);
    expect(progressDeltaMs(1_000, 500, true)).toBe(0);
    expect(progressDeltaMs(1_000, 1_400, true)).toBe(400);
    expect(progressDeltaMs(1_000, 1_400, false)).toBe(0);
  });
});
