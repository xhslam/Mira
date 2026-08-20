import { createVocabularyCard, type VocabularyCard } from "./enjoy-player-domain";

export const MIN_AUTO_SAVE_CONFIDENCE = 0.8;

export type PhraseType =
  "phrasal_verb" | "fixed_expression" | "collocation" | "spoken_pattern" | "idiom" | "manual";

export type PhraseCandidate = Readonly<{
  displayText: string;
  normalizedText: string;
  canonicalText: string;
  phraseType: PhraseType;
  confidence: number;
  context: string;
}>;

type PhraseRule = Readonly<{
  canonicalText: string;
  phraseType: Exclude<PhraseType, "manual">;
  confidence: number;
  pattern: RegExp;
  display?: (match: RegExpExecArray) => string;
}>;

const PHRASE_RULES: readonly PhraseRule[] = Object.freeze([
  Object.freeze({
    canonicalText: "figure out",
    phraseType: "phrasal_verb",
    confidence: 0.97,
    pattern: /\b(figur(?:e|es|ed|ing)\s+(?:it\s+)?out)\b/giu,
  }),
  Object.freeze({
    canonicalText: "look forward to",
    phraseType: "phrasal_verb",
    confidence: 0.97,
    pattern: /\b(look(?:s|ed|ing)?\s+forward\s+to)\b/giu,
  }),
  Object.freeze({
    canonicalText: "come up with",
    phraseType: "phrasal_verb",
    confidence: 0.96,
    pattern: /\b(come(?:s|came|ing)?\s+up\s+with)\b/giu,
  }),
  Object.freeze({
    canonicalText: "give up",
    phraseType: "phrasal_verb",
    confidence: 0.95,
    pattern: /\b(giv(?:e|es|ing)|gave)\s+up\b/giu,
  }),
  Object.freeze({
    canonicalText: "look after",
    phraseType: "phrasal_verb",
    confidence: 0.95,
    pattern: /\b(look(?:s|ed|ing)?\s+after)\b/giu,
  }),
  Object.freeze({
    canonicalText: "take off",
    phraseType: "phrasal_verb",
    confidence: 0.94,
    pattern: /\b(tak(?:e|es|ing)|took)\s+off\b/giu,
  }),
  Object.freeze({
    canonicalText: "make sense of",
    phraseType: "collocation",
    confidence: 0.94,
    pattern: /\b(mak(?:e|es|ing)|made)\s+sense\s+of\b/giu,
  }),
  Object.freeze({
    canonicalText: "make progress",
    phraseType: "collocation",
    confidence: 0.93,
    pattern: /\b(mak(?:e|es|ing)|made)\s+progress\b/giu,
  }),
  Object.freeze({
    canonicalText: "take responsibility",
    phraseType: "collocation",
    confidence: 0.93,
    pattern: /\b(tak(?:e|es|ing)|took)\s+responsibility\b/giu,
  }),
  Object.freeze({
    canonicalText: "be supposed to",
    phraseType: "spoken_pattern",
    confidence: 0.94,
    pattern: /\b(am|are|is|was|were|be|been|being)\s+supposed\s+to\b/giu,
    display: (match: RegExpExecArray) => `${match[1] ?? "be"} supposed to`,
  }),
  Object.freeze({
    canonicalText: "it turns out that",
    phraseType: "spoken_pattern",
    confidence: 0.94,
    pattern: /\b(it\s+turns\s+out\s+that)\b/giu,
  }),
  Object.freeze({
    canonicalText: "the point is that",
    phraseType: "spoken_pattern",
    confidence: 0.94,
    pattern: /\b(the\s+point\s+is\s+that)\b/giu,
  }),
  Object.freeze({
    canonicalText: "by the way",
    phraseType: "fixed_expression",
    confidence: 0.98,
    pattern: /\b(by\s+the\s+way)\b/giu,
  }),
  Object.freeze({
    canonicalText: "as a matter of fact",
    phraseType: "fixed_expression",
    confidence: 0.98,
    pattern: /\b(as\s+a\s+matter\s+of\s+fact)\b/giu,
  }),
  Object.freeze({
    canonicalText: "at the end of the day",
    phraseType: "fixed_expression",
    confidence: 0.98,
    pattern: /\b(at\s+the\s+end\s+of\s+the\s+day)\b/giu,
  }),
  Object.freeze({
    canonicalText: "on the other hand",
    phraseType: "fixed_expression",
    confidence: 0.98,
    pattern: /\b(on\s+the\s+other\s+hand)\b/giu,
  }),
  Object.freeze({
    canonicalText: "under the weather",
    phraseType: "idiom",
    confidence: 0.98,
    pattern: /\b(under\s+the\s+weather)\b/giu,
  }),
  Object.freeze({
    canonicalText: "break the ice",
    phraseType: "idiom",
    confidence: 0.98,
    pattern: /\b(break(?:s|ing)?\s+the\s+ice|broke\s+the\s+ice)\b/giu,
  }),
  Object.freeze({
    canonicalText: "piece of cake",
    phraseType: "idiom",
    confidence: 0.98,
    pattern: /\b(a\s+piece\s+of\s+cake|piece\s+of\s+cake)\b/giu,
  }),
]);

