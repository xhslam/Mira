import type { VocabularyCard } from "./enjoy-player-domain";
import type { LearningMemory } from "./learning-types";
import { canonicalizePhrase, normalizePhrase } from "./phrase-recognition";

export type PhraseSort = "newest" | "oldest" | "recentEncounter" | "frequency" | "alphabetical";
export type PhraseFilter = "all" | "learning" | "mastered" | "favorites";
export type MemorySort = "newest" | "oldest" | "updated";

export type PhraseLibraryOptions = Readonly<{
  query: string;
  sort: PhraseSort;
  filter: PhraseFilter;
}>;

export type MemoryLibraryOptions = Readonly<{
  query: string;
  sort: MemorySort;
}>;

export type PhraseEditValues = Readonly<{
  term: string;
  definition: string;
  notes: string;
  masteryStatus: "learning" | "mastered";
}>;

export function filterAndSortPhrases(
  cards: readonly VocabularyCard[],
  options: PhraseLibraryOptions,
): readonly VocabularyCard[] {
  const query = normalizePhrase(options.query);
  return Object.freeze(
    cards
      .filter((card) => phraseMatches(card, query))
      .filter((card) => matchesPhraseFilter(card, options.filter))
      .slice()
      .sort(phraseComparator(options.sort)),
  );
}

export function filterAndSortMemories(
  memories: readonly LearningMemory[],
  options: MemoryLibraryOptions,
): readonly LearningMemory[] {
  const query = normalizePhrase(options.query);
  return Object.freeze(
    memories
      .filter((memory) => memoryMatches(memory, query))
      .slice()
      .sort(memoryComparator(options.sort)),
  );
}

export function togglePhraseFavorite(card: VocabularyCard, now: string): VocabularyCard {
  return Object.freeze({ ...card, isFavorite: !card.isFavorite, updatedAt: now });
}

export function setPhraseMastery(
  card: VocabularyCard,
  masteryStatus: "learning" | "mastered",
  now: string,
): VocabularyCard {
  return Object.freeze({
    ...card,
    masteryStatus,
    masteredAt: masteryStatus === "mastered" ? now : null,
    updatedAt: now,
  });
}

export function updatePhraseCard(
  cards: readonly VocabularyCard[],
  id: string,
  values: PhraseEditValues,
  now: string,
): Readonly<{ cards: readonly VocabularyCard[]; error: "duplicate" | "not_found" | null }> {
  const target = cards.find((card) => card.id === id);
  if (!target) return Object.freeze({ cards: Object.freeze([...cards]), error: "not_found" });

  const term = values.term.trim();
  if (!term) return Object.freeze({ cards: Object.freeze([...cards]), error: "not_found" });
  const normalizedText = normalizePhrase(term);
  const canonicalText = canonicalizePhrase(term);
  const duplicate = cards.some(
    (card) =>
      card.id !== id && canonicalizePhrase(card.canonicalText ?? card.term) === canonicalText,
  );
  if (duplicate) return Object.freeze({ cards: Object.freeze([...cards]), error: "duplicate" });

  const { notes: _previousNotes, ...targetWithoutNotes } = target;
  const definition = values.definition.trim() || target.definition;
  const updated = Object.freeze({
    ...targetWithoutNotes,
    term,
    definition,
    translation: definition,
    normalizedText,
    canonicalText,
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    masteryStatus: values.masteryStatus,
    masteredAt: values.masteryStatus === "mastered" ? (target.masteredAt ?? now) : null,
    updatedAt: now,
  });
  return Object.freeze({
    cards: Object.freeze(cards.map((card) => (card.id === id ? updated : card))),
    error: null,
  });
}

export function updateMemory(
  memories: readonly LearningMemory[],
  id: string,
  values: Readonly<{
    text: string;
    category: LearningMemory["category"];
    tags: readonly string[];
    notes: string;
  }>,
  now: string,
): readonly LearningMemory[] {
  return Object.freeze(
    memories.map((memory) => {
      if (memory.id !== id) return memory;
      const { notes: _previousNotes, ...memoryWithoutNotes } = memory;
      return Object.freeze({
        ...memoryWithoutNotes,
        text: values.text.trim() || memory.text,
        category: values.category,
        tags: Object.freeze(uniqueStrings(values.tags)),
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        updatedAt: now,
      });
    }),
  );
}

export function phraseMatches(card: VocabularyCard, query: string): boolean {
  if (!query) return true;
  return normalizePhrase(
    [
      card.term,
      card.canonicalText ?? "",
      card.definition,
      card.translation ?? "",
      card.context,
      ...(card.contexts ?? []),
    ].join(" "),
  ).includes(query);
}

export function memoryMatches(memory: LearningMemory, query: string): boolean {
  if (!query) return true;
  return normalizePhrase(
    [memory.text, memory.category ?? "", ...memory.tags, memory.notes ?? ""].join(" "),
  ).includes(query);
}

function matchesPhraseFilter(card: VocabularyCard, filter: PhraseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "favorites") return card.isFavorite === true;
  return (card.masteryStatus ?? "learning") === filter;
}

function phraseComparator(
  sort: PhraseSort,
): (left: VocabularyCard, right: VocabularyCard) => number {
  switch (sort) {
    case "oldest":
      return (left, right) => left.createdAt.localeCompare(right.createdAt);
    case "recentEncounter":
      return (left, right) =>
        (right.lastEncounteredAt ?? right.createdAt).localeCompare(
          left.lastEncounteredAt ?? left.createdAt,
        );
    case "frequency":
      return (left, right) =>
        (right.encounterCount ?? 1) - (left.encounterCount ?? 1) ||
        right.createdAt.localeCompare(left.createdAt);
    case "alphabetical":
      return (left, right) => left.term.localeCompare(right.term, "en", { sensitivity: "base" });
    case "newest":
    default:
      return (left, right) => right.createdAt.localeCompare(left.createdAt);
  }
}

function memoryComparator(
  sort: MemorySort,
): (left: LearningMemory, right: LearningMemory) => number {
  if (sort === "oldest") return (left, right) => left.createdAt.localeCompare(right.createdAt);
  if (sort === "updated") return (left, right) => right.updatedAt.localeCompare(left.updatedAt);
  return (left, right) => right.createdAt.localeCompare(left.createdAt);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}
