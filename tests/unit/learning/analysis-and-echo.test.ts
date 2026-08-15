import { describe, expect, it } from "vitest";
import { parseStructuredSentenceAnalysis } from "../../../src/learning/domain/analysis/sentence-analysis";
import {
  echoStatusCopy,
  initialEchoSession,
  reduceEchoSession,
} from "../../../src/learning/domain/echo/echo-machine";

describe("structured sentence analysis", () => {
  it("accepts bounded, structured analysis while discarding empty elements", () => {
    const result = parseStructuredSentenceAnalysis(
      JSON.stringify({
        sentencePatterns: [
          { title: "主谓宾", explanation: "说明动作与对象。" },
          { title: "", explanation: "ignore" },
        ],
        keyPhrases: [
          {
            phrase: "look after",
            translation: "照顾",
            explanation: "照看某人或事物",
            category: "verb",
            cefr: "A2",
          },
        ],
        grammarPoints: [
          { title: "一般现在时", explanation: "表达习惯", examples: ["I look after her."] },
        ],
        contextualExplanation: "这里表示日常照顾。",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sentencePatterns).toHaveLength(1);
    expect(result.value.keyPhrases[0]?.phrase).toBe("look after");
    expect(result.value.grammarPoints[0]?.examples).toEqual(["I look after her."]);
  });

  it("returns an empty safe fallback for invalid JSON", () => {
    const result = parseStructuredSentenceAnalysis("not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fallback.keyPhrases).toEqual([]);
  });
});

describe("echo session", () => {
  it("moves through original listening, recording, replay and completion", () => {
    const listening = reduceEchoSession(initialEchoSession, { type: "begin", cueId: "cue-1" });
    const ready = reduceEchoSession(listening, { type: "originalFinished" });
    const recording = reduceEchoSession(ready, { type: "recordStart" });
    const recorded = reduceEchoSession(recording, {
      type: "recordSaved",
      recordingId: "recording-1",
    });
    const replaying = reduceEchoSession(recorded, { type: "replayStart" });
    const replayed = reduceEchoSession(replaying, { type: "replayFinished" });

    expect(listening.state).toBe("listeningOriginal");
    expect(ready.state).toBe("readyToRecord");
    expect(recorded.recordingId).toBe("recording-1");
    expect(replayed.state).toBe("recorded");
    expect(echoStatusCopy(replayed)).toContain("尚未配置发音评测");
  });
});
