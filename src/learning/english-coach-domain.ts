export const ENGLISH_LESSON_PHASES = [
  "scenario_setup",
  "lesson_preview",
  "teach_expression",
  "guided_recall",
  "imitation",
  "roleplay",
  "lesson_review",
  "card_review",
  "completed",
  "paused",
  "provider_failed",
  "save_failed",
  "discarded",
] as const;

export type EnglishLessonPhase = (typeof ENGLISH_LESSON_PHASES)[number];
export type EnglishCoachPromptLevel = "full" | "keywords" | "none";
export type EnglishCoachVerdict = "retry" | "simplify" | "stay" | "advance" | "finish";
export type EnglishExpressionType = "word" | "phrase" | "sentence";

export type EnglishCoachExpression = Readonly<{
  id: string;
  english: string;
  translation: string;
  hint: string | null;
  type: EnglishExpressionType;
  replayExpressionId?: string | null;
}>;

export type EnglishExpressionEvidence = Readonly<{
  expressionId: string;
  promptLevel: EnglishCoachPromptLevel;
  completed: boolean;
}>;

export type EnglishLessonPlan = Readonly<{
  goal: string;
  estimatedMinutes: number;
  expressions: readonly EnglishCoachExpression[];
  roleplayTurns: number;
}>;

export type EnglishCoachMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}>;

