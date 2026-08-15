import { describe, expect, it } from "vitest";

import { searchLearningResources } from "../../../src/learning/learning-resource-search";
import type { LearningResource } from "../../../src/learning/learning-types";

function resource(
  id: string,
  title: string,
  content: string,
  translation: string | null,
  updatedAt: string,
): LearningResource {
  return Object.freeze({
    id,
    title,
    description: `${title} description`,
    language: "English",
    source: "imported",
    content,
    sentences: Object.freeze([
      Object.freeze({
        id: `${id}-sentence`,
        resourceId: id,
        order: 1,
        text: content,
        translation,
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
    ]),
    createdAt: updatedAt,
    updatedAt,
  });
}

describe("learning resource search", () => {
  const older = resource(
    "older",
    "Evening greetings",
    "How was your day?",
    "今天过得如何？",
    "2026-08-13T00:00:00.000Z",
  );
  const newer = resource(
    "newer",
    "Daily review",
    "I learned a lot.",
    "我学到了很多。",
    "2026-08-14T00:00:00.000Z",
  );

  it("searches titles, source text, and translated subtitles without mutating input", () => {
    const input = Object.freeze([older, newer]);

    expect(searchLearningResources(input, "  EVENING ").map((item) => item.id)).toEqual(["older"]);
    expect(searchLearningResources(input, "learned").map((item) => item.id)).toEqual(["newer"]);
    expect(searchLearningResources(input, "过得如何").map((item) => item.id)).toEqual(["older"]);
    expect(input.map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("shows the most recent resources first when the query is empty", () => {
    const results = searchLearningResources(Object.freeze([older, newer]), "   ");

    expect(results.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(Object.isFrozen(results)).toBe(true);
  });
});
