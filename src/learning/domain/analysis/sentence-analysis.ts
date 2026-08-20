export type SentencePattern = Readonly<{ title: string; explanation: string }>;
export type SentencePhrase = Readonly<{
  phrase: string;
  translation: string;
  explanation: string;
  category: string | null;
  cefr: string | null;
}>;
export type SentenceGrammarPoint = Readonly<{
  title: string;
  explanation: string;
  examples: readonly string[];
}>;
export type StructuredSentenceAnalysis = Readonly<{
  sentencePatterns: readonly SentencePattern[];
  keyPhrases: readonly SentencePhrase[];
  grammarPoints: readonly SentenceGrammarPoint[];
  contextualExplanation: string | null;
}>;
export type AnalysisParseResult =
  | Readonly<{ ok: true; value: StructuredSentenceAnalysis }>
  | Readonly<{ ok: false; error: string; fallback: StructuredSentenceAnalysis }>;

const EMPTY_ANALYSIS: StructuredSentenceAnalysis = Object.freeze({
  sentencePatterns: Object.freeze([]),
  keyPhrases: Object.freeze([]),
  grammarPoints: Object.freeze([]),
  contextualExplanation: null,
});

function text(value: unknown, limit = 1_000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fencedJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  return (match?.[1] ?? raw).trim();
}

function patterns(value: unknown): readonly SentencePattern[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, 4).flatMap((item) => {
      const candidate = object(item);
      const title = text(candidate?.title, 140);
      const explanation = text(candidate?.explanation, 800);
      return title && explanation ? [Object.freeze({ title, explanation })] : [];
    }),
  );
}

function phrases(value: unknown): readonly SentencePhrase[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, 8).flatMap((item) => {
      const candidate = object(item);
      const phrase = text(candidate?.phrase, 180);
      const translation = text(candidate?.translation, 400);
      const explanation = text(candidate?.explanation, 800);
      if (!phrase || !translation || !explanation) return [];
      return [
        Object.freeze({
          phrase,
          translation,
          explanation,
          category: text(candidate?.category, 80),
          cefr: text(candidate?.cefr, 24),
        }),
      ];
    }),
  );
}

function grammar(value: unknown): readonly SentenceGrammarPoint[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, 5).flatMap((item) => {
      const candidate = object(item);
      const title = text(candidate?.title, 160);
      const explanation = text(candidate?.explanation, 800);
      if (!title || !explanation) return [];
      const examples = Array.isArray(candidate?.examples)
        ? Object.freeze(
            candidate.examples.slice(0, 3).flatMap((example) => {
              const value = text(example, 320);
              return value ? [value] : [];
            }),
          )
        : Object.freeze([]);
      return [Object.freeze({ title, explanation, examples })];
    }),
  );
}

export function parseStructuredSentenceAnalysis(raw: string): AnalysisParseResult {
  try {
    const candidate = object(JSON.parse(fencedJson(raw)) as unknown);
    if (!candidate) throw new Error("分析结果不是对象。");
    const value = Object.freeze({
      sentencePatterns: patterns(candidate.sentencePatterns),
      keyPhrases: phrases(candidate.keyPhrases),
      grammarPoints: grammar(candidate.grammarPoints),
      contextualExplanation: text(candidate.contextualExplanation, 1_600),
    });
    if (
      value.sentencePatterns.length === 0 &&
      value.keyPhrases.length === 0 &&
      value.grammarPoints.length === 0 &&
      value.contextualExplanation === null
    ) {
      throw new Error("分析结果没有可用内容。");
    }
    return Object.freeze({ ok: true, value });
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: error instanceof Error ? error.message : "分析结果无法验证。",
      fallback: EMPTY_ANALYSIS,
    });
  }
}

export function buildSentenceAnalysisPrompt(
  input: Readonly<{
    sentence: string;
    translation: string | null;
    previousSentence: string | null;
    nextSentence: string | null;
    targetLanguage: string;
  }>,
): string {
  return `Return JSON only. Explain this sentence for a learner in ${input.targetLanguage}.\nSentence: ${input.sentence}\nTranslation: ${input.translation ?? ""}\nPrevious: ${input.previousSentence ?? ""}\nNext: ${input.nextSentence ?? ""}\nSchema: {"sentencePatterns":[{"title":"","explanation":""}],"keyPhrases":[{"phrase":"","translation":"","explanation":"","category":"","cefr":""}],"grammarPoints":[{"title":"","explanation":"","examples":[""]}],"contextualExplanation":""}`;
}
