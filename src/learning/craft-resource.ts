import { splitLearningSentences } from "./enjoy-player-domain";
import type { LearningResource, LearningSnapshot } from "./learning-types";

export type ManualLearningResourceInput = Readonly<{
  id: string;
  title: string;
  content: string;
  now: string;
}>;

function inferLanguage(content: string): string {
  return /[\u3400-\u9fff]/u.test(content) ? "zh-CN" : "en-US";
}

export function createManualLearningResource(input: ManualLearningResourceInput): LearningResource {
  const content = input.content.replace(/\r\n?/gu, "\n").trim();
  if (!content) throw new Error("请先输入文稿内容。");

  const sentenceTexts = splitLearningSentences(content);
  if (!sentenceTexts.length) throw new Error("文稿中没有可保存的内容。");

  const firstLine =
    content
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "未命名资料";
  const title = (input.title.trim() || firstLine).slice(0, 44);
  const sentences = Object.freeze(
    sentenceTexts.map((text, index) =>
      Object.freeze({
        id: `${input.id}-sentence-${index + 1}`,
        resourceId: input.id,
        order: index + 1,
        text,
        translation: null,
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
    ),
  );

  return Object.freeze({
    id: input.id,
    title,
    description: `手动输入 · ${sentences.length} 句`,
    language: inferLanguage(content),
    source: "manual",
    provider: "manual",
    content,
    sentences,
    mediaKind: "text",
    lastOpenedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function addManualLearningResourceToLibrary(
  snapshot: LearningSnapshot,
  resource: LearningResource,
): LearningSnapshot {
  return Object.freeze({
    ...snapshot,
    resources: Object.freeze([resource, ...snapshot.resources]),
    ui: Object.freeze({
      ...snapshot.ui,
      section: "library",
      selectedResourceId: resource.id,
      selectedSentenceId: resource.sentences[0]?.id ?? null,
      importIntent: null,
    }),
  });
}