export type EnglishLessonSession = Readonly<{
  id: string;
  status: "active" | "paused" | "provider_failed" | "save_failed";
  promptVersion: string;
  scenario: string;
  phase: Exclude<EnglishLessonPhase, "completed" | "discarded">;
  resumePhase: Exclude<
    EnglishLessonPhase,
    "paused" | "provider_failed" | "save_failed" | "discarded" | "completed"
  >;
  plan: EnglishLessonPlan;
  currentExpressionIndex: number;
  promptLevel: EnglishCoachPromptLevel;
  selectedReplayExpressionIds: readonly string[];
  temporaryMessages: readonly EnglishCoachMessage[];
  completedExpressionIds: readonly string[];
  skippedExpressionIds: readonly string[];
  expressionEvidence: readonly EnglishExpressionEvidence[];
  reviewDraft: readonly EnglishLessonCandidate[];
  roleplayTurnsCompleted: number;
  lastSuccessfulTurn: number;
  providerProfileId: string;
  recoverableError: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type LearningExpression = Readonly<{
  id: string;
  type: EnglishExpressionType;
  english: string;
  normalizedKey: string;
  translation: string;
  usageHint: string | null;
  source: "new_lesson" | "corrected" | "replayed" | "favorite";
  sourceCardIds: readonly string[];
  resourceId: string | null;
  sentenceId: string | null;
  vocabularyCardId: string | null;
  status: "due" | "learning" | "familiar" | "needs_review";
  dueAt: string;
  fullPromptCount: number;
  keywordPromptCount: number;
  independentCompletionCount: number;
  lastSeenAt: string;
  lastScenario: string;
  markedImportant: boolean;
}>;

export type LessonCardItem = Readonly<{
  expressionId: string;
  source: "new_lesson" | "replayed" | "corrected";
  completion: "completed" | "skipped";
  markedImportant: boolean;
}>;

export type LessonCard = Readonly<{
  id: string;
  idempotencyKey: string;
  scenario: string;
  goal: string;
  expressionIds: readonly string[];
  items: readonly LessonCardItem[];
  recommendedNextScenario: string | null;
  savedAt: string;
}>;

export type ReplayEvidence = Readonly<{
  id: string;
  expressionId: string;
  lessonId: string;
  scenario: string;
  promptLevel: EnglishCoachPromptLevel;
  completed: boolean;
  createdAt: string;
}>;

export type EnglishLessonCandidate = Readonly<{
  localId: string;
  english: string;
  translation: string;
  type: EnglishExpressionType;
  source: "new_lesson" | "replayed" | "corrected";
  completed: boolean;
  selected: boolean;
  markedImportant: boolean;
  promptLevel: EnglishCoachPromptLevel;
}>;

export type EnglishCoachTurn = Readonly<{
  visibleText: string;
  verdict: EnglishCoachVerdict;
  currentExpressionId: string | null;
  nextPromptLevel: EnglishCoachPromptLevel;
  candidates: readonly Readonly<{
    english: string;
    translation: string;
    type: EnglishExpressionType;
  }>[];
}>;

export type ReplayCandidate = Readonly<{
  id: string;
  english: string;
  translation: string;
  usageHint: string | null;
  type: EnglishExpressionType;
}>;

const ACTIVE_PHASES = new Set<EnglishLessonSession["resumePhase"]>([
  "scenario_setup",
  "lesson_preview",
  "teach_expression",
  "guided_recall",
  "imitation",
  "roleplay",
  "lesson_review",
  "card_review",
]);

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeEnglishExpression(value: string): string {
  return normalizeSpaces(value)
    .toLocaleLowerCase("en-US")
    .replace(/[.!?。！？]+$/gu, "");
}

export function inferExpressionType(value: string): EnglishExpressionType {
  const words = normalizeSpaces(value).split(" ").filter(Boolean);
  if (words.length <= 1) return "word";
  if (words.length <= 5) return "phrase";
  return "sentence";
}

export function currentLessonExpression(
  session: EnglishLessonSession,
): EnglishCoachExpression | null {
  return session.plan.expressions[session.currentExpressionIndex] ?? null;
}

export function injectAuthorizedReplayExpressions(
  plan: EnglishLessonPlan,
  selectedReplayExpressionIds: readonly string[],
  authorizedReplay: readonly ReplayCandidate[],
): EnglishLessonPlan {
  const selected = selectedReplayExpressionIds
    .map((id) => authorizedReplay.find((candidate) => candidate.id === id) ?? null)
    .filter((candidate): candidate is ReplayCandidate => candidate !== null);
  if (selected.length !== selectedReplayExpressionIds.length) {
    throw new Error("The lesson plan contains an unauthorized replay expression.");
  }
  const expressions = [...plan.expressions];
  const occupiedIndexes = new Set<number>();
  selected.forEach((replay) => {
    const matchingIndex = expressions.findIndex(
      (expression, index) =>
        !occupiedIndexes.has(index) &&
        (expression.replayExpressionId === replay.id ||
          (expression.type === replay.type &&
            normalizeEnglishExpression(expression.english) ===
              normalizeEnglishExpression(replay.english))),
    );
    const targetIndex =
      matchingIndex >= 0
        ? matchingIndex
        : expressions.findIndex((_expression, index) => !occupiedIndexes.has(index));
    const original = expressions[targetIndex];
    if (!original) throw new Error("A selected replay expression cannot be placed in this lesson.");
    occupiedIndexes.add(targetIndex);
    expressions[targetIndex] = Object.freeze({
      id: original.id,
      english: replay.english,
      translation: replay.translation,
      hint: replay.usageHint,
      type: replay.type,
      replayExpressionId: replay.id,
    });
  });
  return Object.freeze({ ...plan, expressions: Object.freeze(expressions) });
}

export function createEnglishLessonSession(
  options: Readonly<{
    id: string;
    scenario: string;
    providerProfileId: string;
    plan: EnglishLessonPlan;
    replayExpressionIds: readonly string[];
    now: string;
  }>,
): EnglishLessonSession {
  if (!normalizeSpaces(options.scenario)) throw new Error("A lesson scenario is required.");
  if (options.plan.expressions.length < 2 || options.plan.expressions.length > 3) {
    throw new Error("An English lesson plan must contain two or three core expressions.");
  }
  if (options.plan.roleplayTurns < 3 || options.plan.roleplayTurns > 5) {
    throw new Error("A roleplay must contain three to five learner turns.");
  }
  return Object.freeze({
    id: options.id,
    status: "active",
    promptVersion: "english-coach-v1",
    scenario: normalizeSpaces(options.scenario),
    phase: "lesson_preview",
    resumePhase: "lesson_preview",
    plan: Object.freeze({
      ...options.plan,
      expressions: Object.freeze([...options.plan.expressions]),
    }),
    currentExpressionIndex: 0,
    promptLevel: "full",
    selectedReplayExpressionIds: freezeStrings(options.replayExpressionIds.slice(0, 2)),
    temporaryMessages: Object.freeze([]),
    completedExpressionIds: Object.freeze([]),
    skippedExpressionIds: Object.freeze([]),
    expressionEvidence: Object.freeze([]),
    reviewDraft: Object.freeze([]),
    roleplayTurnsCompleted: 0,
    lastSuccessfulTurn: 0,
    providerProfileId: options.providerProfileId,
    recoverableError: null,
    createdAt: options.now,
    updatedAt: options.now,
  });
}

function activePhase(session: EnglishLessonSession): EnglishLessonSession["resumePhase"] {
  return ACTIVE_PHASES.has(session.phase as EnglishLessonSession["resumePhase"])
    ? (session.phase as EnglishLessonSession["resumePhase"])
    : session.resumePhase;
}

function appendMessage(
  session: EnglishLessonSession,
  message: EnglishCoachMessage,
  now: string,
): EnglishLessonSession {
  return Object.freeze({
    ...session,
    temporaryMessages: Object.freeze([...session.temporaryMessages, message]),
    updatedAt: now,
  });
}

export function appendEnglishCoachMessage(
  session: EnglishLessonSession,
  message: EnglishCoachMessage,
  now: string,
): EnglishLessonSession {
  return appendMessage(session, message, now);
}

export function pauseEnglishLesson(
  session: EnglishLessonSession,
  now: string,
): EnglishLessonSession {
  const resumePhase = activePhase(session);
  return Object.freeze({
    ...session,
    status: "paused",
    phase: "paused",
    resumePhase,
    updatedAt: now,
  });
}

export function resumeEnglishLesson(
  session: EnglishLessonSession,
  now: string,
): EnglishLessonSession {
  return Object.freeze({
    ...session,
    status: "active",
    phase: session.resumePhase,
    recoverableError: null,
    updatedAt: now,
  });
}

export function failEnglishLesson(
  session: EnglishLessonSession,
  message: string,
  now: string,
  kind: "provider_failed" | "save_failed" = "provider_failed",
): EnglishLessonSession {
  return Object.freeze({
    ...session,
    status: kind,
    phase: kind,
    resumePhase: activePhase(session),
    recoverableError: normalizeSpaces(message) || "This step could not be completed. Please retry.",
    updatedAt: now,
  });
}

function uniqueAppend(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : Object.freeze([...values, value]);
}

function appendProviderCandidates(
  session: EnglishLessonSession,
  turn: EnglishCoachTurn,
): EnglishLessonSession {
  if (turn.candidates.length === 0) return session;
  const reviewDraft = session.reviewDraft ?? Object.freeze([]);
  const known = new Set(
    [...reviewDraft, ...session.plan.expressions].map((candidate) =>
      normalizeEnglishExpression(candidate.english),
    ),
  );
  const additions: EnglishLessonCandidate[] = [];
  for (const candidate of turn.candidates) {
    const normalized = normalizeEnglishExpression(candidate.english);
    if (!normalized || known.has(normalized)) continue;
    if (reviewDraft.length + additions.length >= 5) break;
    known.add(normalized);
    additions.push(
      Object.freeze({
        localId: `provider-${normalized.replace(/[^a-z0-9]+/giu, "-") || additions.length}`,
        english: candidate.english,
        translation: candidate.translation,
        type: candidate.type,
        source: "corrected" as const,
        completed: false,
        selected: true,
        markedImportant: false,
        promptLevel: "full" as const,
      }),
    );
  }
  if (additions.length === 0) return session;
  return Object.freeze({
    ...session,
    reviewDraft: Object.freeze([...reviewDraft, ...additions]),
  });
}

function recordCompletedExpression(
  session: EnglishLessonSession,
  expression: EnglishCoachExpression | null,
): EnglishLessonSession {
  if (!expression) return session;
  const completedExpressionIds = uniqueAppend(session.completedExpressionIds, expression.id);
  const expressionEvidence = (session.expressionEvidence ?? Object.freeze([])).some(
    (item) => item.expressionId === expression.id,
  )
    ? (session.expressionEvidence ?? Object.freeze([]))
    : Object.freeze([
        ...(session.expressionEvidence ?? Object.freeze([])),
        Object.freeze({
          expressionId: expression.id,
          promptLevel: session.promptLevel,
          completed: true,
        }),
      ]);
  return Object.freeze({ ...session, completedExpressionIds, expressionEvidence });
}

function moveToNextExpression(session: EnglishLessonSession, now: string): EnglishLessonSession {
  const recorded = recordCompletedExpression(session, currentLessonExpression(session));
  const nextIndex = recorded.currentExpressionIndex + 1;
  if (nextIndex < recorded.plan.expressions.length) {
    return Object.freeze({
      ...recorded,
      phase: "teach_expression",
      resumePhase: "teach_expression",
      currentExpressionIndex: nextIndex,
      promptLevel: "full",
      lastSuccessfulTurn: recorded.lastSuccessfulTurn + 1,
      recoverableError: null,
      updatedAt: now,
    });
  }
  return Object.freeze({
    ...recorded,
    phase: "roleplay",
    resumePhase: "roleplay",
    promptLevel: "full",
    lastSuccessfulTurn: recorded.lastSuccessfulTurn + 1,
    recoverableError: null,
    updatedAt: now,
  });
}

export function applyEnglishCoachTurn(
  session: EnglishLessonSession,
  turn: EnglishCoachTurn,
  now: string,
): EnglishLessonSession {
  if (session.status !== "active") throw new Error("Only an active English lesson can advance.");
  const prepared = appendProviderCandidates(session, turn);
  const phase = activePhase(prepared);
  const current = currentLessonExpression(prepared);
  if (turn.currentExpressionId && current && turn.currentExpressionId !== current.id) {
    throw new Error("The response targets an expression outside the current lesson step.");
  }
  if (turn.verdict === "retry" || turn.verdict === "simplify" || turn.verdict === "stay") {
    return Object.freeze({
      ...prepared,
      promptLevel: turn.nextPromptLevel,
      recoverableError: null,
      updatedAt: now,
    });
  }
  if (turn.verdict === "finish" && phase !== "roleplay" && phase !== "lesson_review") {
    throw new Error("The lesson cannot finish from the current step.");
  }
  if (phase === "lesson_preview") {
    if (turn.verdict !== "advance") throw new Error("The preview can only advance to teaching.");
    return Object.freeze({
      ...prepared,
      phase: "teach_expression",
      resumePhase: "teach_expression",
      updatedAt: now,
    });
  }
  if (phase === "teach_expression") {
    if (turn.verdict !== "advance") throw new Error("Teaching can only advance to guided recall.");
    return Object.freeze({
      ...prepared,
      phase: "guided_recall",
      resumePhase: "guided_recall",
      promptLevel: "full",
      lastSuccessfulTurn: prepared.lastSuccessfulTurn + 1,
      updatedAt: now,
    });
  }
  if (phase === "guided_recall") {
    if (turn.verdict !== "advance") throw new Error("Guided recall can only advance to imitation.");
    return Object.freeze({
      ...prepared,
      phase: "imitation",
      resumePhase: "imitation",
      promptLevel: turn.nextPromptLevel,
      lastSuccessfulTurn: prepared.lastSuccessfulTurn + 1,
      updatedAt: now,
    });
  }
  if (phase === "imitation") {
    if (turn.verdict !== "advance")
      throw new Error("Imitation can only advance one expression at a time.");
    return moveToNextExpression(prepared, now);
  }
  if (phase === "roleplay") {
    if (turn.verdict !== "advance" && turn.verdict !== "finish") {
      throw new Error("Roleplay can only stay, retry, or advance one turn.");
    }
    const turns = prepared.roleplayTurnsCompleted + 1;
    if (turn.verdict === "finish" && turns < prepared.plan.roleplayTurns) {
      throw new Error("The planned roleplay turns are not complete.");
    }
    if (turns >= prepared.plan.roleplayTurns || turn.verdict === "finish") {
      return Object.freeze({
        ...prepared,
        phase: "lesson_review",
        resumePhase: "lesson_review",
        roleplayTurnsCompleted: turns,
        promptLevel: prepared.promptLevel,
        lastSuccessfulTurn: prepared.lastSuccessfulTurn + 1,
        updatedAt: now,
      });
    }
    return Object.freeze({
      ...prepared,
      roleplayTurnsCompleted: turns,
      promptLevel: turn.nextPromptLevel,
      lastSuccessfulTurn: prepared.lastSuccessfulTurn + 1,
      updatedAt: now,
    });
  }
  if (phase === "lesson_review") {
    if (turn.verdict !== "advance" && turn.verdict !== "finish") {
      throw new Error("Lesson review can only advance to card review.");
    }
    return Object.freeze({
      ...prepared,
      phase: "card_review",
      resumePhase: "card_review",
      updatedAt: now,
    });
  }
  throw new Error("This lesson state cannot accept a model transition.");
}

export function finishEnglishLessonEarly(
  session: EnglishLessonSession,
  now: string,
): EnglishLessonSession {
  if (session.status !== "active") throw new Error("Only an active lesson can finish early.");
  const phase = activePhase(session);
  if (phase === "lesson_preview" || phase === "card_review")
    throw new Error("The lesson cannot finish from the current step.");
  return Object.freeze({
    ...session,
    phase: "lesson_review",
    resumePhase: "lesson_review",
    recoverableError: null,
    updatedAt: now,
  });
}

export function skipCurrentEnglishExpression(
  session: EnglishLessonSession,
  now: string,
): EnglishLessonSession {
  if (activePhase(session) !== "guided_recall" && activePhase(session) !== "imitation") {
    throw new Error("Only an active expression can be skipped.");
  }
  const expression = currentLessonExpression(session);
  if (!expression) throw new Error("There is no active expression to skip.");
  const nextIndex = session.currentExpressionIndex + 1;
  const skipped = uniqueAppend(session.skippedExpressionIds, expression.id);
  if (nextIndex < session.plan.expressions.length) {
    return Object.freeze({
      ...session,
      phase: "teach_expression",
      resumePhase: "teach_expression",
      currentExpressionIndex: nextIndex,
      promptLevel: "full",
      skippedExpressionIds: skipped,
      updatedAt: now,
    });
  }
  return Object.freeze({
    ...session,
    phase: "roleplay",
    resumePhase: "roleplay",
    promptLevel: "full",
    skippedExpressionIds: skipped,
    updatedAt: now,
  });
}

function tokenSet(value: string): ReadonlySet<string> {
  const normalized = normalizeEnglishExpression(value);
  const latin = normalized.match(/[a-z0-9']{2,}/giu) ?? [];
  const chinese = Array.from(normalized.matchAll(/[\u3400-\u9fff]+/gu)).flatMap(([segment]) => {
    const characters = Array.from(segment ?? "");
    const bigrams = characters
      .slice(0, -1)
      .map((character, index) => `${character}${characters[index + 1] ?? ""}`);
    return characters.length > 1 ? [segment, ...bigrams] : characters;
  });
  return new Set([...latin, ...chinese].filter((token) => token.length > 0));
}
function overlapScore(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

export function selectReplayCandidates(
  options: Readonly<{
    scenario: string;
    expressions: readonly LearningExpression[];
    now: string;
  }>,
): readonly ReplayCandidate[] {
  const scenarioTokens = tokenSet(options.scenario);
  const nowMs = Date.parse(options.now);
  const ranked = options.expressions
    .filter(
      (expression) =>
        expression.status === "due" ||
        expression.status === "learning" ||
        expression.markedImportant ||
        expression.status === "familiar",
    )
    .map((expression) => {
      const semantic = overlapScore(
        scenarioTokens,
        tokenSet(`${expression.english} ${expression.translation} ${expression.lastScenario}`),
      );
      const due = Date.parse(expression.dueAt) <= nowMs ? 8 : 0;
      const promptDependency =
        expression.fullPromptCount > expression.independentCompletionCount ? 5 : 0;
      const important = expression.markedImportant ? 4 : 0;
      const freshness = expression.status === "learning" ? 2 : 0;
      const stale = Math.max(
        0,
        Math.round((nowMs - Date.parse(expression.lastSeenAt)) / 86_400_000 / 14),
      );
      return Object.freeze({
        expression,
        semantic,
        score: semantic * 12 + due + promptDependency + important + freshness + stale,
      });
    })
    .filter((item) => scenarioTokens.size > 0 && item.semantic > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.expression.id.localeCompare(right.expression.id),
    );
  return Object.freeze(
    ranked.slice(0, 2).map((item) =>
      Object.freeze({
        id: item.expression.id,
        english: item.expression.english,
        translation: item.expression.translation,
        usageHint: item.expression.usageHint,
        type: item.expression.type,
      }),
    ),
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePromptLevel(value: unknown): EnglishCoachPromptLevel {
  if (value === "full" || value === "keywords" || value === "none") return value;
  throw new Error("The response contains an invalid prompt level.");
}

function parseVerdict(value: unknown): EnglishCoachVerdict {
  if (
    value === "retry" ||
    value === "simplify" ||
    value === "stay" ||
    value === "advance" ||
    value === "finish"
  )
    return value;
  throw new Error("The response contains an invalid lesson decision.");
}

function parseCandidate(
  value: unknown,
): Readonly<{ english: string; translation: string; type: EnglishExpressionType }> | null {
  const candidate = asObject(value);
  if (!candidate) return null;
  const english = typeof candidate.english === "string" ? normalizeSpaces(candidate.english) : "";
  const translation =
    typeof candidate.translation === "string" ? normalizeSpaces(candidate.translation) : "";
  if (!english || !translation) return null;
  const type =
    candidate.type === "word" || candidate.type === "phrase" || candidate.type === "sentence"
      ? candidate.type
      : inferExpressionType(english);
  return Object.freeze({ english, translation, type });
}

export function parseEnglishCoachTurn(raw: string): EnglishCoachTurn {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("This step did not produce valid structured content. Please retry.");
  }
  const value = asObject(parsed);
  if (!value) throw new Error("This step did not produce a structured response.");
  const visibleText =
    typeof value.visibleText === "string" ? normalizeSpaces(value.visibleText) : "";
  if (!visibleText) throw new Error("This step is missing learner-facing guidance.");
  const currentExpressionId =
    typeof value.currentExpressionId === "string"
      ? normalizeSpaces(value.currentExpressionId) || null
      : null;
  const inputCandidates = Array.isArray(value.candidates) ? value.candidates : [];
  const candidates = inputCandidates
    .map(parseCandidate)
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);
  return Object.freeze({
    visibleText,
    verdict: parseVerdict(value.verdict),
    currentExpressionId,
    nextPromptLevel: parsePromptLevel(value.nextPromptLevel),
    candidates: Object.freeze(candidates),
  });
}

export function createCardCandidates(
  session: EnglishLessonSession,
): readonly EnglishLessonCandidate[] {
  const evidenceByExpression = new Map(
    (session.expressionEvidence ?? Object.freeze([])).map((item) => [item.expressionId, item]),
  );
  const reviewDraft = session.reviewDraft ?? Object.freeze([]);
  const reviewByLocalId = new Map(reviewDraft.map((candidate) => [candidate.localId, candidate]));
  const coreIds = new Set(session.plan.expressions.map((expression) => expression.id));
  const core = session.plan.expressions
    .filter((expression) => session.completedExpressionIds.includes(expression.id))
    .map((expression) => {
      const saved = reviewByLocalId.get(expression.id);
      if (saved) return saved;
      const evidence = evidenceByExpression.get(expression.id);
      return Object.freeze({
        localId: expression.id,
        english: expression.english,
        translation: expression.translation,
        type: expression.type,
        source:
          expression.replayExpressionId &&
          session.selectedReplayExpressionIds.includes(expression.replayExpressionId)
            ? ("replayed" as const)
            : ("new_lesson" as const),
        completed: evidence?.completed ?? true,
        selected: true,
        markedImportant: false,
        promptLevel: evidence?.promptLevel ?? "full",
      });
    });
  const additions = reviewDraft.filter((candidate) => !coreIds.has(candidate.localId));
  return Object.freeze([...core, ...additions].slice(0, 5));
}

export function updateEnglishReviewDraft(
  session: EnglishLessonSession,
  candidates: readonly EnglishLessonCandidate[],
  now: string,
): EnglishLessonSession {
  return Object.freeze({
    ...session,
    reviewDraft: Object.freeze([...candidates].slice(0, 5)),
    updatedAt: now,
  });
}

export function latestEnglishCoachFeedback(
  session: EnglishLessonSession,
): EnglishCoachMessage | null {
  for (let index = session.temporaryMessages.length - 1; index >= 0; index -= 1) {
    const message = session.temporaryMessages[index];
    if (message?.role === "assistant") return message;
  }
  return null;
}

export function assertAuthorizedReplayIds(
  selectedIds: readonly string[],
  authorized: readonly ReplayCandidate[],
): readonly string[] {
  const allowed = new Set(authorized.map((item) => item.id));
  if (selectedIds.length > 2 || selectedIds.some((id) => !allowed.has(id))) {
    throw new Error("The response selected replay content outside the permitted set.");
  }
  return freezeStrings(selectedIds);
}

export function buildEnglishCoachPrompt(
  options: Readonly<{
    session: EnglishLessonSession;
    replay: readonly ReplayCandidate[];
    learnerInput: string;
  }>,
): string {
  const expression = currentLessonExpression(options.session);
  const messages = options.session.temporaryMessages
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content }));
  return JSON.stringify(
    Object.freeze({
      role: "You are a concise native English teacher for a Chinese beginner. Teach one action only. Do not claim pronunciation assessment. Never output the learner's incorrect original sentence in candidates.",
      phase: activePhase(options.session),
      scenario: options.session.scenario,
      goal: options.session.plan.goal,
      currentExpression: expression,
      promptLevel: options.session.promptLevel,
      roleplayTurnsCompleted: options.session.roleplayTurnsCompleted,
      roleplayTurnsPlanned: options.session.plan.roleplayTurns,
      allowedReplayExpressions: options.replay,
      recentMessages: messages,
      learnerInput: normalizeSpaces(options.learnerInput),
      schema: {
        visibleText: "string",
        currentExpressionId: "string | null",
        verdict: "retry | simplify | stay | advance | finish",
        nextPromptLevel: "full | keywords | none",
        candidates: "optional array of 0-5 { english, translation, type } correct expressions only",
      },
    }),
  );
}

export function createStaticLessonPlan(scenario: string): EnglishLessonPlan {
  const normalizedScenario = normalizeSpaces(scenario);
  return Object.freeze({
    goal: `在“${normalizedScenario}”的场景中完成一次简短交流`,
    estimatedMinutes: 8,
    expressions: Object.freeze([
      Object.freeze({
        id: "core-1",
        english: "I'd like to…",
        translation: "我想要……",
        hint: "用来礼貌表达你的需求",
        type: "phrase",
      }),
      Object.freeze({
        id: "core-2",
        english: "Could you help me, please?",
        translation: "你可以帮我吗？",
        hint: "遇到需要协助时使用",
        type: "sentence",
      }),
      Object.freeze({
        id: "core-3",
        english: "Thank you. That's all.",
        translation: "谢谢，就这些。",
        hint: "自然结束一次交流",
        type: "sentence",
      }),
    ]),
    roleplayTurns: 3,
  });
}

export function createStaticCoachTurn(session: EnglishLessonSession): EnglishCoachTurn {
  const phase = activePhase(session);
  const expression = currentLessonExpression(session);
  if (phase === "lesson_preview") {
    return Object.freeze({
      visibleText: `这节课会练 3 个实用表达，目标是：${session.plan.goal}。准备好后点击“开始第一句”。`,
      verdict: "advance",
      currentExpressionId: null,
      nextPromptLevel: "full",
      candidates: Object.freeze([]),
    });
  }
  if (phase === "teach_expression" && expression) {
    return Object.freeze({
      visibleText: `${expression.english}\n\n${expression.translation}${expression.hint ? `\n${expression.hint}` : ""}\n\n先大声读一遍，然后点击“我已跟读”。`,
      verdict: "advance",
      currentExpressionId: expression.id,
      nextPromptLevel: "full",
      candidates: Object.freeze([]),
    });
  }
  if (phase === "guided_recall" && expression) {
    return Object.freeze({
      visibleText: `不看原句，试着输入这句话：${expression.translation}`,
      verdict: "advance",
      currentExpressionId: expression.id,
      nextPromptLevel: "full",
      candidates: Object.freeze([]),
    });
  }
  if (phase === "imitation" && expression) {
    return Object.freeze({
      visibleText: `把一个场景信息换掉：用 “I'd like to…” 说出你自己的需求。`,
      verdict: "advance",
      currentExpressionId: expression.id,
      nextPromptLevel: "keywords",
      candidates: Object.freeze([]),
    });
  }
  if (phase === "roleplay") {
    return Object.freeze({
      visibleText:
        session.roleplayTurnsCompleted === 0
          ? "我是店员：Hi! What can I get for you?"
          : session.roleplayTurnsCompleted === 1
            ? "店员：Sure. Anything else?"
            : "店员：Here you are.",
      verdict: "advance",
      currentExpressionId: null,
      nextPromptLevel:
        session.roleplayTurnsCompleted === 0
          ? "full"
          : session.roleplayTurnsCompleted === 1
            ? "keywords"
            : "none",
      candidates: Object.freeze([]),
    });
  }
  return Object.freeze({
    visibleText: "这一步还没有准备好。请重试。",
    verdict: "stay",
    currentExpressionId: expression?.id ?? null,
    nextPromptLevel: session.promptLevel,
    candidates: Object.freeze([]),
  });
}

export function buildEnglishLessonPlanPrompt(
  options: Readonly<{
    scenario: string;
    replay: readonly ReplayCandidate[];
  }>,
): string {
  return JSON.stringify(
    Object.freeze({
      role: "You are a native English teacher for a Chinese beginner. Plan a concise text-only lesson. Do not ask for voice recordings and do not make pronunciation claims.",
      scenario: normalizeSpaces(options.scenario),
      allowedReplayExpressions: options.replay,
      requirements: [
        "Return exactly two or three core expressions.",
        "Each expression must be correct, practical, concise, and include Chinese translation.",
        "Plan exactly three roleplay learner turns.",
        "Select no more than two replay IDs, only from the allowed list; an empty selection is allowed.",
        "Every selected replay ID must appear as a core expression and include its exact historical ID in replayExpressionId.",
      ],
      schema: {
        goal: "string",
        estimatedMinutes: "number from 5 to 12",
        expressions: "array of 2-3 { id, english, translation, hint?, type?, replayExpressionId? }",
        roleplayTurns: "number 3-5",
        selectedReplayExpressionIds: "array of permitted IDs, max 2",
      },
    }),
  );
}

export function parseEnglishLessonPlan(raw: string): Readonly<{
  plan: EnglishLessonPlan;
  selectedReplayExpressionIds: readonly string[];
}> {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("课程计划没有生成有效的结构化内容，请重试。");
  }
  const value = asObject(parsed);
  if (!value) throw new Error("课程计划不是有效的对象。");
  const goal = typeof value.goal === "string" ? normalizeSpaces(value.goal) : "";
  const estimatedMinutes =
    typeof value.estimatedMinutes === "number" && Number.isFinite(value.estimatedMinutes)
      ? Math.round(value.estimatedMinutes)
      : 0;
  const roleplayTurns =
    typeof value.roleplayTurns === "number" && Number.isInteger(value.roleplayTurns)
      ? value.roleplayTurns
      : 0;
  const rawExpressions = Array.isArray(value.expressions) ? value.expressions : [];
  const expressions = rawExpressions.map((item, index) => {
    const expression = asObject(item);
    if (!expression) return null;
    const english =
      typeof expression.english === "string" ? normalizeSpaces(expression.english) : "";
    const translation =
      typeof expression.translation === "string" ? normalizeSpaces(expression.translation) : "";
    if (!english || !translation) return null;
    const id =
      typeof expression.id === "string" && normalizeSpaces(expression.id)
        ? normalizeSpaces(expression.id)
        : `core-${index + 1}`;
    const hint =
      typeof expression.hint === "string" ? normalizeSpaces(expression.hint) || null : null;
    const type =
      expression.type === "word" || expression.type === "phrase" || expression.type === "sentence"
        ? expression.type
        : inferExpressionType(english);
    return Object.freeze({ id, english, translation, hint, type });
  });
  if (
    !goal ||
    estimatedMinutes < 5 ||
    estimatedMinutes > 12 ||
    expressions.some((item) => item === null)
  ) {
    throw new Error("课程计划缺少可用目标、时长或表达，请重试。");
  }
  const resolvedExpressions = expressions as readonly EnglishCoachExpression[];
  if (
    resolvedExpressions.length < 2 ||
    resolvedExpressions.length > 3 ||
    roleplayTurns < 3 ||
    roleplayTurns > 5
  ) {
    throw new Error("课程计划不符合本课的步骤限制，请重试。");
  }
  const selectedReplayExpressionIds = Array.isArray(value.selectedReplayExpressionIds)
    ? value.selectedReplayExpressionIds
        .filter(
          (item): item is string => typeof item === "string" && Boolean(normalizeSpaces(item)),
        )
        .map(normalizeSpaces)
    : [];
  if (
    selectedReplayExpressionIds.length > 2 ||
    new Set(selectedReplayExpressionIds).size !== selectedReplayExpressionIds.length
  ) {
    throw new Error("课程计划包含了不合法的复现选择，请重试。");
  }
  return Object.freeze({
    plan: Object.freeze({
      goal,
      estimatedMinutes,
      expressions: Object.freeze(resolvedExpressions),
      roleplayTurns,
    }),
    selectedReplayExpressionIds: freezeStrings(selectedReplayExpressionIds),
  });
}
