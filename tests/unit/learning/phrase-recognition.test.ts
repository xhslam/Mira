import { describe, expect, it } from "vitest";
import {
  MIN_AUTO_SAVE_CONFIDENCE,
  extractPhraseCandidates,
  normalizePhrase,
  shouldAutoSavePhrase,
  upsertPhraseCard,
} from "../../../src/learning/phrase-recognition";
import { createVocabularyCard } from "../../../src/learning/enjoy-player-domain";

describe("phrase recognition", () => {
  it("normalizes punctuation, spacing, quotes, and casing without changing the display text", () => {
    expect(normalizePhrase("  “Figure   it OUT!”  ")).toBe("figure it out");
  });

  it("extracts a reusable phrasal verb instead of arbitrary word chunks", () => {
    const candidates = extractPhraseCandidates("I need to figure out what happened.");

    expect(candidates.map((candidate) => candidate.canonicalText)).toContain("figure out");
    expect(candidates.map((candidate) => candidate.canonicalText)).not.toContain("need to");
    expect(candidates.map((candidate) => candidate.canonicalText)).not.toContain("out what");
    expect(candidates.map((candidate) => candidate.canonicalText)).not.toContain("what happened");
  });

  it("recognizes inflected phrasal verbs and canonicalizes separable particles", () => {
    const candidates = extractPhraseCandidates("I figured it out yesterday.");

    expect(candidates).toContainEqual(
      expect.objectContaining({
        canonicalText: "figure out",
        phraseType: "phrasal_verb",
      }),
    );
  });

  it("recognizes a verb-preposition expression, collocation, and fixed expression", () => {
    expect(extractPhraseCandidates("I'm looking forward to seeing you.")).toContainEqual(
      expect.objectContaining({ canonicalText: "look forward to" }),
    );
    expect(extractPhraseCandidates("Small steps help you make progress.")).toContainEqual(
      expect.objectContaining({ canonicalText: "make progress", phraseType: "collocation" }),
    );
    expect(extractPhraseCandidates("By the way, did you call him?")).toContainEqual(
      expect.objectContaining({ canonicalText: "by the way", phraseType: "fixed_expression" }),
    );
  });

  it("rejects ordinary adjacent words and grammatical fragments", () => {
    expect(extractPhraseCandidates("The weather is very beautiful today.")).toEqual([]);
    expect(extractPhraseCandidates("Because I didn't know.")).toEqual([]);
  });

  it("uses a precision-first confidence gate for automated candidates", () => {
    const candidate = extractPhraseCandidates("I need to figure out what happened.")[0];

    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBeGreaterThanOrEqual(MIN_AUTO_SAVE_CONFIDENCE);
    expect(candidate ? shouldAutoSavePhrase(candidate) : false).toBe(true);
  });

  it("updates an existing canonical phrase encounter instead of creating a duplicate", () => {
    const existing = createVocabularyCard({
      id: "phrase-1",
      term: "figure out",
      definition: "弄清楚",
      context: "I need to figure out what happened.",
      now: "2026-08-20T00:00:00.000Z",
      canonicalText: "figure out",
      normalizedText: "figure out",
      encounterCount: 1,
      lastEncounteredAt: "2026-08-20T00:00:00.000Z",
    });

    const result = upsertPhraseCard(
      [existing],
      {
        displayText: "figured it out",
        canonicalText: "figure out",
        confidence: 0.97,
        context: "I figured it out yesterday.",
        phraseType: "phrasal_verb",
      },
      "2026-08-21T00:00:00.000Z",
    );

    expect(result.cards).toHaveLength(1);
    expect(result.created).toBe(false);
    expect(result.cards[0]).toMatchObject({
      id: "phrase-1",
      canonicalText: "figure out",
      encounterCount: 2,
      lastEncounteredAt: "2026-08-21T00:00:00.000Z",
    });
    expect(result.cards[0]?.contexts).toContain("I figured it out yesterday.");
  });

  it("allows a user-selected manual expression even if automatic recognition would reject it", () => {
    const result = upsertPhraseCard(
      [],
      {
        displayText: "really freaking good",
        canonicalText: "really freaking good",
        confidence: 0.12,
        context: "That was really freaking good.",
        phraseType: "manual",
      },
      "2026-08-20T00:00:00.000Z",
      { manual: true },
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      term: "really freaking good",
      confidence: 0.12,
      canonicalText: "really freaking good",
    });
  });
});
