import * as Crypto from "expo-crypto";
import {
  Bot,
  Clock3,
  Globe2,
  Inbox,
  MoreHorizontal,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { aiProviderCapabilities, type AiProviderProfile } from "../ai/provider-profile";
import type { AiConversationId, AiConversationMessage } from "../ai/conversation";
import type { AiProposal } from "../ai/proposal";
import { createAiWorkspaceToolRuntime } from "../ai/workspace-tool-runtime";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import type { AppServices } from "./app-services";
import { describeAiSendFailure } from "./ai-error-message";
import { AiContextSheet } from "./ai-context-sheet";
import { AiAutomationSheet } from "./ai-automation-sheet";
import { AiProviderSheet } from "./ai-provider-sheet";
import { AiProposalSheet } from "./ai-proposal-sheet";
import { AiProposalInbox } from "./ai-proposal-inbox";
import { EnglishCoachScreen } from "./english-coach-screen";
import { createExpoLearningStore } from "../learning/expo-learning-store";
import type { LearningSnapshot } from "../learning/learning-types";
import { useTheme, type Theme } from "./theme";
import { useUiSound } from "./ui-sound-context";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";

type DisplayMessage = AiConversationMessage & Readonly<{ localError?: boolean }>;
type Citation = Readonly<{ url: string; title: string | null }>;
type ToolSummary = Readonly<{ id: string; name: string; ok: boolean; detail: string }>;

function summarizeToolResult(name: string, content: string): string {
  try {
    const value = JSON.parse(content) as unknown;
    if (!value || typeof value !== "object") return "Completed";
    const record = value as Record<string, unknown>;
    if (name === "search_workspace" && Array.isArray(record.results)) {
      return record.results
        .slice(0, 3)
        .map((item) => {
          const result = item as Record<string, unknown>;
          return `${String(result.path ?? "note")}: ${String(result.excerpt ?? "").slice(0, 90)}`;
        })
        .join(" · ");
    }
    if (typeof record.path === "string") return record.path;
    if (typeof record.error === "string") return record.error;
    if (typeof record.proposalId === "string") return "Created a review proposal";
  } catch {
    // Tool content is untrusted and optional display metadata.
  }
  return "Completed";
}

function inlineMarkdown(source: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  return source.split(/(`[^`]+`|\*\*[^*]+\*\*)/gu).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={index} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={index} style={styles.strong}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}

function AiMessageContent({
  content,
  styles,
}: Readonly<{ content: string; styles: ReturnType<typeof createStyles> }>) {
  const blocks: ReactNode[] = [];
  const lines = content.split("\n");
  let code: string[] | null = null;
  for (const [index, lineValue] of lines.entries()) {
    const line = lineValue ?? "";
    if (line.trimStart().startsWith("```")) {
      if (code === null) code = [];
      else {
        blocks.push(
          <Text key={`code-${index}`} selectable style={styles.codeBlock}>
            {code.join("\n")}
          </Text>,
        );
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/u.exec(line);
    if (!line.trim()) {
      blocks.push(<View key={`space-${index}`} style={styles.messageSpace} />);
    } else if (heading) {
      blocks.push(
        <Text key={index} style={styles.messageHeading}>
          {inlineMarkdown(heading[2] ?? "", styles)}
        </Text>,
      );
    } else if (bullet) {
      blocks.push(
        <View key={index} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text selectable style={styles.messageText}>
            {inlineMarkdown(bullet[1] ?? "", styles)}
          </Text>
        </View>,
      );
    } else {
      blocks.push(
        <Text key={index} selectable style={styles.messageText}>
          {inlineMarkdown(line, styles)}
        </Text>,
      );
    }
  }
  if (code !== null)
    blocks.push(
      <Text key="code-tail" selectable style={styles.codeBlock}>
        {code.join("\n")}
      </Text>,
    );
  return <View style={styles.messageContent}>{blocks}</View>;
}

export function AiWorkspaceScreen({
  services,
  controller,
  onOpenLearningPractice,
  onOpenSidebar,
}: Readonly<{
  services: AppServices;
  controller: EditorWorkspaceController;
  onOpenLearningPractice: () => void;
  onOpenSidebar: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const uiSound = useUiSound();
  const [profiles, setProfiles] = useState<readonly AiProviderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<AiConversationId | null>(null);
  const [messages, setMessages] = useState<readonly DisplayMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [providerSheetVisible, setProviderSheetVisible] = useState(false);
  const [contextSheetVisible, setContextSheetVisible] = useState(false);
  const [automationSheetVisible, setAutomationSheetVisible] = useState(false);
  const [providerRevision, setProviderRevision] = useState(0);
  const [allowWholeWorkspace, setAllowWholeWorkspace] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [citations, setCitations] = useState<readonly Citation[]>([]);
  const [toolSummaries, setToolSummaries] = useState<readonly ToolSummary[]>(Object.freeze([]));
  const [selectedPaths, setSelectedPaths] = useState<readonly string[]>(Object.freeze([]));
  const [proposals, setProposals] = useState<readonly AiProposal[]>(Object.freeze([]));
  const [reviewingProposal, setReviewingProposal] = useState<AiProposal | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [inboxVisible, setInboxVisible] = useState(false);
  const [mode, setMode] = useState<"markdown" | "english">("markdown");
  const learningStore = useMemo(() => createExpoLearningStore(), []);
  const [learningSnapshot, setLearningSnapshot] = useState<LearningSnapshot | null>(null);
  const [learningLoadError, setLearningLoadError] = useState<string | null>(null);
  const [learningLoadRevision, setLearningLoadRevision] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await learningStore.initialize();
        const loaded = await learningStore.load();
        if (active) {
          setLearningSnapshot(loaded);
          setLearningLoadError(null);
        }
      } catch (error) {
        if (active) {
          setLearningSnapshot(null);
          setLearningLoadError(
            error instanceof Error ? error.message : "Learning 数据暂时无法打开。",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [learningLoadRevision, learningStore]);
  async function updateLearningSnapshot(next: LearningSnapshot): Promise<void> {
    await learningStore.save(next);
    setLearningSnapshot(next);
  }
  function selectEnglishMode(): void {
    abortRef.current?.abort();
    setMode("english");
  }
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null,
    [activeProfileId, profiles],
  );
  const canSearch = activeProfile
    ? aiProviderCapabilities(activeProfile.adapter).nativeWebSearch
    : false;
  // Derived instead of synchronized: a profile without native web search must
  // never send the flag, and switching profiles should not need an effect.
  const webSearchEnabled = canSearch && webSearch;
  const activeDocument = controller.state?.activeDocument ?? null;

  useEffect(() => {
    let active = true;
    void Promise.all([services.aiProviderProfiles.list(), services.settingsStore.load()])
      .then(async ([summaries, settings]) => {
        if (!active) return;
        const nextProfiles = Object.freeze(summaries.map((item) => item.profile));
        setProfiles(nextProfiles);
        const configured = settings.ok ? settings.value.ai.activeProviderProfileId : null;
        setActiveProfileId(
          nextProfiles.some((profile) => profile.id === configured)
            ? configured
            : (nextProfiles[0]?.id ?? null),
        );
        setAllowWholeWorkspace(settings.ok && settings.value.ai.allowWholeWorkspaceSearch);
        const [conversations, storedProposals] = await Promise.all([
          services.aiStore.listConversations(services.activeWorkspace.grant.workspaceId),
          services.aiStore.listProposals(services.activeWorkspace.grant.workspaceId),
        ]);
        if (active) setProposals(storedProposals);
        if (!active || conversations.length === 0) return;
        const latest = conversations[0];
        if (!latest) return;
        setConversationId(latest.id);
        setMessages(await services.aiStore.listMessages(latest.id));
      })
      .catch(() => {
        // The empty state remains actionable through provider settings.
      });
    return () => {
      active = false;
    };
  }, [providerRevision, services]);

  async function selectProfile(profile: AiProviderProfile): Promise<void> {
    setActiveProfileId(profile.id);
    await services.settingsStore.update((current) => ({
      ...current,
      ai: Object.freeze({ ...current.ai, activeProviderProfileId: profile.id }),
    }));
  }

  function toggleSelectedPath(path: string): void {
    setSelectedPaths((current) =>
      current.includes(path)
        ? Object.freeze(current.filter((item) => item !== path))
        : Object.freeze([...current, path]),
    );
  }

  async function setWholeWorkspacePermission(allowed: boolean): Promise<void> {
    setAllowWholeWorkspace(allowed);
    await services.settingsStore.update((current) => ({
      ...current,
      ai: Object.freeze({ ...current.ai, allowWholeWorkspaceSearch: allowed }),
    }));
  }

  async function rejectProposal(proposal: AiProposal): Promise<void> {
    setProposalBusy(true);
    try {
      await services.aiStore.setProposalState(proposal.id, "rejected", new Date().toISOString());
      setProposals((current) =>
        Object.freeze(
          current.map((item) =>
            item.id === proposal.id ? Object.freeze({ ...item, state: "rejected" as const }) : item,
          ),
        ),
      );
      setReviewingProposal(null);
    } finally {
      setProposalBusy(false);
    }
  }

  async function applyProposal(proposal: AiProposal, candidate: string): Promise<void> {
    setProposalBusy(true);
    let nextState: AiProposal["state"] = "apply_failed";
    try {
      const current = await controller.captureAiSnapshot();
      const expectedRevision = proposal.baseRevision?.startsWith("editor:")
        ? Number(proposal.baseRevision.split(":").at(-1))
        : current.revision;
      if (
        current.path !== proposal.targetPath ||
        current.markdown !== proposal.baseContent ||
        !Number.isSafeInteger(expectedRevision)
      ) {
        nextState = "stale";
      } else {
        const result = await controller.applyAiReplacement({
          documentId: current.documentId,
          path: current.path,
          expectedRevision,
          expectedMarkdown: proposal.baseContent,
          markdown: candidate,
        });
        nextState =
          result === "applied" ? "applied" : result === "stale" ? "stale" : "apply_failed";
      }
    } catch {
      nextState = "apply_failed";
    }
    await services.aiStore.setProposalState(proposal.id, nextState, new Date().toISOString());
    setProposals((current) =>
      Object.freeze(
        current.map((item) =>
          item.id === proposal.id ? Object.freeze({ ...item, state: nextState }) : item,
        ),
      ),
    );
    setReviewingProposal(null);
    setProposalBusy(false);
  }

  function updateAssistant(messageId: string, text: string, completed = false): void {
    setMessages((current) => {
      const existing = current.find((message) => message.id === messageId);
      if (existing) {
        return Object.freeze(
          current.map((message) =>
            message.id === messageId
              ? Object.freeze({
                  ...message,
                  content: completed ? text : `${message.content}${text}`,
                  status: completed ? "completed" : "incomplete",
                })
              : message,
          ),
        );
      }
      return Object.freeze([
        ...current,
        Object.freeze({
          id: messageId as AiConversationMessage["id"],
          conversationId:
            conversationId ?? ("00000000-0000-4000-8000-000000000000" as AiConversationId),
          role: "assistant" as const,
          content: text,
          status: completed ? ("completed" as const) : ("incomplete" as const),
          createdAt: new Date().toISOString(),
        }),
      ]);
    });
  }

  async function send(): Promise<void> {
    const text = prompt.trim();
    if (!text || sending || activeProfile === null) return;
    uiSound.play("send");
    // Keep the user input available for retry if capture/provider setup fails.
    setPrompt("");
    setSending(true);
    setCitations(Object.freeze([]));
    setToolSummaries(Object.freeze([]));
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const document = await controller.captureAiSnapshot();
      const selectedReads = await Promise.all(
        selectedPaths
          .filter((path) => path !== document.path)
          .map(async (path) => ({ path, result: await services.repository.read(path) })),
      );
      const unavailable = selectedReads.find((item) => !item.result.ok);
      if (unavailable) throw new Error(`Could not read selected note: ${unavailable.path}`);
      const selectedContext = selectedReads.flatMap((item) =>
        item.result.ok
          ? [Object.freeze({ label: item.result.value.path, content: item.result.value.markdown })]
          : [],
      );
      const tools = createAiWorkspaceToolRuntime({
        repository: services.repository,
        search: services.workspaceSearch,
        allowWholeWorkspaceSearch: allowWholeWorkspace,
        authorizedPaths: Object.freeze([document.path, ...selectedPaths]),
        createId: Crypto.randomUUID,
        writableNotes: Object.freeze([
          Object.freeze({
            path: document.path,
            baseRevision: `editor:${document.documentId}:${document.revision}`,
            baseHash: document.baseHash,
            baseContent: document.markdown,
          }),
        ]),
        createReplaceProposal: async (candidate) => {
          const now = new Date().toISOString();
          const proposal = Object.freeze({
            id: Crypto.randomUUID() as AiProposal["id"],
            workspaceId: services.activeWorkspace.grant.workspaceId,
            conversationId,
            operation: "replace" as const,
            targetPath: candidate.path,
            baseRevision: candidate.baseRevision,
            baseHash: candidate.baseHash,
            baseContent: candidate.baseContent,
            proposedContent: candidate.content,
            state: "pending" as const,
            explanation: candidate.explanation,
            createdAt: now,
            updatedAt: now,
          });
          await services.aiStore.upsertProposal(proposal);
          setProposals((current) => Object.freeze([proposal, ...current]));
          return proposal.id;
        },
      });
      for await (const event of services.aiConversations.stream({
        workspaceId: services.activeWorkspace.grant.workspaceId,
        providerProfileId: activeProfile.id,
        ...(conversationId ? { conversationId } : {}),
        prompt: text,
        context: Object.freeze([
          Object.freeze({
            label: document.path,
            content: document.markdown,
            unsaved: document.dirty,
          }),
          ...selectedContext,
        ]),
        tools,
        ...(webSearchEnabled ? { nativeWebSearch: true } : {}),
        signal: abort.signal,
      })) {
        if (event.type === "started") {
          setConversationId(event.conversation.id);
          setMessages((current) => Object.freeze([...current, event.userMessage]));
        } else if (event.type === "assistant-delta") {
          updateAssistant(event.messageId, event.text);
        } else if (event.type === "finished") {
          updateAssistant(event.message.id, event.message.content, true);
          uiSound.play("complete");
        } else if (event.type === "tool-result") {
          setToolSummaries((current) =>
            Object.freeze([
              ...current,
              Object.freeze({
                id: Crypto.randomUUID(),
                name: event.name,
                ok: event.ok,
                detail: summarizeToolResult(event.name, event.content),
              }),
            ]),
          );
        } else if (event.type === "provider" && event.event.type === "citation") {
          const citation = event.event;
          setCitations((current) =>
            Object.freeze([
              ...current,
              Object.freeze({ url: citation.url, title: citation.title }),
            ]),
          );
        }
      }
    } catch (error) {
      // Stopping a response is a user action, not a failure.
      if (abort.signal.aborted) return;
      uiSound.play("error");
      const message = describeAiSendFailure(error);
      const now = new Date().toISOString();
      setPrompt(text);
      setMessages((current) =>
        Object.freeze([
          ...current,
          Object.freeze({
            id: Crypto.randomUUID() as AiConversationMessage["id"],
            conversationId:
              conversationId ?? ("00000000-0000-4000-8000-000000000000" as AiConversationId),
            role: "assistant" as const,
            content: message,
            status: "incomplete" as const,
            createdAt: now,
            localError: true,
          }),
        ]),
      );
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  if (mode === "english") {
    if (!learningSnapshot) {
      return (
        <View style={styles.screen}>
          <View style={styles.modeHeader}>
            <View style={styles.modeHeaderSlot} />
            <View style={styles.modeSwitch}>
              <Pressable
                accessibilityRole="tab"
                onPress={() => setMode("markdown")}
                style={styles.modeOption}
              >
                <Text style={styles.modeText}>Markdown</Text>
              </Pressable>
              <View style={[styles.modeOption, styles.modeOptionActive]}>
                <Text style={[styles.modeText, styles.modeTextActive]}>英语陪练</Text>
              </View>
            </View>
            <View style={styles.modeHeaderSlot} />
          </View>
          <View style={styles.loadingMode}>
            {learningLoadError ? (
              <>
                <Text style={styles.loadingModeText}>Learning 数据暂时无法打开</Text>
                <Text style={styles.loadingModeDetail}>{learningLoadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLearningLoadRevision((value) => value + 1)}
                  style={styles.loadingModeRetry}
                >
                  <Text style={styles.loadingModeRetryText}>重新尝试</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.loadingModeText}>正在准备 Learning 数据</Text>
              </>
            )}
          </View>
        </View>
      );
    }
    return (
      <EnglishCoachScreen
        services={services}
        snapshot={learningSnapshot}
        onSnapshotChange={updateLearningSnapshot}
        onSelectMarkdown={() => setMode("markdown")}
        onOpenPractice={onOpenLearningPractice}
        onOpenSidebar={onOpenSidebar}
      />
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={86}
      style={styles.screen}
    >
      <View style={styles.modeHeader}>
        <View style={styles.modeHeaderSlot}>
          <Pressable
            accessibilityLabel="打开全局侧边栏"
            accessibilityRole="button"
            onPress={onOpenSidebar}
            style={styles.iconAction}
          >
            <SidebarToggleIcon color={theme.colors.text} expanded={false} size={23} />
          </Pressable>
        </View>
        <View accessibilityRole="tablist" style={styles.modeSwitch}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.modeOption, styles.modeOptionActive]}
          >
            <Text style={[styles.modeText, styles.modeTextActive]}>Markdown</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            onPress={selectEnglishMode}
            style={styles.modeOption}
          >
            <Text style={styles.modeText}>英语陪练</Text>
          </Pressable>
        </View>
        <View style={styles.modeHeaderSlot} />
      </View>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={styles.spark}>
            <Bot color={theme.colors.accent} size={19} />
          </View>
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              Mira 智能助手
            </Text>
            <Pressable
              accessibilityLabel="选择 AI 服务"
              disabled={profiles.length < 2}
              onPress={() => {
                if (profiles.length < 2) return;
                const index = activeProfile ? profiles.indexOf(activeProfile) : -1;
                const next = profiles[(index + 1) % profiles.length];
                if (next) void selectProfile(next);
              }}
            >
              <Text style={styles.providerStatus}>
                <Text
                  style={{
                    color:
                      activeProfile?.connectionStatus === "connected"
                        ? theme.colors.success
                        : theme.colors.warning,
                  }}
                >
                  ●
                </Text>{" "}
                {activeProfile ? `${activeProfile.name} · ${activeProfile.model}` : "尚未连接服务"}
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="AI 自动任务"
            onPress={() => setAutomationSheetVisible(true)}
            style={styles.iconAction}
          >
            <Clock3 color={theme.colors.mutedText} size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel="AI 修改建议"
            onPress={() => setInboxVisible(true)}
            style={styles.iconAction}
          >
            <Inbox color={theme.colors.mutedText} size={20} />
            {proposals.some((proposal) => proposal.state === "pending") ? (
              <View style={styles.badge} />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="AI 服务设置"
            onPress={() => setProviderSheetVisible(true)}
            style={styles.iconAction}
          >
            <MoreHorizontal color={theme.colors.text} size={22} />
          </Pressable>
        </View>
      </View>

      <View style={styles.contextCard}>
        <View style={styles.contextHeader}>
          <Text style={styles.contextLabel}>笔记上下文</Text>
          <Pressable onPress={() => setContextSheetVisible(true)}>
            <Text style={styles.permissionText}>
              整个工作区 · {allowWholeWorkspace ? "已允许" : "未开启"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.contextRow}>
          <View style={styles.contextChip}>
            <Text numberOfLines={1} style={styles.contextChipText}>
              {activeDocument?.path ?? "No note open"}
              {activeDocument?.dirty ? " · unsaved" : ""}
            </Text>
          </View>
          {selectedPaths.slice(0, 2).map((path) => (
            <Pressable
              accessibilityLabel={`Remove ${path} from context`}
              key={path}
              onPress={() => toggleSelectedPath(path)}
              style={styles.contextChipSecondary}
            >
              <Text numberOfLines={1} style={styles.contextChipSecondaryText}>
                {path}
              </Text>
              <X color={theme.colors.mutedText} size={12} />
            </Pressable>
          ))}
          {selectedPaths.length > 2 ? (
            <Text style={styles.moreContext}>+{selectedPaths.length - 2}</Text>
          ) : null}
          <Pressable
            accessibilityLabel="添加笔记上下文"
            onPress={() => setContextSheetVisible(true)}
            style={styles.addContext}
          >
            <Plus color={theme.colors.accent} size={16} />
            <Text style={styles.addContextText}>Add</Text>
          </Pressable>
          {canSearch ? (
            <Pressable
              accessibilityLabel="Use provider web search"
              accessibilityRole="switch"
              accessibilityState={{ checked: webSearchEnabled }}
              onPress={() => setWebSearch((current) => !current)}
              style={[styles.webToggle, webSearchEnabled && styles.webToggleActive]}
            >
              <Globe2
                color={webSearchEnabled ? theme.colors.accent : theme.colors.mutedText}
                size={15}
              />
              <Text style={[styles.webToggleText, webSearchEnabled && styles.webToggleTextActive]}>
                Web
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {activeProfile === null ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Bot color={theme.colors.accent} size={28} />
          </View>
          <Text style={styles.emptyTitle}>Connect your model</Text>
          <Pressable onPress={() => setProviderSheetVisible(true)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add provider</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.timeline}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.message,
                item.role === "user" ? styles.userMessage : styles.assistantMessage,
                item.localError && styles.errorMessage,
              ]}
            >
              {item.role === "user" ? (
                <Text selectable style={styles.userMessageText}>
                  {item.content}
                </Text>
              ) : (
                <AiMessageContent
                  content={
                    item.content ||
                    (item.status === "incomplete" ? "上次请求未完成，请检查 API 配置后重试。" : "")
                  }
                  styles={styles}
                />
              )}
            </View>
          )}
        />
      )}

      {citations.length > 0 ? (
        <View style={styles.citations}>
          <Text style={styles.citationTitle}>来源</Text>
          <Text numberOfLines={2} style={styles.citationText}>
            {citations.map((citation) => citation.title ?? citation.url).join(" · ")}
          </Text>
        </View>
      ) : null}
      {toolSummaries.length > 0 ? (
        <View style={styles.toolTrace}>
          <Text style={styles.citationTitle}>执行记录</Text>
          {toolSummaries.map((item) => (
            <Text key={item.id} numberOfLines={2} style={styles.toolText}>
              {item.ok ? "✓" : "!"} {item.name.replaceAll("_", " ")} · {item.detail}
            </Text>
          ))}
        </View>
      ) : null}

      {proposals.find((proposal) => proposal.state === "pending") ? (
        <View style={styles.proposalCard}>
          <View style={styles.proposalCopy}>
            <Text style={styles.proposalTitle}>已有修改待确认</Text>
            <Text numberOfLines={1} style={styles.proposalPath}>
              {proposals.find((proposal) => proposal.state === "pending")?.targetPath}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              const pending = proposals.find((proposal) => proposal.state === "pending");
              if (pending) setReviewingProposal(pending);
            }}
            style={styles.reviewButton}
          >
            <Text style={styles.reviewText}>查看修改</Text>
          </Pressable>
        </View>
      ) : null}

      {activeProfile ? (
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="向 Mira 智能助手提问"
            multiline
            onChangeText={setPrompt}
            placeholder="询问、整理或改写你的笔记…"
            placeholderTextColor={theme.colors.mutedText}
            style={styles.composerInput}
            value={prompt}
          />
          <View style={styles.composerFooter}>
            <Pressable
              accessibilityLabel="添加笔记上下文"
              onPress={() => setContextSheetVisible(true)}
              style={styles.composerAdd}
            >
              <Plus color={theme.colors.mutedText} size={21} />
            </Pressable>
            {sending ? (
              <Pressable
                accessibilityLabel="停止 AI 回复"
                onPress={() => abortRef.current?.abort()}
                style={styles.sendButton}
              >
                <Square color="#FFFFFF" fill="#FFFFFF" size={14} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel="发送消息"
                disabled={!prompt.trim()}
                onPress={() => void send()}
                style={[styles.sendButton, !prompt.trim() && styles.sendButtonDisabled]}
              >
                <Send color="#FFFFFF" size={17} />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
      {sending ? <ActivityIndicator color={theme.colors.accent} style={styles.activity} /> : null}

      <AiProviderSheet
        connectionTester={services.aiConnectionTester}
        manager={services.aiProviderProfiles}
        onChanged={() => setProviderRevision((value) => value + 1)}
        onClose={() => setProviderSheetVisible(false)}
        settingsStore={services.settingsStore}
        visible={providerSheetVisible}
      />
      <AiContextSheet
        allowWholeWorkspaceSearch={allowWholeWorkspace}
        currentPath={activeDocument?.path ?? null}
        entries={controller.browserEntries}
        onClose={() => setContextSheetVisible(false)}
        onPermissionChange={setWholeWorkspacePermission}
        onTogglePath={toggleSelectedPath}
        selectedPaths={selectedPaths}
        visible={contextSheetVisible}
      />
      <AiProposalSheet
        busy={proposalBusy}
        onApply={(candidate) => {
          if (reviewingProposal) void applyProposal(reviewingProposal, candidate);
        }}
        onClose={() => setReviewingProposal(null)}
        onReject={() => {
          if (reviewingProposal) void rejectProposal(reviewingProposal);
        }}
        proposal={reviewingProposal}
      />
      <AiAutomationSheet
        currentPath={activeDocument?.path ?? null}
        onClose={() => setAutomationSheetVisible(false)}
        services={services}
        visible={automationSheetVisible}
      />
      <AiProposalInbox
        onClose={() => setInboxVisible(false)}
        onSelect={(proposal) => {
          setInboxVisible(false);
          setReviewingProposal(proposal);
        }}
        proposals={proposals}
        visible={inboxVisible}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      paddingHorizontal: theme.spacing[4],
      backgroundColor: theme.colors.background,
    },
    modeHeader: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.headerBackground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderSubtle,
      marginHorizontal: -16,
      paddingHorizontal: 16,
    },
    modeHeaderSlot: { width: 74 },
    modeSwitch: {
      flexDirection: "row",
      padding: 3,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surfaceMuted,
      gap: 2,
    },
    modeOption: {
      minHeight: 30,
      justifyContent: "center",
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
    },
    modeOptionActive: { backgroundColor: theme.colors.surface, ...theme.shadows.sm },
    modeText: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "500" },
    modeTextActive: { color: theme.colors.text, fontWeight: "700" },
    loadingMode: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingModeText: { color: theme.colors.mutedText, fontSize: 14, textAlign: "center" },
    loadingModeDetail: {
      maxWidth: 280,
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    loadingModeRetry: {
      minHeight: 40,
      paddingHorizontal: 16,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
    },
    loadingModeRetryText: { color: theme.colors.primary, fontSize: 14, fontWeight: "600" },
    header: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
    },
    identity: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    spark: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primarySoft,
    },
    title: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
    messageContent: { gap: 4 },
    messageSpace: { height: 5 },
    messageHeading: { color: theme.colors.text, fontSize: 16, fontWeight: "600", lineHeight: 23 },
    strong: { fontWeight: "600" },
    inlineCode: {
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      color: theme.colors.primary,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    codeBlock: {
      padding: 12,
      borderRadius: theme.radius.medium,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: 12,
      lineHeight: 18,
    },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    bulletMark: { color: theme.colors.primary, fontSize: 15, lineHeight: 21 },
    providerStatus: { marginTop: 2, color: theme.colors.mutedText, fontSize: 11 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
    iconAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: 8,
      right: 7,
      width: 7,
      height: 7,
      borderRadius: 10,
      backgroundColor: theme.colors.error,
    },
    contextCard: {
      gap: 9,
      padding: theme.spacing[3],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    contextHeader: { flexDirection: "row", justifyContent: "space-between" },
    contextLabel: {
      color: theme.colors.mutedText,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    permissionText: { color: theme.colors.mutedText, fontSize: 11 },
    contextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    contextChip: {
      minWidth: 0,
      maxWidth: "58%",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primarySoft,
    },
    contextChipText: { color: theme.colors.primaryText, fontSize: 12, fontWeight: "600" },
    contextChipSecondary: {
      maxWidth: 110,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceMuted,
    },
    contextChipSecondaryText: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 11,
    },
    moreContext: { color: theme.colors.mutedText, fontSize: 11 },
    addContext: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 3 },
    addContextText: { color: theme.colors.primary, fontSize: 12, fontWeight: "600" },
    webToggle: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: "auto",
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surfaceMuted,
    },
    webToggleActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    webToggleText: { color: theme.colors.mutedText, fontSize: 11, fontWeight: "500" },
    webToggleTextActive: { color: "#FFFFFF", fontWeight: "600" },
    timeline: { flexGrow: 1, gap: 12, paddingVertical: 18 },
    message: { maxWidth: "88%", paddingHorizontal: 0, paddingVertical: 10, borderRadius: 0 },
    userMessage: {
      alignSelf: "flex-end",
      borderRadius: theme.radius.large,
      borderBottomRightRadius: 4,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    assistantMessage: {
      alignSelf: "flex-start",
      borderRadius: theme.radius.large,
      borderBottomLeftRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    errorMessage: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.error },
    userMessageText: {
      color: "#FFFFFF",
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 13,
    },
    messageText: { color: theme.colors.text, fontSize: 14, lineHeight: 21, paddingHorizontal: 13 },
    citations: { gap: 3, marginBottom: 8, paddingHorizontal: 4 },
    citationTitle: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    citationText: { color: theme.colors.primary, fontSize: 11, lineHeight: 16 },
    toolTrace: { gap: 3, marginBottom: 8, paddingHorizontal: 4 },
    toolText: { color: theme.colors.mutedText, fontSize: 10, lineHeight: 15 },
    proposalCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    proposalCopy: { minWidth: 0, flex: 1 },
    proposalTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    proposalPath: { marginTop: 2, color: theme.colors.mutedText, fontSize: 11 },
    reviewButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 10 },
    reviewText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
    composer: {
      gap: 4,
      marginBottom: 6,
      padding: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    composerInput: {
      maxHeight: 112,
      minHeight: 42,
      paddingHorizontal: 4,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: "top",
    },
    composerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    composerAdd: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    sendButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    sendButtonDisabled: { opacity: 0.38 },
    activity: { position: "absolute", right: 24, bottom: 66 },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 36,
    },
    emptyIcon: {
      width: 58,
      height: 58,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surfaceMuted,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    primaryButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
      paddingHorizontal: 20,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  });
}
