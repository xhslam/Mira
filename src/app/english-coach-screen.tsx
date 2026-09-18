import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronRight, CircleAlert, Pause, Play, Sparkles, X } from "lucide-react-native";
import type { AppServices } from "./app-services";
import { useTheme, type Theme } from "./theme";
import { collectLearningResponse } from "../learning/learning-ai";
import {
  applyEnglishCoachTurn,
  appendEnglishCoachMessage,
  assertAuthorizedReplayIds,
  buildEnglishCoachPrompt,
  buildEnglishLessonPlanPrompt,
  createCardCandidates,
  createEnglishLessonSession,
  createStaticCoachTurn,
  currentLessonExpression,
  finishEnglishLessonEarly,
  inferExpressionType,
  injectAuthorizedReplayExpressions,
  latestEnglishCoachFeedback,
  failEnglishLesson,
  parseEnglishCoachTurn,
  parseEnglishLessonPlan,
  pauseEnglishLesson,
  resumeEnglishLesson,
  selectReplayCandidates,
  skipCurrentEnglishExpression,
  updateEnglishReviewDraft,
  type EnglishLessonCandidate,
  type EnglishLessonSession,
} from "../learning/english-coach-domain";
import {
  activeEnglishLesson,
  createEnglishPracticeNavigationSnapshot,
  discardEnglishLesson,
  replaceEnglishLessonAtFront,
  saveConfirmedEnglishLesson,
} from "../learning/english-coach-storage";
import type { LearningSnapshot } from "../learning/learning-types";
import { createSerializedStateQueue } from "../learning/serialized-state-queue";

type CoachProps = Readonly<{
  services: AppServices;
  snapshot: LearningSnapshot;
  onSnapshotChange: (next: LearningSnapshot) => Promise<void>;
  onSelectMarkdown: () => void;
  onOpenPractice: () => void;
  onOpenSidebar?: () => void;
}>;

function now(): string {
  return new Date().toISOString();
}

function taskForPhase(session: EnglishLessonSession): string {
  if (session.phase === "guided_recall") return "不看原句，输入你记得的英文。";
  if (session.phase === "imitation") return "替换一个场景信息，写出你自己的句子。";
  if (session.phase === "roleplay") return "只回复这一轮对话，然后继续。";
  return "完成当前这一步。";
}

function primaryLabel(session: EnglishLessonSession): string {
  if (session.phase === "lesson_preview") return "开始第一句";
  if (session.phase === "teach_expression") return "我已跟读";
  if (session.phase === "guided_recall") return "提交回答";
  if (session.phase === "imitation") return "提交替换";
  if (session.phase === "roleplay") return "发送回复";
  if (session.phase === "lesson_review") return "选择要保存的内容";
  return "继续";
}

function sourceLabel(source: EnglishLessonCandidate["source"]): string {
  if (source === "replayed") return "旧内容复现";
  if (source === "corrected") return "纠正后保存";
  return "本节新学";
}

