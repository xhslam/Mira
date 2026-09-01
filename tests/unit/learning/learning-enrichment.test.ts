import { describe, expect, it } from "vitest";
import { createVocabularyCard } from "../../../src/learning/enjoy-player-domain";
import {
  cleanMarkdownForLearning,
  extractImportantPhrases,
  findRelatedVocabulary,
} from "../../../src/learning/learning-enrichment";

describe("learning enrichment", () => {
  it("cleans Markdown presentation syntax before sentence learning", () => {
    expect(
      cleanMarkdownForLearning(
        "# Note\n\nA [useful phrase](https://example.com) helps.\n\n`ignore` **focus**.",
      ),
    ).toBe("Note A useful phrase helps. ignore focus.");
  });

  it("suggests only reusable expressions instead of repeated arbitrary word chunks", () => {
    const phrases = extractImportantPhrases([
      "I'm looking forward to seeing you.",
      "The weather is very beautiful today.",
    ]);
    expect(phrases.map((item) => item.phrase)).toContain("looking forward to");
    expect(phrases.map((item) => item.phrase)).not.toContain("very beautiful");
  });

  it("finds cards that share a learning context", () => {
    const related = createVocabularyCard({
      id: "related",
      term: "daily practice",
      definition: "regular practice",
      context: "Small daily practice improves language confidence.",
      now: "2026-08-13T00:00:00.000Z",
    });
    const unrelated = createVocabularyCard({
      id: "unrelated",
      term: "city traffic",
      definition: "road activity",
      context: "The city traffic was unusually busy.",
      now: "2026-08-13T00:00:00.000Z",
    });
    expect(
      findRelatedVocabulary("language practice", [unrelated, related]).map((card) => card.id),
    ).toEqual(["related"]);
  });
});
