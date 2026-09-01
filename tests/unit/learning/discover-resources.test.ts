import { describe, expect, it } from "vitest";
import {
  discoverResourceKind,
  listDiscoverResources,
} from "../../../src/learning/discover-resources";
import type { LearningResource } from "../../../src/learning/learning-types";

function resource(
  id: string,
  mediaKind: LearningResource["mediaKind"],
  updatedAt: string,
  lastOpenedAt?: string,
): LearningResource {
  return Object.freeze({
    id,
    title: id,
    description: "",
    language: "English",
    source: "imported",
    content: "Hello.",
    sentences: Object.freeze([]),
    ...(mediaKind ? { mediaKind } : {}),
    createdAt: updatedAt,
    updatedAt,
    ...(lastOpenedAt ? { lastOpenedAt } : {}),
  });
}

describe("discover resources", () => {
  it("groups external video references with local video resources", () => {
    expect(discoverResourceKind(resource("local", "video", "2026-08-01"))).toBe("video");
    expect(discoverResourceKind(resource("youtube", "youtube", "2026-08-01"))).toBe("video");
    expect(discoverResourceKind(resource("bilibili", "bilibili", "2026-08-01"))).toBe("video");
    expect(discoverResourceKind(resource("audio", "audio", "2026-08-01"))).toBe("audio");
    expect(discoverResourceKind(resource("note", undefined, "2026-08-01"))).toBe("text");
  });

  it("filters without mutation and orders by the most recent learning activity", () => {
    const original = Object.freeze([
      resource("older-video", "video", "2026-08-01T00:00:00.000Z"),
      resource("recent-video", "bilibili", "2026-07-01T00:00:00.000Z", "2026-08-20T00:00:00.000Z"),
      resource("audio", "audio", "2026-08-25T00:00:00.000Z"),
    ]);

    expect(listDiscoverResources(original, "video").map((item) => item.id)).toEqual([
      "recent-video",
      "older-video",
    ]);
    expect(original.map((item) => item.id)).toEqual(["older-video", "recent-video", "audio"]);
  });

  it("honors a finite positive result limit", () => {
    const resources = [
      resource("three", "text", "2026-08-03"),
      resource("two", "text", "2026-08-02"),
      resource("one", "text", "2026-08-01"),
    ];

    expect(listDiscoverResources(resources, "all", 2).map((item) => item.id)).toEqual([
      "three",
      "two",
    ]);
    expect(listDiscoverResources(resources, "all", 0)).toEqual([]);
  });
});
