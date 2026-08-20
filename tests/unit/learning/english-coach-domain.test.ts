import { describe, expect, test } from "vitest";
import {
  applyEnglishCoachTurn,
  assertAuthorizedReplayIds,
  buildEnglishCoachPrompt,
  createCardCandidates,
  createEnglishLessonSession,
  createStaticLessonPlan,
  injectAuthorizedReplayExpressions,
  parseEnglishCoachTurn,
  selectReplayCandidates,
  type EnglishCoachTurn,
  type LearningExpression,
} from "../../../src/learning/english-coach-domain";
import {
  createEnglishPracticeNavigationSnapshot,
  saveConfirmedEnglishLesson,
} from "../../../src/learning/english-coach-storage";
import {
  createInitialLearningSnapshot,
  normalizeLearningSnapshot,
} from "../../../src/learning/learning-types";

const NOW = "2026-08-15T08:00:00.000Z";

function session() {
  return createEnglishLessonSession({
    id: "lesson-1",
    scenario: "在咖啡店点一杯拿铁",
    providerProfileId: "profile-1",
    plan: createStaticLessonPlan("在咖啡店点一杯拿铁"),
    replayExpressionIds: Object.freeze([]),
    now: NOW,
  });
}

function turn(
  verdict: EnglishCoachTurn["verdict"],
  expressionId: string | null = null,
): EnglishCoachTurn {
  return Object.freeze({
    visibleText: "继续当前任务。",
    verdict,
    currentExpressionId: expressionId,
    nextPromptLevel: "keywords",
    candidates: Object.freeze([]),
  });
}

function expression(
  id: string,
  english: string,
  values: Partial<LearningExpression> = {},
): LearningExpression {
  return Object.freeze({
    id,
    type: "sentence",
    english,
    normalizedKey: english.toLowerCase(),
    translation: "中文释义",
    usageHint: null,
    source: "new_lesson",
    sourceCardIds: Object.freeze(["card-1"]),
    resourceId: null,
    sentenceId: null,
    vocabularyCardId: null,
    status: "learning",
    dueAt: "2026-08-01T00:00:00.000Z",
    fullPromptCount: 1,
    keywordPromptCount: 0,
    independentCompletionCount: 0,
    lastSeenAt: "2026-06-01T00:00:00.000Z",
    lastScenario: "在咖啡店点单",
    markedImportant: false,
    ...values,
  });
}

describe("English coach state machine", () => {
  test("moves one adjacent teaching action at a time and rejects early finish", () => {
    const fresh = session();
    expect(() => applyEnglishCoachTurn(fresh, turn("finish"), NOW)).toThrow(/cannot finish/u);
    const teaching = applyEnglishCoachTurn(fresh, turn("advance"), NOW);
    expect(teaching.phase).toBe("teach_expression");
    expect(() => applyEnglishCoachTurn(teaching, turn("finish", "core-1"), NOW)).toThrow(
      /cannot finish/u,
    );
    const recall = applyEnglishCoachTurn(teaching, turn("advance", "core-1"), NOW);
    expect(recall.phase).toBe("guided_recall");
    const unchanged = applyEnglishCoachTurn(recall, turn("simplify", "core-1"), NOW);
    expect(unchanged.phase).toBe("guided_recall");
  });

  test("rejects a model response that targets a different expression", () => {
    const teaching = applyEnglishCoachTurn(session(), turn("advance"), NOW);
    expect(() => applyEnglishCoachTurn(teaching, turn("advance", "other-expression"), NOW)).toThrow(
      /outside the current/u,
    );
  });

  test("accepts only valid structured coach results", () => {
    expect(() =>
      parseEnglishCoachTurn('{"visibleText":"ok","verdict":"jump","nextPromptLevel":"full"}'),
    ).toThrow(/invalid lesson decision/u);
    const parsed = parseEnglishCoachTurn(
      '{"visibleText":"请再试一次","currentExpressionId":"core-1","verdict":"retry","nextPromptLevel":"keywords","candidates":[{"english":"Thank you.","translation":"谢谢","type":"sentence"}]}',
    );
    expect(parsed.verdict).toBe("retry");
    expect(parsed.candidates).toHaveLength(1);
  });
});

