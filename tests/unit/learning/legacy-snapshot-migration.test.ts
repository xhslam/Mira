import { describe, expect, it } from "vitest";
import {
  createInitialLearningSnapshot,
  type LearningSentenceAnalysis,
} from "../../../src/learning/learning-types";
import { createLegacyMigrationPlan } from "../../../src/learning/data/migrations/legacy-snapshot-migration";

describe("legacy learning snapshot migration", () => {
  it("preserves grammatical spans in analysis payloads without changing legacy records", () => {
    const analysis: LearningSentenceAnalysis = {
      id: "a1",
      resourceId: "media-1",
      sentenceId: "cue-1",
      sourceHash: "hash",
      version: "3",
      state: "ready",
      sentenceComponents: [{ text: "Hello.", role: "other" }],
      sentencePatterns: [],
      keyPhrases: [],
      grammarPoints: [],
      contextualExplanation: null,
      error: null,
      updatedAt: "2026-11-22T00:00:00.000Z",
    };
    const plan = createLegacyMigrationPlan({
      ...createInitialLearningSnapshot(),
      analyses: [analysis],
    });
    const write = plan.writes.find((item) =>
      item.sql.includes("INSERT OR REPLACE INTO sentence_analyses"),
    );
    expect(JSON.parse(String(write?.params[6])).sentenceComponents).toEqual(
      analysis.sentenceComponents,
    );
    expect(JSON.parse(plan.backupJson).analyses[0]).toEqual(analysis);
  });

  it("keeps a backup and turns a legacy resource into normalized media, track and cue writes", () => {
    const initial = createInitialLearningSnapshot();
    const snapshot = Object.freeze({
      ...initial,
      resources: Object.freeze([
        Object.freeze({
          id: "media-1",
          title: "A short lesson",
          description: "",
          language: "en",
          source: "imported" as const,
          content: "Hello world.",
          sentences: Object.freeze([
            Object.freeze({
              id: "cue-1",
              resourceId: "media-1",
              order: 1,
              text: "Hello world.",
              translation: "你好，世界。",
              startMs: 0,
              endMs: 1_000,
              sourceAudioUri: null,
            }),
          ]),
          mediaUri: "file:///lesson.mp3",
          mediaKind: "audio" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
      recordings: Object.freeze([
        Object.freeze({
          id: "recording-1",
          sentenceId: "cue-1",
          uri: "file:///echo.m4a",
          durationMs: 900,
          transcript: null,
          state: "ready" as const,
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
      ]),
      savedItems: Object.freeze([
        Object.freeze({
          id: "saved-1",
          kind: "word" as const,
          term: "Hello",
          translation: "你好",
          explanation: null,
          mediaId: "media-1",
          mediaTitle: "A short lesson",
          cueId: "cue-1",
          timestampMs: 0,
          originalSentence: "Hello world.",
          createdAt: "2026-01-01T00:02:00.000Z",
        }),
      ]),
    });

    const plan = createLegacyMigrationPlan(snapshot);

    expect(JSON.parse(plan.backupJson).resources).toHaveLength(1);
    expect(plan.expected).toEqual({ media: 1, tracks: 1, cues: 1, recordings: 1, savedTerms: 1 });
    expect(plan.writes.some((write) => write.sql.includes("learning_media"))).toBe(true);
    expect(plan.writes.some((write) => write.sql.includes("transcript_tracks"))).toBe(true);
    expect(plan.writes.some((write) => write.sql.includes("transcript_cues"))).toBe(true);
    expect(plan.writes.some((write) => write.sql.includes("echo_recordings"))).toBe(true);
    expect(plan.writes.some((write) => write.sql.includes("term_encounters"))).toBe(true);
  });
});