/** Produces a comparison key only; `displayText` remains untouched for users. */
export function normalizePhrase(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”„‟«»]/gu, '"')
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[\s'"“”‘’`([{]+|[\s'"“”‘’`.,!?;:)}\]]+$/gu, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

/**
 * Extracts only expressions that match an explicit reusable-expression rule.
 * It intentionally never creates arbitrary 2–5 word n-grams.
 */
export function extractPhraseCandidates(
  sentenceContext: string,
  limit = 12,
): readonly PhraseCandidate[] {
  const context = sentenceContext.replace(/\s+/gu, " ").trim();
  if (!context) return Object.freeze([]);

  const candidates = new Map<string, PhraseCandidate>();
  for (const rule of PHRASE_RULES) {
    const matches = context.matchAll(rule.pattern);
    for (const match of matches) {
      const surface = (rule.display?.(match) ?? match[0] ?? "").trim();
      const candidate = classifyPhraseCandidate(surface, rule, context);
      if (!candidate || !isValidPhrase(candidate)) continue;
      const existing = candidates.get(candidate.canonicalText);
      if (!existing || candidate.confidence > existing.confidence) {
        candidates.set(candidate.canonicalText, candidate);
      }
    }
  }

  return Object.freeze(
    [...candidates.values()]
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          left.canonicalText.localeCompare(right.canonicalText),
      )
      .slice(0, limit),
  );
}

export function shouldAutoSavePhrase(candidate: PhraseCandidate): boolean {
  return isValidPhrase(candidate) && candidate.confidence >= MIN_AUTO_SAVE_CONFIDENCE;
}

