import type { VocabularyCard } from "./enjoy-player-domain";
import type { LearningResource } from "./learning-types";
import {
  extractPhraseCandidates,
  shouldAutoSavePhrase,
  upsertPhraseCard,
} from "./phrase-recognition";

export type ResourcePhraseSyncResult = Readonly<{
  cards: readonly VocabularyCard[];
  createdCount: number;
  reusedCount: number;
}>;

/**
 * Scans one persisted learning resource exactly once. Candidates retain their
 * source sentence and resource ID so the library stays traceable and reusable.
 */
export function syncResourcePhrases(
  existingCards: readonly VocabularyCard[],
  resource: LearningResource,
  now: string,
): ResourcePhraseSyncResult {
  let cards: readonly VocabularyCard[] = Object.freeze([...existingCards]);
  let createdCount = 0;
  let reusedCount = 0;
  const contexts = resource.sentences.length
    ? resource.sentences.map((sentence) => sentence.text)
    : resource.content.split(/(?<=[.!?])\s+/u);

  for (const context of contexts) {
    for (const candidate of extractPhraseCandidates(context)) {
      if (!shouldAutoSavePhrase(candidate)) continue;
      const beforeCount = cards.length;
      const beforeEncounters = cards.find(
        (card) => card.canonicalText === candidate.canonicalText,
      )?.encounterCount;
      const result = upsertPhraseCard(
        cards,
        {
          displayText: candidate.displayText,
          canonicalText: candidate.canonicalText,
          confidence: candidate.confidence,
          context: candidate.context,
          phraseType: candidate.phraseType,
          sourceResourceId: resource.id,
        },
        now,
      );
      cards = result.cards;
      if (result.created && cards.length > beforeCount) createdCount += 1;
      else if (beforeEncounters !== undefined) {
        const nextEncounters = cards.find(
          (card) => card.canonicalText === candidate.canonicalText,
        )?.encounterCount;
        if (nextEncounters && nextEncounters > beforeEncounters) reusedCount += 1;
      }
    }
  }

  return Object.freeze({ cards, createdCount, reusedCount });
}
