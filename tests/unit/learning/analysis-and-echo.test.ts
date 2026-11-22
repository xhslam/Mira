import { describe, expect, it } from "vitest";
import { parseSentenceComponents } from "../../../src/learning/domain/analysis/sentence-components";
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

  it("validates grammatical roles against the exact original text", () => {
    const raw = JSON.stringify({
      sentenceComponents: [
        { text: "She ", role: "subject" },
        { text: "is ", role: "predicate" },
        { text: "happy.", role: "predicative" },
      ],
    });
    const result = parseStructuredSentenceAnalysis(raw, "She is happy.");
    expect(result.ok && result.value.sentenceComponents).toHaveLength(3);
    const mismatch = parseStructuredSentenceAnalysis(raw, "He is happy.");
    expect(mismatch.ok).toBe(false);
  });

  it("rejects unknown roles, changed spacing, overlapping text and unbounded annotations", () => {
    for (const value of [
      [{ text: "She", role: "invented" }],
      [
        { text: "She  ", role: "subject" },
        { text: "is happy.", role: "predicate" },
      ],
      [
        { text: "She ", role: "subject" },
        { text: "She is happy.", role: "predicate" },
      ],
      Array.from({ length: 129 }, () => ({ text: "x", role: "other" })),
    ]) {
      expect(parseSentenceComponents(value, "She is happy.")).toEqual([]);
    }
    const result = parseSentenceComponents(
      [{ text: "She is happy.", role: "other" }],
      "She is happy.",
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  it("returns an empty safe fallback for invalid JSON", () => {
    const result = parseStructuredSentenceAnalysis("not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fallback.keyPhrases).toEqual([]);
  });
});

describe("echo session", () => {
  it("starts a new recording directly without playing original or replay", () => {
    const recording = reduceEchoSession(initialEchoSession, {
      type: "recordStart",
      cueId: "cue-1",
    });
    expect(recording.state).toBe("recording");
    expect(recording.cueId).toBe("cue-1");
    const saved = reduceEchoSession(recording, { type: "recordSaved", recordingId: "r1" });
    expect(reduceEchoSession(saved, { type: "recordStart", cueId: "cue-2" })).toMatchObject({
      state: "recording",
      cueId: "cue-2",
      recordingId: null,
    });
  });

  it("can explicitly replay a saved recording after reopening the sentence", () => {
    expect(
      reduceEchoSession(initialEchoSession, {
        type: "replayStart",
        cueId: "cue-1",
        recordingId: "r1",
      }),
    ).toMatchObject({ state: "replaying", cueId: "cue-1", recordingId: "r1" });
  });

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