export function isValidPhrase(candidate: PhraseCandidate): boolean {
  const words = candidate.normalizedText.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if (candidate.context.trim().length === 0) return false;
  if (!/^[a-z][a-z' -]*[a-z]$/u.test(candidate.normalizedText)) return false;
  return candidate.phraseType !== "manual" || candidate.normalizedText.length > 0;
}

export function canonicalizePhrase(value: string): string {
  const normalized = normalizePhrase(value);
  if (!normalized) return normalized;
  const candidate = extractPhraseCandidates(normalized, 1)[0];
  return candidate?.canonicalText ?? normalized;
}

export type PhraseUpsertResult = Readonly<{
  cards: readonly VocabularyCard[];
  created: boolean;
}>;

export function upsertPhraseCard(
  cards: readonly VocabularyCard[],
  candidate: Readonly<{
    displayText: string;
    canonicalText?: string;
    confidence: number;
    context: string;
    phraseType: PhraseType;
    definition?: string;
    translation?: string | null;
    sourceResourceId?: string | null;
  }>,
  now: string,
  options: Readonly<{ manual?: boolean }> = {},
): PhraseUpsertResult {
  const normalizedText = normalizePhrase(candidate.displayText);
  const canonicalText = candidate.canonicalText
    ? canonicalizePhrase(candidate.canonicalText)
    : canonicalizePhrase(normalizedText);
  const classified: PhraseCandidate = Object.freeze({
    displayText: candidate.displayText.trim(),
    normalizedText,
    canonicalText,
    phraseType: candidate.phraseType,
    confidence: candidate.confidence,
    context: candidate.context.trim(),
  });
  if (!options.manual && !shouldAutoSavePhrase(classified)) {
    return Object.freeze({ cards: Object.freeze([...cards]), created: false });
  }
  if (options.manual && !classified.displayText) {
    return Object.freeze({ cards: Object.freeze([...cards]), created: false });
  }

  const existingIndex = cards.findIndex(
    (card) => canonicalizePhrase(card.canonicalText ?? card.term) === canonicalText,
  );
  if (existingIndex >= 0) {
    const existing = cards[existingIndex];
    if (!existing) return Object.freeze({ cards: Object.freeze([...cards]), created: false });
    const existingResourceIds =
      existing.sourceResourceIds ??
      (existing.sourceResourceId ? Object.freeze([existing.sourceResourceId]) : Object.freeze([]));
    if (candidate.sourceResourceId && existingResourceIds.includes(candidate.sourceResourceId)) {
      return Object.freeze({ cards: Object.freeze([...cards]), created: false });
    }
    const contexts = uniqueContexts(existing.contexts ?? [existing.context], classified.context);
    const sourceResourceIds = candidate.sourceResourceId
      ? Object.freeze([...new Set([...existingResourceIds, candidate.sourceResourceId])])
      : existingResourceIds;
    const updated = Object.freeze({
      ...existing,
      normalizedText: normalizePhrase(existing.term),
      canonicalText,
      phraseType: existing.phraseType ?? classified.phraseType,
      confidence: Math.max(existing.confidence ?? 0, classified.confidence),
      encounterCount: (existing.encounterCount ?? 1) + 1,
      lastEncounteredAt: now,
      contexts,
      ...(sourceResourceIds.length ? { sourceResourceIds } : {}),
      context: existing.context || classified.context,
      updatedAt: now,
    });
    return Object.freeze({
      cards: Object.freeze(cards.map((card, index) => (index === existingIndex ? updated : card))),
      created: false,
    });
  }

  const card = createVocabularyCard({
    id: `phrase-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    term: classified.displayText,
    definition: candidate.definition?.trim() || "待补充释义",
    context: classified.context,
    ...(candidate.translation !== undefined ? { translation: candidate.translation } : {}),
    ...(candidate.sourceResourceId !== undefined
      ? { sourceResourceId: candidate.sourceResourceId }
      : {}),
    ...(candidate.sourceResourceId
      ? { sourceResourceIds: Object.freeze([candidate.sourceResourceId]) }
      : {}),
    normalizedText,
    canonicalText,
    phraseType: classified.phraseType,
    confidence: classified.confidence,
    encounterCount: 1,
    lastEncounteredAt: now,
    contexts: Object.freeze([classified.context]),
    updatedAt: now,
    now,
  });
  return Object.freeze({ cards: Object.freeze([card, ...cards]), created: true });
}

function classifyPhraseCandidate(
  displayText: string,
  rule: PhraseRule,
  context: string,
): PhraseCandidate | null {
  const normalizedText = normalizePhrase(displayText);
  if (!normalizedText) return null;
  return Object.freeze({
    displayText: displayText.trim(),
    normalizedText,
    canonicalText: rule.canonicalText,
    phraseType: rule.phraseType,
    confidence: rule.confidence,
    context,
  });
}

function uniqueContexts(existing: readonly string[], next: string): readonly string[] {
  const normalizedNext = next.trim();
  if (!normalizedNext || existing.some((context) => context === normalizedNext)) {
    return Object.freeze([...existing]);
  }
  return Object.freeze([...existing, normalizedNext].slice(-6));
}
