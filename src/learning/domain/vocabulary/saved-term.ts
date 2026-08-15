export type SavedTermEncounter = Readonly<{
  id: string;
  mediaId: string;
  cueId: string | null;
  timestampMs: number | null;
  originalSentence: string;
  previousSentence: string | null;
  nextSentence: string | null;
  explanation: string | null;
  createdAt: string;
}>;

export type SavedTerm = Readonly<{
  id: string;
  normalizedText: string;
  displayText: string;
  language: string;
  definition: string | null;
  encounters: readonly SavedTermEncounter[];
  createdAt: string;
  updatedAt: string;
}>;

export function normalizeSavedTerm(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function upsertSavedTerm(
  terms: readonly SavedTerm[],
  input: Readonly<{
    id: string;
    displayText: string;
    language: string;
    definition: string | null;
    encounter: SavedTermEncounter;
    occurredAt: string;
  }>,
): readonly SavedTerm[] {
  const normalizedText = normalizeSavedTerm(input.displayText);
  const index = terms.findIndex(
    (term) => term.normalizedText === normalizedText && term.language === input.language,
  );
  if (index < 0) {
    return Object.freeze([
      Object.freeze({
        id: input.id,
        normalizedText,
        displayText: input.displayText.trim(),
        language: input.language,
        definition: input.definition,
        encounters: Object.freeze([input.encounter]),
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      }),
      ...terms,
    ]);
  }
  const existing = terms[index]!;
  const duplicate = existing.encounters.some(
    (encounter) =>
      encounter.mediaId === input.encounter.mediaId &&
      encounter.cueId === input.encounter.cueId &&
      encounter.timestampMs === input.encounter.timestampMs,
  );
  const next = Object.freeze({
    ...existing,
    displayText: existing.displayText || input.displayText.trim(),
    definition: existing.definition ?? input.definition,
    encounters: duplicate
      ? existing.encounters
      : Object.freeze([input.encounter, ...existing.encounters]),
    updatedAt: input.occurredAt,
  });
  return Object.freeze(terms.map((term, currentIndex) => (currentIndex === index ? next : term)));
}
