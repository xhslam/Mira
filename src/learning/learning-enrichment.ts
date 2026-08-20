import { tokenizeWords, type VocabularyCard } from "./enjoy-player-domain";
import { extractPhraseCandidates, shouldAutoSavePhrase } from "./phrase-recognition";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

export type SuggestedPhrase = Readonly<{
  phrase: string;
  context: string;
  score: number;
}>;

export function cleanMarkdownForLearning(input: string): string {
  return input
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s*[-*+]\s+/gmu, "")
    .replace(/^\s*\d+\.\s+/gmu, "")
    .replace(/[`*_~>|]/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/\s+([.,!?;:])/gu, "$1")
    .trim();
}

export function extractImportantPhrases(
  sentences: readonly string[],
  limit = 12,
): readonly SuggestedPhrase[] {
  const candidates = new Map<string, SuggestedPhrase>();
  for (const sentence of sentences) {
    for (const candidate of extractPhraseCandidates(sentence, limit)) {
      if (!shouldAutoSavePhrase(candidate)) continue;
      const existing = candidates.get(candidate.canonicalText);
      candidates.set(
        candidate.canonicalText,
        Object.freeze({
          phrase: existing?.phrase ?? candidate.displayText,
          context: existing?.context ?? candidate.context,
          score: (existing?.score ?? 0) + candidate.confidence,
        }),
      );
    }
  }
  return Object.freeze(
    [...candidates.values()]
      .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase))
      .slice(0, limit),
  );
}

export function findRelatedVocabulary(
  phrase: string,
  cards: readonly VocabularyCard[],
  limit = 4,
): readonly VocabularyCard[] {
  const target = meaningfulWords(phrase);
  if (target.size === 0) return Object.freeze([]);
  return Object.freeze(
    cards
      .map((card) =>
        Object.freeze({
          card,
          score: wordSimilarity(target, meaningfulWords(card.term + " " + card.context)),
        }),
      )
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || right.card.createdAt.localeCompare(left.card.createdAt),
      )
      .slice(0, limit)
      .map((item) => item.card),
  );
}

export function relatedPhraseScore(left: string, right: string): number {
  return wordSimilarity(meaningfulWords(left), meaningfulWords(right));
}

function meaningfulWords(value: string): ReadonlySet<string> {
  return new Set(
    tokenizeWords(value)
      .map((word) => word.toLowerCase().replace(/(?:ing|ed|es|s)$/u, ""))
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

function wordSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(1, Math.min(left.size, right.size));
}
