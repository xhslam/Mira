import { canonicalizePhrase, upsertPhraseCard } from "./phrase-recognition";
import {
  inferExpressionType,
  normalizeEnglishExpression,
  type EnglishLessonCandidate,
  type EnglishLessonSession,
  type LearningExpression,
  type LessonCard,
  type ReplayEvidence,
} from "./english-coach-domain";
import type { LearningResource, LearningSentence, LearningSnapshot } from "./learning-types";

export type EnglishLessonSaveResult = Readonly<{
  snapshot: LearningSnapshot;
  card: LessonCard | null;
  resourceId: string | null;
}>;

function stableSegment(value: string): string {
  const normalized = normalizeEnglishExpression(value)
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "");
  return normalized.slice(0, 48) || "expression";
}

function addDays(now: string, days: number): string {
  const value = new Date(now);
  value.setDate(value.getDate() + days);
  return value.toISOString();
}

function dedupeString(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : Object.freeze([...values, value]);
}

function candidateType(candidate: EnglishLessonCandidate): EnglishLessonCandidate["type"] {
  return candidate.type ?? inferExpressionType(candidate.english);
}

function writeExpression(
  expressions: readonly LearningExpression[],
  candidate: EnglishLessonCandidate,
  cardId: string,
  resourceId: string | null,
  sentenceId: string | null,
  vocabularyCardId: string | null,
  session: EnglishLessonSession,
  now: string,
): Readonly<{ expressions: readonly LearningExpression[]; expression: LearningExpression }> {
  const type = candidateType(candidate);
  const normalizedKey = normalizeEnglishExpression(candidate.english);
  const existing =
    expressions.find((item) => item.type === type && item.normalizedKey === normalizedKey) ?? null;
  const source =
    candidate.source === "replayed"
      ? "replayed"
      : candidate.source === "corrected"
        ? "corrected"
        : "new_lesson";
  const promptIncrement = candidate.completed && candidate.promptLevel === "full" ? 1 : 0;
  const keywordIncrement = candidate.completed && candidate.promptLevel === "keywords" ? 1 : 0;
  const independentIncrement = candidate.completed && candidate.promptLevel === "none" ? 1 : 0;
  const status = candidate.completed ? "learning" : ("needs_review" as const);
  const expression: LearningExpression = refreshEnglishExpressionFamiliarity(
    Object.freeze({
      id: existing?.id ?? `expr-${stableSegment(candidate.english)}-${session.id}`,
      type,
      english: candidate.english.trim(),
      normalizedKey,
      translation: candidate.translation.trim(),
      usageHint: existing?.usageHint ?? null,
      source: existing?.source ?? source,
      sourceCardIds: dedupeString(existing?.sourceCardIds ?? Object.freeze([]), cardId),
      resourceId: sentenceId ? resourceId : (existing?.resourceId ?? null),
      sentenceId: sentenceId ?? existing?.sentenceId ?? null,
      vocabularyCardId: vocabularyCardId ?? existing?.vocabularyCardId ?? null,
      status,
      dueAt: existing?.dueAt ?? now,
      fullPromptCount: (existing?.fullPromptCount ?? 0) + promptIncrement,
      keywordPromptCount: (existing?.keywordPromptCount ?? 0) + keywordIncrement,
      independentCompletionCount:
        (existing?.independentCompletionCount ?? 0) + independentIncrement,
      lastSeenAt: now,
      lastScenario: session.scenario,
      markedImportant: candidate.markedImportant || existing?.markedImportant === true,
    }),
  );
  return Object.freeze({
    expressions: Object.freeze(
      existing
        ? expressions.map((item) => (item.id === existing.id ? expression : item))
        : [...expressions, expression],
    ),
    expression,
  });
}

export function discardEnglishLesson(
  snapshot: LearningSnapshot,
  sessionId: string,
): LearningSnapshot {
  return Object.freeze({
    ...snapshot,
    englishLessonSessions: Object.freeze(
      snapshot.englishLessonSessions.filter((session) => session.id !== sessionId),
    ),
  });
}

