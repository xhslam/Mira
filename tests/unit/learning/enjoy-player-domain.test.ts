import { describe, expect, it } from "vitest";
import {
  assessPronunciationLocally,
  createVocabularyCard,
  parseSrtOrVtt,
  reviewVocabularyCard,
  splitLearningSentences,
  toAnkiCsv,
} from "../../../src/learning/enjoy-player-domain";

describe("Enjoy Player learning domain", () => {
  it("parses SRT and VTT cues into time-aligned captions", () => {
    const cues = parseSrtOrVtt(
      "WEBVTT\n\n1\n00:00:01.250 --> 00:00:03.000\nHello world\n\n2\n00:00:04,000 --> 00:00:05,500\nKeep going",
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ startMs: 1250, endMs: 3000, text: "Hello world" });
  });
  it("schedules known cards into future local review", () => {
    const card = createVocabularyCard({
      id: "word-1",
      term: "compound",
      definition: "to increase",
      context: "Consistency compounds.",
      now: "2026-08-13T00:00:00.000Z",
    });
    const next = reviewVocabularyCard(card, "known", new Date("2026-08-13T00:00:00.000Z"));
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(new Date(next.dueAt).getTime()).toBeGreaterThan(new Date(card.dueAt).getTime());
  });
  it("creates a transparent local assessment with category scores", () => {
    const result = assessPronunciationLocally({
      id: "a1",
      recordingId: "r1",
      sentenceId: "s1",
      expected: "Small steps build strong habits",
      transcript: "Small steps build strong habits",
      durationMs: 2300,
      now: "2026-08-13T00:00:00.000Z",
    });
    expect(result.overall).toBeGreaterThan(50);
    expect(result.wordScores).toHaveLength(5);
    expect(result.contour.length).toBeGreaterThan(10);
  });
  it("exports portable Anki CSV with escaped values", () => {
    const card = createVocabularyCard({
      id: "word-2",
      term: 'say "hello"',
      definition: "greet",
      context: "Say hello.",
      now: "2026-08-13T00:00:00.000Z",
    });
    expect(toAnkiCsv([card])).toContain('"say ""hello"""');
  });
  it("splits Markdown prose into clean sentence learning units", () => {
    expect(
      splitLearningSentences(
        "# Daily English\n\n- Dr. Smith said hello. This is a [useful phrase](https://example.com)!\nKeep going?",
      ),
    ).toEqual(["Dr. Smith said hello.", "This is a useful phrase!", "Keep going?"]);
  });
});