describe("English replay permissions", () => {
  test("ranks only eligible learning expressions and returns at most two", () => {
    const selected = selectReplayCandidates({
      scenario: "在咖啡店点单",
      now: NOW,
      expressions: Object.freeze([
        expression("one", "I'd like a coffee."),
        expression("two", "Could you help me?", { markedImportant: true }),
        expression("three", "Where is the station?", {
          status: "familiar",
          dueAt: "2026-12-01T00:00:00.000Z",
        }),
      ]),
    });
    expect(selected.length).toBeLessThanOrEqual(2);
    expect(selected.map((item) => item.id)).toContain("one");
    expect(() => assertAuthorizedReplayIds(Object.freeze(["one", "unknown"]), selected)).toThrow(
      /permitted/u,
    );
  });
});

describe("English provider privacy boundary", () => {
  test("builds an English-only payload without workspace fields or note content", () => {
    const payload = buildEnglishCoachPrompt({
      session: session(),
      replay: Object.freeze([
        Object.freeze({
          id: "saved-1",
          english: "Could you help me?",
          translation: "你可以帮我吗？",
          usageHint: null,
          type: "sentence" as const,
        }),
      ]),
      learnerInput: "Could you help me?",
    });
    expect(payload).toContain("allowedReplayExpressions");
    expect(payload).not.toContain("workspaceId");
    expect(payload).not.toContain("document");
    expect(payload).not.toContain("/Users/");
  });

  test("normalizes a persisted English lesson session for crash recovery", () => {
    const snapshot = createInitialLearningSnapshot();
    const restored = normalizeLearningSnapshot(
      Object.freeze({ ...snapshot, englishLessonSessions: Object.freeze([session()]) }),
    );
    expect(restored.version).toBe(5);
    expect(restored.englishLessonSessions[0]?.scenario).toBe("在咖啡店点一杯拿铁");
  });
});

describe("English lesson saving", () => {
  test("persists only confirmed correct content and removes temporary session messages", () => {
    const active = session();
    const snapshot = createInitialLearningSnapshot();
    const withSession = Object.freeze({
      ...snapshot,
      englishLessonSessions: Object.freeze([active]),
    });
    const result = saveConfirmedEnglishLesson({
      snapshot: withSession,
      session: active,
      now: NOW,
      candidates: Object.freeze([
        Object.freeze({
          localId: "core-1",
          english: "I'd like to…",
          translation: "我想要……",
          type: "phrase" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: true,
          markedImportant: true,
          promptLevel: "keywords" as const,
        }),
        Object.freeze({
          localId: "core-2",
          english: "Could you help me, please?",
          translation: "你可以帮我吗？",
          type: "sentence" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: true,
          markedImportant: false,
          promptLevel: "full" as const,
        }),
      ]),
    });
    expect(result.card?.expressionIds).toHaveLength(2);
    expect(result.snapshot.englishLessonSessions).toHaveLength(0);
    expect(result.snapshot.learningExpressions).toHaveLength(2);
    expect(result.snapshot.resources).toHaveLength(1);
    expect(result.snapshot.replayEvidence).toHaveLength(2);
  });

  test("allows an all-cancelled review to finish without creating learning data", () => {
    const active = session();
    const snapshot = createInitialLearningSnapshot();
    const result = saveConfirmedEnglishLesson({
      snapshot: Object.freeze({ ...snapshot, englishLessonSessions: Object.freeze([active]) }),
      session: active,
      now: NOW,
      candidates: Object.freeze([
        Object.freeze({
          localId: "core-1",
          english: "I'd like to…",
          translation: "我想要……",
          type: "phrase" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: false,
          markedImportant: false,
          promptLevel: "full" as const,
        }),
      ]),
    });
    expect(result.card).toBeNull();
    expect(result.snapshot.englishLessonSessions).toHaveLength(0);
    expect(result.snapshot.learningExpressions).toHaveLength(0);
    expect(result.snapshot.lessonCards).toHaveLength(0);
  });
});