export function EnglishCoachScreen({
  services,
  snapshot,
  onSnapshotChange,
  onSelectMarkdown,
  onOpenPractice,
  onOpenSidebar,
}: CoachProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const session = activeEnglishLesson(snapshot);
  const [scenario, setScenario] = useState("");
  const [answer, setAnswer] = useState("");
  const [planning, setPlanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidateOverrides, setCandidateOverrides] = useState<
    readonly EnglishLessonCandidate[] | null
  >(null);
  const [candidateEnglish, setCandidateEnglish] = useState("");
  const [candidateTranslation, setCandidateTranslation] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const candidateOverridesRef = useRef<Readonly<{
    sessionId: string;
    candidates: readonly EnglishLessonCandidate[];
  }> | null>(null);
  const idSequenceRef = useRef(0);
  const snapshotQueueRef = useRef(createSerializedStateQueue(snapshot, onSnapshotChange));
  function nextEventId(prefix: string): string {
    idSequenceRef.current += 1;
    return `${prefix}-${now()}-${idSequenceRef.current}`;
  }
  const replay = useMemo(
    () =>
      selectReplayCandidates({
        scenario: session?.scenario ?? scenario,
        expressions: snapshot.learningExpressions,
        now: now(),
      }),
    [scenario, session?.scenario, snapshot.learningExpressions],
  );

  const reviewCandidates =
    session?.phase === "card_review"
      ? (candidateOverrides ?? createCardCandidates(session))
      : Object.freeze([]);
  const teacherFeedback = session ? latestEnglishCoachFeedback(session) : null;

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    snapshotQueueRef.current.sync(snapshot, onSnapshotChange);
  }, [onSnapshotChange, snapshot]);
  async function commitSnapshot(
    transform: (current: LearningSnapshot) => LearningSnapshot,
  ): Promise<LearningSnapshot | null> {
    try {
      return await snapshotQueueRef.current.enqueue(transform);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "课程草稿暂时无法保存，请重试。");
      return null;
    }
  }
  async function updateSession(
    transform: (current: EnglishLessonSession) => EnglishLessonSession,
  ): Promise<LearningSnapshot | null> {
    return commitSnapshot((current) => {
      const active = activeEnglishLesson(current);
      return active ? replaceEnglishLessonAtFront(current, transform(active)) : current;
    });
  }
  async function pauseCurrentLesson(): Promise<boolean> {
    abortRef.current?.abort();
    if (!activeEnglishLesson(snapshotQueueRef.current.current())) return true;
    const paused = await updateSession((current) => {
      const pendingDraft = candidateOverridesRef.current;
      const withLatestDraft =
        pendingDraft?.sessionId === current.id
          ? updateEnglishReviewDraft(current, pendingDraft.candidates, now())
          : current;
      return withLatestDraft.status === "active"
        ? pauseEnglishLesson(withLatestDraft, now())
        : withLatestDraft;
    });
    return paused !== null;
  }
  async function switchToMarkdown(): Promise<void> {
    const paused = await pauseCurrentLesson();
    if (!paused) {
      setNotice("课程草稿尚未保存，请重试后再切换 Markdown。");
      return;
    }
    onSelectMarkdown();
  }
  async function startLesson(): Promise<void> {
    const trimmed = scenario.trim();
    if (!trimmed) {
      setNotice("先用一句话写下今天想练的生活场景。");
      return;
    }
    if (!snapshot.settings.selectedProviderProfileId) {
      setNotice("尚未配置学习 AI。请在 Learning 的个人资料中选择一个已保存的 AI 服务后再开始。");
      return;
    }
    setPlanning(true);
    setNotice(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const raw = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        signal: abort.signal,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content: buildEnglishLessonPlanPrompt({ scenario: trimmed, replay }),
          }),
          Object.freeze({ role: "user" as const, content: `为这个场景生成课程：${trimmed}` }),
        ]),
      });
      const parsed = parseEnglishLessonPlan(raw);
      const replayIds = assertAuthorizedReplayIds(parsed.selectedReplayExpressionIds, replay);
      const created = createEnglishLessonSession({
        id: nextEventId("english-lesson"),
        scenario: trimmed,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        plan: injectAuthorizedReplayExpressions(parsed.plan, replayIds, replay),
        replayExpressionIds: replayIds,
        now: now(),
      });
      await commitSnapshot((current) => replaceEnglishLessonAtFront(current, created));
      setAnswer("");
    } catch (error) {
      if (abort.signal.aborted) return;
      setNotice(error instanceof Error ? error.message : "课程暂时无法生成，请重试。");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setPlanning(false);
    }
  }

  async function advanceLesson(): Promise<void> {
    if (!session) return;
    const userInput = answer.trim();
    const currentTime = now();
    setNotice(null);
    if (
      session.phase === "lesson_preview" ||
      session.phase === "teach_expression" ||
      session.phase === "lesson_review"
    ) {
      try {
        const staticTurn = createStaticCoachTurn(session);
        void updateSession((current) => applyEnglishCoachTurn(current, staticTurn, currentTime));
        setAnswer("");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "这一步没有生成成功，请重试。");
      }
      return;
    }
    if (
      (session.phase === "guided_recall" ||
        session.phase === "imitation" ||
        session.phase === "roleplay") &&
      !userInput
    ) {
      setNotice("先完成当前任务，再继续下一步。");
      return;
    }
    setWorking(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const userMessage = Object.freeze({
        id: nextEventId("turn-user"),
        role: "user" as const,
        content: userInput,
        createdAt: currentTime,
      });
      const withUserInput = appendEnglishCoachMessage(session, userMessage, currentTime);
      const raw = await collectLearningResponse({
        services,
        providerProfileId: session.providerProfileId,
        signal: abort.signal,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content: buildEnglishCoachPrompt({
              session: withUserInput,
              replay,
              learnerInput: userInput,
            }),
          }),
          Object.freeze({ role: "user" as const, content: userInput }),
        ]),
      });
      const turn = parseEnglishCoachTurn(raw);
      applyEnglishCoachTurn(withUserInput, turn, now());
      const assistantMessage = Object.freeze({
        id: nextEventId("turn-assistant"),
        role: "assistant" as const,
        content: turn.visibleText,
        createdAt: now(),
      });
      if (abort.signal.aborted) return;
      void updateSession((current) => {
        if (current.id !== session.id || current.status !== "active") return current;
        const currentWithUserInput = appendEnglishCoachMessage(current, userMessage, currentTime);
        const currentApplied = applyEnglishCoachTurn(currentWithUserInput, turn, now());
        return appendEnglishCoachMessage(currentApplied, assistantMessage, now());
      });
      setAnswer("");
    } catch (error) {
      if (abort.signal.aborted) return;
      const reason = error instanceof Error ? error.message : "这一步没有生成成功，请重试。";
      void updateSession((current) =>
        current.id === session.id && current.status === "active"
          ? failEnglishLesson(current, reason, now())
          : current,
      );
      setNotice("这一步没有生成成功，请重试。");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setWorking(false);
    }
  }

  function skipExpression(): void {
    if (!session) return;
    try {
      void updateSession((current) => skipCurrentEnglishExpression(current, now()));
      setAnswer("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "当前表达不能跳过。");
    }
  }

  function persistReviewCandidates(next: readonly EnglishLessonCandidate[]): void {
    if (!session) return;
    const frozen = Object.freeze([...next]);
    candidateOverridesRef.current = Object.freeze({ sessionId: session.id, candidates: frozen });
    setCandidateOverrides(frozen);
    void updateSession((current) => updateEnglishReviewDraft(current, frozen, now()));
  }
  function toggleCandidate(localId: string): void {
    persistReviewCandidates(
      reviewCandidates.map((candidate) =>
        candidate.localId === localId
          ? Object.freeze({ ...candidate, selected: !candidate.selected })
          : candidate,
      ),
    );
  }
  function toggleImportant(localId: string): void {
    persistReviewCandidates(
      reviewCandidates.map((candidate) =>
        candidate.localId === localId
          ? Object.freeze({ ...candidate, markedImportant: !candidate.markedImportant })
          : candidate,
      ),
    );
  }
  function beginCandidateEdit(candidate: EnglishLessonCandidate): void {
    setEditingCandidateId(candidate.localId);
    setCandidateEnglish(candidate.english);
    setCandidateTranslation(candidate.translation);
  }
  function saveCandidateDraft(): void {
    const english = candidateEnglish.trim();
    const translation = candidateTranslation.trim();
    if (!english || !translation) {
      setNotice("请输入正确英文和中文含义后再保存候选。 ");
      return;
    }
    const duplicate = reviewCandidates.some(
      (candidate) =>
        candidate.localId !== editingCandidateId &&
        candidate.english.trim().toLocaleLowerCase("en-US") === english.toLocaleLowerCase("en-US"),
    );
    if (duplicate) {
      setNotice("这条正确表达已经在确认列表中。 ");
      return;
    }
    const next = editingCandidateId
      ? reviewCandidates.map((candidate) =>
          candidate.localId === editingCandidateId
            ? Object.freeze({
                ...candidate,
                english,
                translation,
                type: inferExpressionType(english),
              })
            : candidate,
        )
      : [
          ...reviewCandidates,
          Object.freeze({
            localId: nextEventId("manual"),
            english,
            translation,
            type: inferExpressionType(english),
            source: "corrected" as const,
            completed: false,
            selected: true,
            markedImportant: false,
            promptLevel: "full" as const,
          }),
        ];
    if (next.length > 5) {
      setNotice("每节课最多确认保存 5 条正确内容。 ");
      return;
    }
    persistReviewCandidates(next);
    setEditingCandidateId(null);
    setCandidateEnglish("");
    setCandidateTranslation("");
  }

  function finishLessonEarly(): void {
    if (!session || working) return;
    try {
      void updateSession((current) => finishEnglishLessonEarly(current, now()));
      setAnswer("");
      setNotice("已结束当前课程；只有此前完成的正确表达会进入确认页。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "当前步骤不能结束课程。 ");
    }
  }
  async function saveLesson(startPractice = false): Promise<void> {
    if (!session) return;
    const resultRef: { current: ReturnType<typeof saveConfirmedEnglishLesson> | null } = {
      current: null,
    };
    const saved = await commitSnapshot((current) => {
      const currentSession = activeEnglishLesson(current);
      if (!currentSession) return current;
      resultRef.current = saveConfirmedEnglishLesson({
        snapshot: current,
        session: currentSession,
        candidates: createCardCandidates(currentSession),
        now: now(),
      });
      return startPractice && resultRef.current.resourceId
        ? createEnglishPracticeNavigationSnapshot(
            resultRef.current.snapshot,
            resultRef.current.resourceId,
          )
        : resultRef.current.snapshot;
    });
    if (!saved || !resultRef.current) {
      const reason = "保存失败，请重新保存。";
      void updateSession((current) =>
        current.id === session.id
          ? failEnglishLesson(current, reason, now(), "save_failed")
          : current,
      );
      setNotice("保存失败。你的选择仍保留，可以重新保存。");
      return;
    }
    const savedResult = resultRef.current;
    candidateOverridesRef.current = null;
    setCandidateOverrides(null);
    setEditingCandidateId(null);
    setCandidateEnglish("");
    setCandidateTranslation("");
    setAnswer("");
    setScenario("");
    if (startPractice && savedResult.resourceId && saved.ui.section === "practice") {
      onOpenPractice();
      return;
    }
    setNotice(
      savedResult.card
        ? "已保存到 Learning。你可以在资料库和词汇复习中继续练习。"
        : "本节未保存任何内容，临时对话已清理。",
    );
  }

  function retrySession(): void {
    if (!session) return;
    void updateSession((current) => resumeEnglishLesson(current, now()));
    setNotice(null);
  }

  function discardSession(): void {
    if (!session) return;
    abortRef.current?.abort();
    void commitSnapshot((current) => discardEnglishLesson(current, session.id));
    candidateOverridesRef.current = null;
    setCandidateOverrides(null);
    setNotice("已丢弃未完成课程及临时对话。");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={86}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerSlot} />
        <View accessibilityRole="tablist" style={styles.modeSwitch}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            onPress={() => void switchToMarkdown()}
            style={styles.modeOption}
          >
            <Text style={styles.modeText}>Markdown</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.modeOption, styles.modeOptionActive]}
          >
            <Text style={[styles.modeText, styles.modeTextActive]}>英语陪练</Text>
          </Pressable>
        </View>
        <View style={styles.headerSlot} />
      </View>

      {notice ? (
        <Pressable accessibilityRole="button" onPress={() => setNotice(null)} style={styles.notice}>
          <CircleAlert color={theme.colors.warning} size={18} />
          <Text style={styles.noticeText}>{notice}</Text>
          <X color={theme.colors.mutedText} size={16} />
        </Pressable>
      ) : null}

      {!session ? (
        <ScrollView contentContainerStyle={styles.startContent} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.pageTitle}>
            今天练什么？
          </Text>
          <Text style={styles.pageCopy}>
            写下一个你今天可能遇到的生活场景。每次只学 2–3 个可立即开口的表达。
          </Text>
          <TextInput
            accessibilityLabel="英语课程场景"
            value={scenario}
            onChangeText={setScenario}
            placeholder="例如：在咖啡店点一杯拿铁"
            placeholderTextColor={theme.colors.mutedText}
            multiline
            textAlignVertical="top"
            style={styles.scenarioInput}
          />
          <Pressable
            accessibilityRole="button"
            disabled={planning}
            onPress={() => void startLesson()}
            style={[styles.primaryButton, planning && styles.buttonDisabled]}
          >
            {planning ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <Sparkles color={theme.colors.text} size={18} />
            )}
            <Text style={styles.primaryButtonText}>{planning ? "正在准备课程" : "开始课程"}</Text>
          </Pressable>
          <View style={styles.listSection}>
            <Text style={styles.sectionLabel}>可从这些场景开始</Text>
            {[
              "在咖啡店点一杯拿铁",
              "向酒店前台办理入住",
              "在商店询问商品位置",
              "和新同事做简单自我介绍",
            ].map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                onPress={() => setScenario(item)}
                style={styles.recommendationRow}
              >
                <Text style={styles.recommendationText}>{item}</Text>
                <ChevronRight color={theme.colors.mutedText} size={18} />
              </Pressable>
            ))}
          </View>
          {replay.length > 0 ? (
            <Text style={styles.privacyCopy}>
              本节最多会自然复现 {replay.length} 条已确认保存的旧表达。
            </Text>
          ) : null}
        </ScrollView>
      ) : session.status !== "active" ? (
        <View style={styles.recoveryContent}>
          <Text accessibilityRole="header" style={styles.pageTitle}>
            {session.status === "paused" ? "继续上次课程？" : "这一步需要重试"}
          </Text>
          <Text style={styles.pageCopy}>
            {session.recoverableError ?? "未完成课程已暂存，只会恢复当前阶段和必要的临时对话。"}
          </Text>
          <Pressable accessibilityRole="button" onPress={retrySession} style={styles.primaryButton}>
            <Play color={theme.colors.text} size={18} />
            <Text style={styles.primaryButtonText}>
              {session.status === "paused" ? "继续课程" : "重新尝试"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={discardSession}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>丢弃本节课程</Text>
          </Pressable>
        </View>
      ) : session.phase === "card_review" ? (
        <ScrollView contentContainerStyle={styles.cardContent}>
          <Text accessibilityRole="header" style={styles.pageTitle}>
            保存正确内容
          </Text>
          <Text style={styles.pageCopy}>
            只会保存你确认的正确表达；不会保存错误原句或完整聊天。
          </Text>
          <View style={styles.candidateList}>
            {reviewCandidates.map((candidate) => (
              <Pressable
                key={candidate.localId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: candidate.selected }}
                onPress={() => toggleCandidate(candidate.localId)}
                style={styles.candidateRow}
              >
                <View style={[styles.checkbox, candidate.selected && styles.checkboxChecked]}>
                  {candidate.selected ? <Check color={theme.colors.text} size={14} /> : null}
                </View>
                <View style={styles.candidateBody}>
                  <Text style={styles.candidateEnglish}>{candidate.english}</Text>
                  <Text style={styles.candidateTranslation}>{candidate.translation}</Text>
                  <Text style={styles.candidateMeta}>
                    {sourceLabel(candidate.source)} ·{" "}
                    {candidate.completed ? "本次已完成" : "待练习"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`编辑 ${candidate.english}`}
                  onPress={() => beginCandidateEdit(candidate)}
                  hitSlop={8}
                  style={styles.importantButton}
                >
                  <Text style={styles.importantText}>编辑</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`标记 ${candidate.english} 为重点`}
                  onPress={() => toggleImportant(candidate.localId)}
                  hitSlop={8}
                  style={styles.importantButton}
                >
                  <Text
                    style={[
                      styles.importantText,
                      candidate.markedImportant && styles.importantTextActive,
                    ]}
                  >
                    {candidate.markedImportant ? "重点" : "标重点"}
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
          <View style={styles.candidateEditor}>
            <Text style={styles.candidateEditorTitle}>
              {editingCandidateId ? "修改正确内容" : "补选正确内容"}
            </Text>
            <TextInput
              accessibilityLabel="正确英文"
              value={candidateEnglish}
              onChangeText={setCandidateEnglish}
              placeholder="正确英文"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.candidateEditorInput}
            />
            <TextInput
              accessibilityLabel="中文含义"
              value={candidateTranslation}
              onChangeText={setCandidateTranslation}
              placeholder="中文含义"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.candidateEditorInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={saveCandidateDraft}
              style={styles.addCandidateButton}
            >
              <Text style={styles.addCandidateButtonText}>
                {editingCandidateId ? "保存修改" : "补选到本节"}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void saveLesson(
                reviewCandidates.some(
                  (candidate) => candidate.selected && candidate.type === "sentence",
                ),
              )
            }
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {reviewCandidates.some(
                (candidate) => candidate.selected && candidate.type === "sentence",
              )
                ? "保存并开始逐句练习"
                : reviewCandidates.some((candidate) => candidate.selected)
                  ? `保存 ${reviewCandidates.filter((candidate) => candidate.selected).length} 条内容`
                  : "结束课程，不保存内容"}
            </Text>
          </Pressable>
          <Text style={styles.privacyCopy}>
            确认后，临时对话会被删除，只保留课程卡片、表达和练习证据。
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.lessonShell}>
          <View style={styles.lessonTopLine}>
            <Text style={styles.phaseLabel}>
              {session.phase === "lesson_preview"
                ? "课程预告"
                : session.phase === "roleplay"
                  ? `情景对话 · ${session.roleplayTurnsCompleted + 1}/${session.plan.roleplayTurns}`
                  : "当前步骤"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="暂停课程"
              disabled={working}
              onPress={() => void pauseCurrentLesson()}
              style={styles.pauseButton}
            >
              <Pause color={theme.colors.mutedText} size={17} />
              <Text style={styles.pauseText}>暂停</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.lessonContent}
            keyboardShouldPersistTaps="handled"
          >
            {session.phase === "lesson_preview" ? (
              <>
                <Text accessibilityRole="header" style={styles.pageTitle}>
                  {session.scenario}
                </Text>
                <Text style={styles.goalText}>{session.plan.goal}</Text>
                <Text style={styles.previewMeta}>
                  约 {session.plan.estimatedMinutes} 分钟 · {session.plan.expressions.length}{" "}
                  个核心表达
                </Text>
                <View style={styles.previewList}>
                  {session.plan.expressions.map((expression, index) => (
                    <Text key={expression.id} style={styles.previewItem}>
                      {index + 1}. {expression.english}
                    </Text>
                  ))}
                </View>
              </>
            ) : session.phase === "teach_expression" ? (
              (() => {
                const expression = currentLessonExpression(session);
                return expression ? (
                  <>
                    <Text style={styles.stepLabel}>当前核心表达</Text>
                    <Text accessibilityRole="header" style={styles.coreEnglish}>
                      {expression.english}
                    </Text>
                    <Text style={styles.translation}>{expression.translation}</Text>
                    {expression.hint ? (
                      <Text style={styles.explanation}>{expression.hint}</Text>
                    ) : null}
                    <Text style={styles.taskText}>
                      先在现实中大声读一遍。完成后告诉 Mira 你已跟读；应用不会判断发音。
                    </Text>
                  </>
                ) : null;
              })()
            ) : session.phase === "guided_recall" ||
              session.phase === "imitation" ||
              session.phase === "roleplay" ? (
              <>
                <Text style={styles.stepLabel}>
                  {session.phase === "roleplay" ? "Mira 的角色一句话" : "现在轮到你"}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={session.phase === "roleplay" ? styles.roleplayLine : styles.taskHeadline}
                >
                  {session.phase === "roleplay"
                    ? session.roleplayTurnsCompleted === 0
                      ? createStaticCoachTurn(session).visibleText
                      : (teacherFeedback?.content ?? createStaticCoachTurn(session).visibleText)
                    : taskForPhase(session)}
                </Text>
                {teacherFeedback && session.phase !== "roleplay" ? (
                  <Text style={styles.teacherFeedback}>{teacherFeedback.content}</Text>
                ) : null}
                <Text style={styles.taskText}>
                  {session.phase === "guided_recall"
                    ? "如果一时想不起来，可以选择暂时跳过；它会进入待练习。"
                    : "这一步只需要完成当前任务，不会提前进入下一阶段。"}
                </Text>
                <TextInput
                  accessibilityLabel="英语回答"
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder={
                    session.phase === "guided_recall" ? "输入你记得的英文" : "输入你的英语回复"
                  }
                  placeholderTextColor={theme.colors.mutedText}
                  multiline
                  textAlignVertical="top"
                  style={styles.answerInput}
                />
              </>
            ) : session.phase === "lesson_review" ? (
              <>
                <Text accessibilityRole="header" style={styles.pageTitle}>
                  本节到这里
                </Text>
                <Text style={styles.pageCopy}>
                  你已经完成 {session.completedExpressionIds.length} 个表达和{" "}
                  {session.roleplayTurnsCompleted} 轮对话。下一步只确认你真正想留下的正确内容。
                </Text>
              </>
            ) : null}
          </ScrollView>
          <View style={styles.bottomActions}>
            {session.phase === "guided_recall" || session.phase === "imitation" ? (
              <Pressable
                accessibilityRole="button"
                disabled={working}
                onPress={skipExpression}
                style={[styles.skipButton, working && styles.buttonDisabled]}
              >
                <Text style={styles.skipButtonText}>暂时跳过</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={working}
              onPress={finishLessonEarly}
              style={[styles.skipButton, working && styles.buttonDisabled]}
            >
              <Text style={styles.skipButtonText}>结束课程</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={working}
              onPress={() => void advanceLesson()}
              style={[styles.primaryButton, working && styles.buttonDisabled, styles.bottomPrimary]}
            >
              {working ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryLabel(session)}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      minHeight: 64,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    headerSlot: { width: 58 },
    headerMenu: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    modeSwitch: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    modeOption: { minHeight: 32, paddingHorizontal: 11, justifyContent: "center", borderRadius: 9 },
    modeOptionActive: { backgroundColor: "#132B49" },
    modeText: { fontSize: 14, color: theme.colors.mutedText, fontWeight: "600" },
    modeTextActive: { color: theme.colors.accent },
    notice: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noticeText: { flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 },
    startContent: { padding: 24, paddingBottom: 40 },
    recoveryContent: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
    pageTitle: {
      color: theme.colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "700",
      letterSpacing: -0.4,
    },
    pageCopy: { marginTop: 12, color: theme.colors.mutedText, fontSize: 16, lineHeight: 23 },
    scenarioInput: {
      marginTop: 24,
      minHeight: 112,
      color: theme.colors.text,
      borderColor: theme.colors.divider,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      lineHeight: 23,
      backgroundColor: theme.colors.surface,
    },
    primaryButton: {
      marginTop: 16,
      minHeight: 48,
      borderRadius: 11,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
    },
    primaryButtonText: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    buttonDisabled: { opacity: 0.6 },
    secondaryButton: {
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
      borderColor: theme.colors.divider,
      borderWidth: 1,
      borderRadius: 11,
    },
    secondaryButtonText: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    listSection: { marginTop: 32 },
    sectionLabel: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.25,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    recommendationRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    recommendationText: { color: theme.colors.text, fontSize: 16, flex: 1, paddingRight: 12 },
    privacyCopy: { marginTop: 18, color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    lessonShell: { flex: 1 },
    lessonTopLine: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    phaseLabel: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "700" },
    pauseButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 },
    pauseText: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "600" },
    lessonContent: { padding: 24, paddingBottom: 32, flexGrow: 1 },
    stepLabel: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "700", marginBottom: 16 },
    coreEnglish: {
      color: theme.colors.text,
      fontSize: 30,
      lineHeight: 37,
      letterSpacing: -0.35,
      fontWeight: "800",
    },
    translation: { color: theme.colors.text, fontSize: 17, lineHeight: 25, marginTop: 16 },
    explanation: { color: theme.colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 8 },
    taskText: { color: theme.colors.mutedText, fontSize: 15, lineHeight: 23, marginTop: 28 },
    taskHeadline: {
      color: theme.colors.text,
      fontSize: 25,
      lineHeight: 33,
      letterSpacing: -0.25,
      fontWeight: "700",
    },
    roleplayLine: { color: theme.colors.text, fontSize: 23, lineHeight: 31, fontWeight: "700" },
    answerInput: {
      marginTop: 24,
      minHeight: 118,
      color: theme.colors.text,
      borderColor: theme.colors.divider,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      lineHeight: 23,
      backgroundColor: theme.colors.surface,
    },
    bottomActions: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      flexDirection: "row",
      gap: 10,
    },
    skipButton: {
      minHeight: 48,
      paddingHorizontal: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    skipButtonText: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "600" },
    bottomPrimary: { flex: 1, marginTop: 0 },
    goalText: { marginTop: 14, color: theme.colors.text, fontSize: 18, lineHeight: 26 },
    previewMeta: { marginTop: 8, color: theme.colors.mutedText, fontSize: 13 },
    previewList: { marginTop: 32, gap: 14 },
    previewItem: { color: theme.colors.text, fontSize: 17, lineHeight: 24 },
    cardContent: { padding: 24, paddingBottom: 40 },
    candidateList: {
      marginTop: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    candidateRow: {
      minHeight: 86,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      paddingVertical: 12,
      gap: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.mutedText,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    candidateBody: { flex: 1 },
    candidateEnglish: { color: theme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
    candidateTranslation: {
      marginTop: 2,
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
    },
    candidateMeta: { marginTop: 4, color: theme.colors.mutedText, fontSize: 11 },
    importantButton: { paddingVertical: 8, paddingLeft: 4 },
    importantText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    importantTextActive: { color: theme.colors.accent },
    candidateEditor: { marginTop: 20, gap: 8 },
    candidateEditorTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    candidateEditorInput: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      paddingHorizontal: 12,
      color: theme.colors.text,
      fontSize: 15,
      backgroundColor: theme.colors.surface,
    },
    addCandidateButton: {
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.divider,
    },
    addCandidateButtonText: { color: theme.colors.accent, fontSize: 14, fontWeight: "700" },
    teacherFeedback: {
      marginTop: 18,
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 24,
      padding: 12,
      borderLeftWidth: 2,
      borderLeftColor: theme.colors.accent,
      backgroundColor: theme.colors.surface,
    },
  });
}
