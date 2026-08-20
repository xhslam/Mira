import { describe, expect, it } from "vitest";
import {
  createInitialLearningSnapshot,
  normalizeLearningSnapshot,
} from "../../../src/learning/learning-types";
import { seedLearningSnapshot } from "../../../src/learning/learning-seed";
import {
  addPracticeMinutes,
  deleteLearningResource,
  persistLearningPosition,
  saveLearningItem,
} from "../../../src/learning/learning-session";

describe("learning session persistence", () => {
  const seeded = seedLearningSnapshot(createInitialLearningSnapshot(), "2026-08-14T00:00:00.000Z");
  const resource = seeded.resources[0]!;
  const sentence = resource.sentences[0]!;
  it("persists the selected cue and resume position", () => {
    const next = persistLearningPosition(seeded, {
      resource,
      sentence,
      positionMs: 1250,
      listened: true,
      now: "2026-08-14T00:00:00.000Z",
    });
    expect(next.resources[0]?.lastPositionMs).toBe(1250);
    expect(next.practice.find((item) => item.sentenceId === sentence.id)).toMatchObject({
      listened: true,
      lastPositionMs: 1250,
    });
    expect(next.ui.selectedSentenceId).toBe(sentence.id);
  });
  it("accumulates daily practice minutes and saves contextual items idempotently", () => {
    const minutes = addPracticeMinutes(seeded, 90_000, new Date("2026-08-14T00:00:00.000Z"));
    const input = {
      kind: "word" as const,
      term: "evening",
      translation: "晚上",
      explanation: null,
      mediaId: resource.id,
      mediaTitle: resource.title,
      cueId: sentence.id,
      timestampMs: null,
      originalSentence: sentence.text,
    };
    const once = saveLearningItem(minutes, input);
    const twice = saveLearningItem(once, input);
    expect(once.goal.practiceMinutesToday).toBeCloseTo(1.5);
    expect(twice.savedItems).toHaveLength(1);
  });

  it("keeps legacy phrase data and initializes separate memories without destructive migration", () => {
    const legacy = {
      ...createInitialLearningSnapshot(),
      version: 4,
      vocabulary: Object.freeze([
        Object.freeze({
          id: "legacy-phrase",
          term: "daily practice",
          definition: "旧数据",
          context: "Small daily practice helps.",
          translation: null,
          sourceResourceId: null,
          repetitions: 0,
          intervalDays: 0,
          ease: 2.5,
          dueAt: "2026-08-14T00:00:00.000Z",
          lastReviewedAt: null,
          createdAt: "2026-08-14T00:00:00.000Z",
        }),
      ]),
    };

    const migrated = normalizeLearningSnapshot(legacy);

    expect(migrated.version).toBe(5);
    expect(migrated.vocabulary).toHaveLength(1);
    expect(migrated.vocabulary[0]?.id).toBe("legacy-phrase");
    expect(migrated.memories).toEqual([]);
  });

  it("deletes a resource together with every dependent learning record", () => {
    const track = Object.freeze({
      id: "track-1",
      resourceId: resource.id,
      label: "主字幕",
      language: "en",
      source: "manual" as const,
      isPrimary: true,
      sentences: resource.sentences,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    });
    const recording = Object.freeze({
      id: "recording-1",
      sentenceId: sentence.id,
      uri: "file:///echo.m4a",
      durationMs: 900,
      transcript: null,
      state: "ready" as const,
      createdAt: resource.createdAt,
    });
    const linked = Object.freeze({
      ...seeded,
      transcriptTracks: Object.freeze([track]),
      recordings: Object.freeze([recording]),
      assessments: Object.freeze([
        Object.freeze({
          id: "assessment-1",
          recordingId: recording.id,
          sentenceId: sentence.id,
          overall: 80,
          accuracy: 80,
          completeness: 80,
          fluency: 80,
          prosody: 80,
          transcript: sentence.text,
          wordScores: Object.freeze([]),
          contour: Object.freeze([]),
          createdAt: resource.createdAt,
        }),
      ]),
      savedItems: Object.freeze([
        Object.freeze({
          id: "saved-1",
          kind: "word" as const,
          term: "evening",
          translation: "晚上",
          explanation: null,
          mediaId: resource.id,
          mediaTitle: resource.title,
          cueId: sentence.id,
          timestampMs: null,
          originalSentence: sentence.text,
          createdAt: resource.createdAt,
        }),
      ]),
      ui: Object.freeze({
        ...seeded.ui,
        activeTranscriptTrackId: track.id,
      }),
    });

    const next = deleteLearningResource(linked, resource.id);

    expect(next.resources).toHaveLength(0);
    expect(next.practice).toHaveLength(0);
    expect(next.transcriptTracks).toHaveLength(0);
    expect(next.recordings).toHaveLength(0);
    expect(next.assessments).toHaveLength(0);
    expect(next.savedItems).toHaveLength(0);
    expect(next.courses[0]?.lessons).toHaveLength(0);
    expect(next.courseProgress).toHaveLength(0);
    expect(next.ui).toMatchObject({
      selectedResourceId: null,
      selectedSentenceId: null,
      activeTranscriptTrackId: null,
      selectedLessonId: null,
    });
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.resources)).toBe(true);
  });
});