describe("P1 lesson review and evidence regression", () => {
  test("keeps model-corrected candidates in the review draft", () => {
    const prepared = applyEnglishCoachTurn(session(), turn("advance"), NOW);
    const withCandidate = applyEnglishCoachTurn(
      prepared,
      Object.freeze({
        visibleText: "正确表达是 Could I get a latte, please? 请再试一次。",
        verdict: "simplify" as const,
        currentExpressionId: "core-1",
        nextPromptLevel: "full" as const,
        candidates: Object.freeze([
          Object.freeze({
            english: "Could I get a latte, please?",
            translation: "我可以要一杯拿铁吗？",
            type: "sentence" as const,
          }),
        ]),
      }),
      NOW,
    );
    expect(withCandidate.reviewDraft).toMatchObject([
      { english: "Could I get a latte, please?", source: "corrected", selected: true },
    ]);
  });

  test("matches Chinese scenarios by semantic Chinese tokens and rejects unrelated replay", () => {
    const selected = selectReplayCandidates({
      scenario: "在咖啡店点单",
      now: NOW,
      expressions: Object.freeze([
        expression("coffee", "I'd like a coffee.", {
          translation: "我想点咖啡",
          lastScenario: "在咖啡店点单",
        }),
        expression("hotel", "I have a reservation.", {
          translation: "我有预订",
          lastScenario: "酒店办理入住",
        }),
      ]),
    });
    expect(selected.map((item) => item.id)).toEqual(["coffee"]);
  });

  test("records prompt evidence per expression and updates familiar status locally", () => {
    const active = session();
    const snapshot = createInitialLearningSnapshot();
    const result = saveConfirmedEnglishLesson({
      snapshot: Object.freeze({ ...snapshot, englishLessonSessions: Object.freeze([active]) }),
      session: active,
      now: NOW,
      candidates: Object.freeze([
        Object.freeze({
          localId: "a",
          english: "Can I pay by card?",
          translation: "我可以刷卡吗？",
          type: "sentence" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: true,
          markedImportant: false,
          promptLevel: "full" as const,
        }),
        Object.freeze({
          localId: "b",
          english: "I understand.",
          translation: "我明白了。",
          type: "sentence" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: true,
          markedImportant: false,
          promptLevel: "none" as const,
        }),
      ]),
    });
    const guided = result.snapshot.learningExpressions.find(
      (item) => item.english === "Can I pay by card?",
    );
    const independent = result.snapshot.learningExpressions.find(
      (item) => item.english === "I understand.",
    );
    expect(guided).toMatchObject({ fullPromptCount: 1, independentCompletionCount: 0 });
    expect(independent).toMatchObject({ fullPromptCount: 0, independentCompletionCount: 1 });
    expect(result.snapshot.replayEvidence.map((item) => item.promptLevel)).toEqual([
      "full",
      "none",
    ]);
  });
});

describe("P1 save recovery regression", () => {
  test("keeps a save-failed session discoverable and resumable at card review", async () => {
    const domain = await import("../../../src/learning/english-coach-domain");
    const storage = await import("../../../src/learning/english-coach-storage");
    const failed = domain.failEnglishLesson(
      Object.freeze({
        ...session(),
        phase: "card_review" as const,
        resumePhase: "card_review" as const,
        reviewDraft: Object.freeze([
          Object.freeze({
            localId: "manual-1",
            english: "Could I have tea?",
            translation: "我可以要茶吗？",
            type: "sentence" as const,
            source: "corrected" as const,
            completed: true,
            selected: true,
            markedImportant: false,
            promptLevel: "none" as const,
          }),
        ]),
      }),
      "disk unavailable",
      NOW,
      "save_failed",
    );
    const snapshot = Object.freeze({
      ...createInitialLearningSnapshot(),
      englishLessonSessions: Object.freeze([failed]),
    });
    expect(storage.activeEnglishLesson(snapshot)?.status).toBe("save_failed");
    const resumed = domain.resumeEnglishLesson(failed, NOW);
    expect(resumed).toMatchObject({ status: "active", phase: "card_review" });
    expect(domain.createCardCandidates(resumed)).toContainEqual(
      expect.objectContaining({ english: "Could I have tea?" }),
    );
  });

  test("tolerates a pre-evidence session restored from an earlier app version", () => {
    const legacy = session() as unknown as {
      expressionEvidence?: undefined;
      reviewDraft?: undefined;
    };
    const candidates = createCardCandidates(legacy as unknown as ReturnType<typeof session>);
    expect(candidates).toEqual([]);
  });
});

