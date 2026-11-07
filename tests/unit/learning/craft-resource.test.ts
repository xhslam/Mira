import { describe, expect, it } from "vitest";
import {
  addManualLearningResourceToLibrary,
  createManualLearningResource,
} from "../../../src/learning/craft-resource";
import { createInitialLearningSnapshot } from "../../../src/learning/learning-types";

describe("manual Craft resources", () => {
  it("turns a handwritten manuscript directly into an immutable text resource", () => {
    const resource = createManualLearningResource({
      id: "manual-1",
      title: "  自定义标题  ",
      content: "  第一段。\r\n第二段！  ",
      now: "2026-09-21T00:00:00.000Z",
    });

    expect(resource).toMatchObject({
      id: "manual-1",
      title: "自定义标题",
      description: "手动输入 · 2 句",
      language: "zh-CN",
      source: "manual",
      provider: "manual",
      content: "第一段。\n第二段！",
      mediaKind: "text",
    });
    expect(resource.sentences.map((sentence) => sentence.text)).toEqual(["第一段。", "第二段！"]);
    expect(Object.isFrozen(resource)).toBe(true);
    expect(Object.isFrozen(resource.sentences)).toBe(true);
    expect(Object.isFrozen(resource.sentences[0])).toBe(true);
  });

  it("uses the first manuscript line as the title and rejects blank input", () => {
    const resource = createManualLearningResource({
      id: "manual-2",
      title: "",
      content: "First line\nSecond line.",
      now: "2026-09-21T00:00:00.000Z",
    });

    expect(resource.title).toBe("First line");
    expect(resource.language).toBe("en-US");
    expect(() =>
      createManualLearningResource({
        id: "manual-empty",
        title: "Only a title",
        content: "   ",
        now: "2026-09-21T00:00:00.000Z",
      }),
    ).toThrow("请先输入文稿内容。");
  });

  it("adds the new resource to the library and selects it", () => {
    const snapshot = createInitialLearningSnapshot();
    const resource = createManualLearningResource({
      id: "manual-3",
      title: "",
      content: "Practice this sentence.",
      now: "2026-09-21T00:00:00.000Z",
    });

    const next = addManualLearningResourceToLibrary(snapshot, resource);

    expect(next.resources[0]).toBe(resource);
    expect(next.ui).toMatchObject({
      section: "library",
      selectedResourceId: "manual-3",
      selectedSentenceId: "manual-3-sentence-1",
      importIntent: null,
    });
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.resources)).toBe(true);
  });
});
