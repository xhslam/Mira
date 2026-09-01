import { describe, expect, it } from "vitest";
import { createVocabularyCard } from "../../../src/learning/enjoy-player-domain";
import {
  filterAndSortMemories,
  filterAndSortPhrases,
  setPhraseMastery,
  togglePhraseFavorite,
  updatePhraseCard,
} from "../../../src/learning/phrase-memory-domain";

function phrase(
  id: string,
  term: string,
  createdAt: string,
  overrides: Partial<ReturnType<typeof createVocabularyCard>> = {},
) {
  return Object.freeze({
    ...createVocabularyCard({
      id,
      term,
      definition: `释义：${term}`,
      context: `I need to ${term} what happened.`,
      now: createdAt,
      canonicalText: term,
      normalizedText: term,
      encounterCount: 1,
      lastEncounteredAt: createdAt,
    }),
    ...overrides,
  });
}

describe("phrase and memory library domain", () => {
  const cards = Object.freeze([
    phrase("p-old", "by the way", "2026-08-10T00:00:00.000Z", {
      isFavorite: true,
      masteryStatus: "mastered",
      masteredAt: "2026-08-11T00:00:00.000Z",
      encounterCount: 5,
      lastEncounteredAt: "2026-08-15T00:00:00.000Z",
    }),
    phrase("p-new", "figure out", "2026-08-20T00:00:00.000Z", {
      encounterCount: 2,
      lastEncounteredAt: "2026-08-21T00:00:00.000Z",
    }),
  ]);

  it("searches phrase text, canonical text, meaning and context", () => {
    expect(
      filterAndSortPhrases(cards, { query: "释义：figure", sort: "newest", filter: "all" }),
    ).toEqual([cards[1]]);
    expect(
      filterAndSortPhrases(cards, { query: "happened", sort: "newest", filter: "all" }),
    ).toHaveLength(2);
  });

  it("sorts phrases by newest, oldest, frequency, recent encounter, and alphabetically", () => {
    expect(
      filterAndSortPhrases(cards, { query: "", sort: "newest", filter: "all" }).map(
        (item) => item.id,
      ),
    ).toEqual(["p-new", "p-old"]);
    expect(
      filterAndSortPhrases(cards, { query: "", sort: "oldest", filter: "all" }).map(
        (item) => item.id,
      ),
    ).toEqual(["p-old", "p-new"]);
    expect(
      filterAndSortPhrases(cards, { query: "", sort: "frequency", filter: "all" })[0]?.id,
    ).toBe("p-old");
    expect(
      filterAndSortPhrases(cards, { query: "", sort: "recentEncounter", filter: "all" })[0]?.id,
    ).toBe("p-new");
    expect(
      filterAndSortPhrases(cards, { query: "", sort: "alphabetical", filter: "all" })[0]?.id,
    ).toBe("p-old");
  });

  it("filters by learning state and favorites, and persists favorite and mastery changes immutably", () => {
    expect(filterAndSortPhrases(cards, { query: "", sort: "newest", filter: "favorites" })).toEqual(
      [cards[0]],
    );
    expect(filterAndSortPhrases(cards, { query: "", sort: "newest", filter: "mastered" })).toEqual([
      cards[0],
    ]);
    expect(filterAndSortPhrases(cards, { query: "", sort: "newest", filter: "learning" })).toEqual([
      cards[1],
    ]);

    const toggled = togglePhraseFavorite(cards[1]!, "2026-08-22T00:00:00.000Z");
    expect(toggled).toMatchObject({ isFavorite: true, updatedAt: "2026-08-22T00:00:00.000Z" });
    const mastered = setPhraseMastery(toggled, "mastered", "2026-08-22T00:00:00.000Z");
    expect(mastered).toMatchObject({
      masteryStatus: "mastered",
      masteredAt: "2026-08-22T00:00:00.000Z",
    });
  });

  it("edits a phrase through normalize, canonicalize, and duplicate validation", () => {
    const edited = updatePhraseCard(
      cards,
      "p-new",
      {
        term: "figured it out",
        definition: "弄清楚",
        notes: "常用于解释问题",
        masteryStatus: "learning",
      },
      "2026-08-22T00:00:00.000Z",
    );

    expect(edited.error).toBeNull();
    expect(edited.cards.find((item) => item.id === "p-new")).toMatchObject({
      canonicalText: "figure out",
      normalizedText: "figured it out",
      definition: "弄清楚",
      notes: "常用于解释问题",
    });

    const duplicate = updatePhraseCard(
      cards,
      "p-new",
      {
        term: "by the way",
        definition: "顺便说一下",
        notes: "",
        masteryStatus: "learning",
      },
      "2026-08-22T00:00:00.000Z",
    );
    expect(duplicate.error).toBe("duplicate");
    expect(duplicate.cards).toEqual(cards);
  });

  it("searches and sorts independent memory records by content, category and tags", () => {
    const memories = Object.freeze([
      Object.freeze({
        id: "m-old",
        text: "用户更喜欢自然的美式表达",
        category: "preference" as const,
        tags: Object.freeze(["英语学习", "偏好"]),
        sourceType: "assistant" as const,
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
      }),
      Object.freeze({
        id: "m-new",
        text: "用户正在练习 IELTS Speaking",
        category: "goal" as const,
        tags: Object.freeze(["学习目标"]),
        sourceType: "user" as const,
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }),
    ]);

    expect(filterAndSortMemories(memories, { query: "偏好", sort: "newest" })).toEqual([
      memories[0],
    ]);
    expect(
      filterAndSortMemories(memories, { query: "", sort: "oldest" }).map((item) => item.id),
    ).toEqual(["m-old", "m-new"]);
    expect(filterAndSortMemories(memories, { query: "", sort: "updated" })[0]?.id).toBe("m-new");
  });
});
