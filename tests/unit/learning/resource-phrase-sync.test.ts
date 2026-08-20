import { describe, expect, it } from "vitest";
import type { LearningResource } from "../../../src/learning/learning-types";
import { syncResourcePhrases } from "../../../src/learning/resource-phrase-sync";

function resource(id: string, sentences: readonly string[]): LearningResource {
  const now = "2026-08-20T00:00:00.000Z";
  return Object.freeze({
    id,
    title: `资源 ${id}`,
    description: "验证用英语资源",
    language: "English",
    source: "imported",
    content: sentences.join(" "),
    sentences: Object.freeze(
      sentences.map((text, index) =>
        Object.freeze({
          id: `${id}-sentence-${index + 1}`,
          resourceId: id,
          order: index + 1,
          text,
          translation: null,
          startMs: null,
          endMs: null,
          sourceAudioUri: null,
        }),
      ),
    ),
    mediaKind: "text",
    createdAt: now,
    updatedAt: now,
  });
}

describe("syncResourcePhrases", () => {
  it("仅从真实资源语境中保存高置信可复用表达，并拒绝随机片段", () => {
    const result = syncResourcePhrases(
      Object.freeze([]),
      resource("resource-a", [
        "I need to figure out what happened.",
        "I'm looking forward to seeing you.",
        "Because I didn't know, the weather is very beautiful today.",
      ]),
      "2026-08-20T01:00:00.000Z",
    );

    expect(result.cards.map((card) => card.canonicalText).sort()).toEqual([
      "figure out",
      "look forward to",
    ]);
    expect(result.cards.find((card) => card.canonicalText === "figure out")?.context).toBe(
      "I need to figure out what happened.",
    );
    expect(result.cards.find((card) => card.canonicalText === "look forward to")?.context).toBe(
      "I'm looking forward to seeing you.",
    );
    expect(result.cards.every((card) => card.sourceResourceId === "resource-a")).toBe(true);
    expect(result.cards.every((card) => card.sourceResourceIds?.includes("resource-a"))).toBe(true);
  });

  it("同一资源重复扫描不增加遇到次数；不同资源遇到相同短语时复用同一条记录", () => {
    const first = syncResourcePhrases(
      Object.freeze([]),
      resource("resource-a", ["I need to figure out what happened."]),
      "2026-08-20T01:00:00.000Z",
    );
    const repeated = syncResourcePhrases(
      first.cards,
      resource("resource-a", ["I need to figure out what happened."]),
      "2026-08-20T02:00:00.000Z",
    );
    expect(repeated.cards).toHaveLength(1);
    expect(repeated.cards[0]?.encounterCount).toBe(1);

    const reused = syncResourcePhrases(
      repeated.cards,
      resource("resource-b", ["We finally figured out the answer."]),
      "2026-08-20T03:00:00.000Z",
    );
    expect(reused.cards).toHaveLength(1);
    expect(reused.cards[0]).toMatchObject({
      canonicalText: "figure out",
      encounterCount: 2,
      sourceResourceIds: ["resource-a", "resource-b"],
      lastEncounteredAt: "2026-08-20T03:00:00.000Z",
    });
  });
});