describe("English practice navigation", () => {
  test("opens the first saved sentence in the practice section", () => {
    const snapshot = createInitialLearningSnapshot();
    const resource = Object.freeze({
      id: "resource-1",
      title: "Lesson",
      description: "Lesson sentences",
      language: "English",
      source: "generated" as const,
      content: "Hello.",
      sentences: Object.freeze([
        Object.freeze({
          id: "sentence-1",
          resourceId: "resource-1",
          order: 0,
          text: "Hello.",
          translation: "你好。",
          startMs: null,
          endMs: null,
          sourceAudioUri: null,
        }),
      ]),
      mediaKind: "text" as const,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const opened = createEnglishPracticeNavigationSnapshot(
      Object.freeze({ ...snapshot, resources: Object.freeze([resource]) }),
      resource.id,
    );
    expect(opened.ui).toMatchObject({
      section: "practice",
      selectedResourceId: resource.id,
      selectedSentenceId: "sentence-1",
    });
  });
});

describe("Second P1 regression coverage", () => {
  test("uses reviewDraft as the stable authority for a core expression after recovery", () => {
    const active = Object.freeze({
      ...session(),
      phase: "card_review" as const,
      resumePhase: "card_review" as const,
      completedExpressionIds: Object.freeze(["core-1"]),
      expressionEvidence: Object.freeze([
        Object.freeze({ expressionId: "core-1", promptLevel: "full" as const, completed: true }),
      ]),
      reviewDraft: Object.freeze([
        Object.freeze({
          localId: "core-1",
          english: "Could I get a latte, please?",
          translation: "我可以要一杯拿铁吗？",
          type: "sentence" as const,
          source: "new_lesson" as const,
          completed: true,
          selected: false,
          markedImportant: true,
          promptLevel: "full" as const,
        }),
      ]),
    });
    const candidates = createCardCandidates(active);
    expect(candidates).toEqual([
      expect.objectContaining({
        localId: "core-1",
        english: "Could I get a latte, please?",
        selected: false,
        markedImportant: true,
      }),
    ]);
  });

  test("stores corrected retry content as needs_review without completion evidence", () => {
    const teaching = applyEnglishCoachTurn(session(), turn("advance"), NOW);
    const corrected = applyEnglishCoachTurn(
      teaching,
      Object.freeze({
        visibleText: "请用更短的正确句子重试。",
        verdict: "simplify" as const,
        currentExpressionId: "core-1",
        nextPromptLevel: "full" as const,
        candidates: Object.freeze([
          Object.freeze({
            english: "I'd like tea.",
            translation: "我想要茶。",
            type: "sentence" as const,
          }),
        ]),
      }),
      NOW,
    );
    const candidate = createCardCandidates(
      Object.freeze({
        ...corrected,
        phase: "card_review" as const,
        resumePhase: "card_review" as const,
      }),
    )[0];
    expect(candidate).toMatchObject({ completed: false, promptLevel: "full" });
    const result = saveConfirmedEnglishLesson({
      snapshot: Object.freeze({
        ...createInitialLearningSnapshot(),
        englishLessonSessions: Object.freeze([corrected]),
      }),
      session: corrected,
      now: NOW,
      candidates: Object.freeze([candidate!]),
    });
    expect(result.snapshot.learningExpressions[0]).toMatchObject({
      status: "needs_review",
      fullPromptCount: 0,
      independentCompletionCount: 0,
    });
    expect(result.snapshot.replayEvidence[0]).toMatchObject({
      completed: false,
      promptLevel: "full",
    });
  });
});

describe("Third P1 candidate integrity regression", () => {
  test("deduplicates equivalent provider candidates in the same response", () => {
    const prepared = applyEnglishCoachTurn(session(), turn("advance"), NOW);
    const next = applyEnglishCoachTurn(
      prepared,
      Object.freeze({
        visibleText: "请使用正确表达重试。",
        verdict: "retry" as const,
        currentExpressionId: "core-1",
        nextPromptLevel: "full" as const,
        candidates: Object.freeze([
          Object.freeze({
            english: "Could I get tea?",
            translation: "我可以要茶吗？",
            type: "sentence" as const,
          }),
          Object.freeze({
            english: "  could I get tea? ",
            translation: "我可以要茶吗？",
            type: "sentence" as const,
          }),
        ]),
      }),
      NOW,
    );
    expect(next.reviewDraft).toHaveLength(1);
    expect(next.reviewDraft[0]).toMatchObject({ localId: "provider-could-i-get-tea" });
  });

  test("deduplicates equivalent selected candidates before card, resource and evidence creation", () => {
    const active = session();
    const snapshot = Object.freeze({
      ...createInitialLearningSnapshot(),
      englishLessonSessions: Object.freeze([active]),
    });
    const duplicate = Object.freeze({
      localId: "one",
      english: "Could I get tea?",
      translation: "我可以要茶吗？",
      type: "sentence" as const,
      source: "corrected" as const,
      completed: false,
      selected: true,
      markedImportant: false,
      promptLevel: "full" as const,
    });
    const duplicateVariant = Object.freeze({
      ...duplicate,
      localId: "two",
      english: " could I get tea? ",
    });
    const result = saveConfirmedEnglishLesson({
      snapshot,
      session: active,
      now: NOW,
      candidates: Object.freeze([duplicate, duplicateVariant]),
    });
    expect(result.card?.items).toHaveLength(1);
    expect(result.snapshot.learningExpressions).toHaveLength(1);
    expect(result.snapshot.replayEvidence).toHaveLength(1);
    expect(result.snapshot.resources[0]?.sentences).toHaveLength(1);
  });

  test("maps a historical replay ID onto a different provider core ID", () => {
    const plan = injectAuthorizedReplayExpressions(
      createStaticLessonPlan("在咖啡店点单"),
      Object.freeze(["saved-1"]),
      Object.freeze([
        Object.freeze({
          id: "saved-1",
          english: "Could I get tea?",
          translation: "我可以要茶吗？",
          usageHint: "礼貌点单",
          type: "sentence" as const,
        }),
      ]),
    );
    const active = Object.freeze({
      ...session(),
      plan,
      phase: "card_review" as const,
      resumePhase: "card_review" as const,
      completedExpressionIds: Object.freeze(["core-1"]),
      selectedReplayExpressionIds: Object.freeze(["saved-1"]),
    });
    expect(active.plan.expressions[0]).toMatchObject({
      id: "core-1",
      replayExpressionId: "saved-1",
      english: "Could I get tea?",
    });
    expect(createCardCandidates(active)[0]).toMatchObject({
      localId: "core-1",
      source: "replayed",
      english: "Could I get tea?",
    });
  });

  test("injects two selected replay expressions without one overwriting the other", () => {
    const plan = injectAuthorizedReplayExpressions(
      createStaticLessonPlan("在咖啡店点单"),
      Object.freeze(["saved-help", "saved-tea"]),
      Object.freeze([
        Object.freeze({
          id: "saved-help",
          english: "Could you help me, please?",
          translation: "你可以帮我吗？",
          usageHint: "寻求帮助",
          type: "sentence" as const,
        }),
        Object.freeze({
          id: "saved-tea",
          english: "Could I get tea?",
          translation: "我可以要茶吗？",
          usageHint: "礼貌点单",
          type: "sentence" as const,
        }),
      ]),
    );
    expect(plan.expressions.map((item) => item.replayExpressionId)).toEqual([
      "saved-tea",
      "saved-help",
      undefined,
    ]);
    expect(plan.expressions.slice(0, 2).map((item) => item.english)).toEqual([
      "Could I get tea?",
      "Could you help me, please?",
    ]);
    const active = Object.freeze({
      ...session(),
      plan,
      phase: "card_review" as const,
      resumePhase: "card_review" as const,
      completedExpressionIds: Object.freeze(["core-1", "core-2"]),
      selectedReplayExpressionIds: Object.freeze(["saved-help", "saved-tea"]),
    });
    expect(createCardCandidates(active).map((candidate) => candidate.source)).toEqual([
      "replayed",
      "replayed",
    ]);
  });

  test("marks a completed core expression selected by the plan as replayed", () => {
    const base = session();
    const first = base.plan.expressions[0];
    if (!first) throw new Error("The static lesson must provide a first expression.");
    const active = Object.freeze({
      ...base,
      phase: "card_review" as const,
      resumePhase: "card_review" as const,
      completedExpressionIds: Object.freeze(["core-1"]),
      selectedReplayExpressionIds: Object.freeze(["saved-legacy-1"]),
      plan: Object.freeze({
        ...base.plan,
        expressions: Object.freeze([
          Object.freeze({
            id: first.id,
            english: first.english,
            translation: first.translation,
            hint: first.hint,
            type: first.type,
            replayExpressionId: "saved-legacy-1",
          }),
          ...base.plan.expressions.slice(1),
        ]),
      }),
    });
    expect(createCardCandidates(active)[0]).toMatchObject({ source: "replayed" });
  });
});