export function saveConfirmedEnglishLesson(
  options: Readonly<{
    snapshot: LearningSnapshot;
    session: EnglishLessonSession;
    candidates: readonly EnglishLessonCandidate[];
    now: string;
  }>,
): EnglishLessonSaveResult {
  const seenCandidateKeys = new Set<string>();
  const selected = options.candidates
    .filter(
      (candidate) => candidate.selected && candidate.english.trim() && candidate.translation.trim(),
    )
    .filter((candidate) => {
      const key = `${candidateType(candidate)}:${normalizeEnglishExpression(candidate.english)}`;
      if (!key || seenCandidateKeys.has(key)) return false;
      seenCandidateKeys.add(key);
      return true;
    })
    .slice(0, 5);

  if (selected.length === 0) {
    return Object.freeze({
      snapshot: discardEnglishLesson(options.snapshot, options.session.id),
      card: null,
      resourceId: null,
    });
  }
  const cardId = `lesson-card-${options.session.id}`;
  const existingCard =
    options.snapshot.lessonCards.find((card) => card.idempotencyKey === cardId) ?? null;
  if (existingCard) {
    return Object.freeze({
      snapshot: discardEnglishLesson(options.snapshot, options.session.id),
      card: existingCard,
      resourceId: null,
    });
  }
  const sentenceCandidates = selected.filter(
    (candidate) => candidateType(candidate) === "sentence",
  );
  const resourceId = sentenceCandidates.length > 0 ? `lesson-resource-${options.session.id}` : null;
  const sentences: readonly LearningSentence[] = Object.freeze(
    sentenceCandidates.map((candidate, index) =>
      Object.freeze({
        id: `lesson-sentence-${options.session.id}-${index + 1}`,
        resourceId: resourceId ?? "",
        order: index,
        text: candidate.english.trim(),
        translation: candidate.translation.trim(),
        startMs: null,
        endMs: null,
        sourceAudioUri: null,
      }),
    ),
  );
  const resource: LearningResource | null = resourceId
    ? Object.freeze({
        id: resourceId,
        title: `Mira 课程 · ${options.session.scenario}`,
        description: options.session.plan.goal,
        language: "English",
        source: "generated",
        provider: "craft",
        content: sentences.map((sentence) => sentence.text).join("\n"),
        sentences,
        mediaKind: "text",
        createdAt: options.now,
        updatedAt: options.now,
      })
    : null;
  let expressions: readonly LearningExpression[] = options.snapshot.learningExpressions;
  let vocabulary = options.snapshot.vocabulary;
  const expressionIds: string[] = [];
  const items: LessonCard["items"][number][] = [];
  const evidence: ReplayEvidence[] = [];
  for (const candidate of selected) {
    const type = candidateType(candidate);
    const sentence = sentences.find((item) => item.text === candidate.english.trim()) ?? null;
    const phraseResult =
      type === "phrase"
        ? upsertPhraseCard(
            vocabulary,
            {
              displayText: candidate.english,
              canonicalText: candidate.english,
              confidence: 1,
              context: options.session.scenario,
              phraseType: "manual",
              definition: candidate.translation,
              translation: candidate.translation,
              sourceResourceId: resourceId,
            },
            options.now,
            { manual: true },
          )
        : null;
    if (phraseResult) vocabulary = phraseResult.cards;
    const vocabularyCard = phraseResult
      ? (vocabulary.find(
          (item) =>
            canonicalizePhrase(item.canonicalText ?? item.term) ===
            canonicalizePhrase(candidate.english),
        ) ?? null)
      : null;
    const written = writeExpression(
      expressions,
      candidate,
      cardId,
      resourceId,
      sentence?.id ?? null,
      vocabularyCard?.id ?? null,
      options.session,
      options.now,
    );
    expressions = written.expressions;
    expressionIds.push(written.expression.id);
    items.push(
      Object.freeze({
        expressionId: written.expression.id,
        source: candidate.source,
        completion: candidate.completed ? "completed" : "skipped",
        markedImportant: candidate.markedImportant,
      }),
    );
    evidence.push(
      Object.freeze({
        id: `replay-${options.session.id}-${written.expression.id}`,
        expressionId: written.expression.id,
        lessonId: cardId,
        scenario: options.session.scenario,
        promptLevel: candidate.promptLevel,
        completed: candidate.completed,
        createdAt: options.now,
      }),
    );
  }
  const card: LessonCard = Object.freeze({
    id: cardId,
    idempotencyKey: cardId,
    scenario: options.session.scenario,
    goal: options.session.plan.goal,
    expressionIds: Object.freeze(expressionIds),
    items: Object.freeze(items),
    recommendedNextScenario: `在一个相近的新场景里再次使用这些表达`,
    savedAt: options.now,
  });
  const snapshot: LearningSnapshot = Object.freeze({
    ...options.snapshot,
    resources: resource
      ? Object.freeze([resource, ...options.snapshot.resources])
      : options.snapshot.resources,
    vocabulary,
    learningExpressions: expressions,
    lessonCards: Object.freeze([card, ...options.snapshot.lessonCards]),
    replayEvidence: Object.freeze([...options.snapshot.replayEvidence, ...evidence]),
    englishLessonSessions: Object.freeze(
      options.snapshot.englishLessonSessions.filter((session) => session.id !== options.session.id),
    ),
  });
  return Object.freeze({ snapshot, card, resourceId });
}

export function createEnglishPracticeNavigationSnapshot(
  snapshot: LearningSnapshot,
  resourceId: string | null,
): LearningSnapshot {
  const resource = resourceId
    ? (snapshot.resources.find((item) => item.id === resourceId) ?? null)
    : null;
  const firstSentence = resource?.sentences[0] ?? null;
  if (!resource || !firstSentence) return snapshot;
  return Object.freeze({
    ...snapshot,
    ui: Object.freeze({
      ...snapshot.ui,
      section: "practice",
      selectedResourceId: resource.id,
      selectedSentenceId: firstSentence.id,
    }),
  });
}

export function activeEnglishLesson(snapshot: LearningSnapshot): EnglishLessonSession | null {
  return snapshot.englishLessonSessions[0] ?? null;
}

export function replaceEnglishLesson(
  snapshot: LearningSnapshot,
  session: EnglishLessonSession,
): LearningSnapshot {
  return Object.freeze({
    ...snapshot,
    englishLessonSessions: Object.freeze([
      ...snapshot.englishLessonSessions.filter((item) => item.id !== session.id),
      session,
    ]),
  });
}

export function replaceEnglishLessonAtFront(
  snapshot: LearningSnapshot,
  session: EnglishLessonSession,
): LearningSnapshot {
  return Object.freeze({
    ...snapshot,
    englishLessonSessions: Object.freeze([
      session,
      ...snapshot.englishLessonSessions.filter((item) => item.id !== session.id),
    ]),
  });
}

export function refreshEnglishExpressionFamiliarity(
  expression: LearningExpression,
): LearningExpression {
  const independent = expression.independentCompletionCount;
  const guided = expression.fullPromptCount + expression.keywordPromptCount;
  const status = independent >= 3 && independent >= guided ? "familiar" : expression.status;
  return Object.freeze({
    ...expression,
    status,
    dueAt: status === "familiar" ? addDays(expression.lastSeenAt, 14) : expression.dueAt,
  });
}
