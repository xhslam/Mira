import * as Crypto from "expo-crypto";
import {
  ArrowUp,
  Clock3,
  ChevronLeft,
  ChevronDown,
  FileText,
  Globe2,
  Inbox,
  MoreHorizontal,
  Plus,
  Square,
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
import { pickDefaultAiProviderProfile } from "../ai/provider-profile-manager";
import type { AiConversation, AiConversationId, AiConversationMessage } from "../ai/conversation";
import type { AiProposal } from "../ai/proposal";
import { createAiWorkspaceToolRuntime } from "../ai/workspace-tool-runtime";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import type { AppServices } from "./app-services";
import { describeAiSendFailure } from "./ai-error-message";
import { AiContextSheet } from "./ai-context-sheet";
import { AiAutomationSheet } from "./ai-automation-sheet";
import { AiModelPicker } from "./ai-model-picker";
import { AiProviderSheet } from "./ai-provider-sheet";
import { AiProposalSheet } from "./ai-proposal-sheet";
import { AiProposalInbox } from "./ai-proposal-inbox";
import { CircleAction, MiraAvatar, MiraSheet, SheetAction } from "./mira-controls";
import { useTheme, type Theme } from "./theme";
import { useUiSound } from "./ui-sound-context";

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

export function AgentConversationScreen({
  services,
  controller,
  onBack,
  initialConversation,
  threadTitle,
  avatarLook,
  splitPane = false,
  sharedDrafts,
  providerRefresh = 0,
  onThreadActivity,
}: Readonly<{
  services: AppServices;
  controller: EditorWorkspaceController;
  onBack: () => void;
  initialConversation: AiConversation | null;
  threadTitle?: string;
  avatarLook?: Readonly<{ color: string; shape: string }>;
  splitPane?: boolean;
  sharedDrafts?: Map<AiConversationId | null, string>;
  providerRefresh?: number;
  onThreadActivity?: (id: AiConversationId | null) => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const uiSound = useUiSound();
  const [profiles, setProfiles] = useState<readonly AiProviderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(
    initialConversation?.providerProfileId ?? null,
  );
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [menu, setMenu] = useState<"options" | null>(null);
  const timeline = useRef<FlatList<DisplayMessage>>(null);
  const followLatest = useRef(true);
  const [conversationId, setConversationId] = useState<AiConversationId | null>(
    initialConversation?.id ?? null,
  );
  const [threadState, setThreadState] = useState<"loading" | "ready" | "error">(
    initialConversation ? "loading" : "ready",
  );
  const [threadRetry, setThreadRetry] = useState(0);
  const [messages, setMessages] = useState<readonly DisplayMessage[]>([]);
  const [prompt, setPrompt] = useState(
    () => sharedDrafts?.get(initialConversation?.id ?? null) ?? "",
  );
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
  const abortRef = useRef<AbortController | null>(null);

  const lifecycle = useRef(false);
  useEffect(() => {
    lifecycle.current = true;
    return () => {
      lifecycle.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (prompt) sharedDrafts?.set(conversationId, prompt);
    else sharedDrafts?.delete(conversationId);
  }, [conversationId, prompt, sharedDrafts]);

  useEffect(() => {
    if (!initialConversation) return;
    let active = true;
    void services.aiStore
      .listMessages(initialConversation.id)
      .then((messages) => {
        if (!active) return;
        setMessages(messages);
        setThreadState("ready");
      })
      .catch(() => {
        if (active) setThreadState("error");
      });
    return () => {
      active = false;
    };
  }, [initialConversation, services.aiStore, threadRetry]);

  const activeProfile = useMemo(
    () =>
      profiles.find((profile) => profile.id === activeProfileId) ??
      profiles.find((profile) => profile.id === defaultProfileId) ??
      profiles[0] ??
      null,
    [activeProfileId, defaultProfileId, profiles],
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
        setProfiles(
          Object.freeze(summaries.filter((item) => item.hasApiKey).map((item) => item.profile)),
        );
        const configured = settings.ok ? settings.value.ai.activeProviderProfileId : null;
        setDefaultProfileId(pickDefaultAiProviderProfile(summaries, configured)?.id ?? null);
        setAllowWholeWorkspace(settings.ok && settings.value.ai.allowWholeWorkspaceSearch);
        const storedProposals = await services.aiStore.listProposals(
          services.activeWorkspace.grant.workspaceId,
        );
        if (active) setProposals(storedProposals);
      })
      .catch(() => {
        // The empty state remains actionable through provider settings.
      });
    return () => {
      active = false;
    };
  }, [providerRefresh, providerRevision, services]);

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
    if (!text || sending || threadState !== "ready" || activeProfile === null) return;
    uiSound.play("send");
    // Keep the user input available for retry if capture/provider setup fails.
    setPrompt("");
    setSending(true);
    setCitations(Object.freeze([]));
    setToolSummaries(Object.freeze([]));
    const abort = new AbortController();
    abortRef.current = abort;
    let changedThread = conversationId;
    try {
      const document = activeDocument ? await controller.captureAiSnapshot() : null;
      const selectedReads = await Promise.all(
        selectedPaths
          .filter((path) => path !== document?.path)
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
        authorizedPaths: Object.freeze([...(document ? [document.path] : []), ...selectedPaths]),
        createId: Crypto.randomUUID,
        writableNotes: Object.freeze(
          document
            ? [
                Object.freeze({
                  path: document.path,
                  baseRevision: `editor:${document.documentId}:${document.revision}`,
                  baseHash: document.baseHash,
                  baseContent: document.markdown,
                }),
              ]
            : [],
        ),
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
          ...(document
            ? [
                Object.freeze({
                  label: document.path,
                  content: document.markdown,
                  unsaved: document.dirty,
                }),
              ]
            : []),
          ...selectedContext,
        ]),
        tools,
        ...(webSearchEnabled ? { nativeWebSearch: true } : {}),
        signal: abort.signal,
      })) {
        if (event.type === "started") {
          changedThread = event.conversation.id;
          setConversationId(changedThread);
          if (lifecycle.current) onThreadActivity?.(changedThread);
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
      if (lifecycle.current) onThreadActivity?.(changedThread);
      setSending(false);
    }
  }

  const hasPendingProposal = proposals.some((proposal) => proposal.state === "pending");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {!splitPane ? (
            <CircleAction label="返回 Agent" onPress={onBack}>
              <ChevronLeft color={theme.colors.text} size={24} />
            </CircleAction>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeProfile ? `选择模型：${activeProfile.model}` : "选择模型"}
          accessibilityState={{ disabled: sending }}
          disabled={sending}
          onPress={() => setModelPickerVisible(true)}
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
        >
          <MiraAvatar size={33} {...avatarLook} />
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.title}>
              {threadTitle ?? "Mira"}
            </Text>
            <Text numberOfLines={1} style={styles.identityModel}>
              {activeProfile?.model ?? "选择模型"}
            </Text>
          </View>
          <ChevronDown color={theme.colors.mutedText} size={16} />
        </Pressable>
        <View style={styles.headerSide}>
          <CircleAction label="对话选项" onPress={() => setMenu("options")}>
            <MoreHorizontal color={theme.colors.text} size={22} />
            {hasPendingProposal ? <View style={styles.badge} /> : null}
          </CircleAction>
        </View>
      </View>
      <FlatList
        ref={timeline}
        style={styles.timelineList}
        contentContainerStyle={[styles.timeline, messages.length === 0 && styles.timelineEmpty]}
        keyboardShouldPersistTaps="handled"
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => {
          if (messages.length > 0 && followLatest.current) {
            timeline.current?.scrollToEnd({ animated: false });
          }
        }}
        onScroll={({ nativeEvent }) => {
          const { contentSize, contentOffset, layoutMeasurement } = nativeEvent;
          followLatest.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height < 96;
        }}
        scrollEventThrottle={32}
        ListEmptyComponent={
          threadState !== "ready" ? (
            <View style={styles.emptyState}>
              {threadState === "loading" ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setThreadState("loading");
                    setThreadRetry((value) => value + 1);
                  }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>会话暂时无法打开，点击重试</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MiraAvatar size={66} />
              <Text accessibilityRole="header" style={styles.emptyTitle}>
                {activeProfile ? "给 Mira 发条消息" : "连接一个模型"}
              </Text>
              <Text style={styles.emptyCopy}>
                {activeProfile
                  ? "可以先添加一篇笔记，再告诉 Mira 你想做什么。"
                  : "连接后就能发送消息，也可以先在下方写好草稿。"}
              </Text>
              {activeProfile ? null : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setProviderSheetVisible(true)}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryButtonText}>设置模型</Text>
                </Pressable>
              )}
            </View>
          )
        }
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

      {activeDocument || selectedPaths.length > 0 || allowWholeWorkspace || canSearch ? (
        <View style={styles.contextRow}>
          {activeDocument || selectedPaths.length > 0 || allowWholeWorkspace ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看笔记上下文"
              onPress={() => setContextSheetVisible(true)}
              style={styles.contextChip}
            >
              <FileText color={theme.colors.mutedText} size={15} />
              <Text numberOfLines={1} style={styles.contextChipText}>
                {activeDocument?.path ?? "笔记上下文"}
                {activeDocument?.dirty ? " · 未保存" : ""}
                {selectedPaths.length > 0 ? ` +${selectedPaths.length}` : ""}
                {allowWholeWorkspace ? " · 可搜索工作区" : ""}
              </Text>
            </Pressable>
          ) : null}
          {canSearch ? (
            <Pressable
              accessibilityLabel="联网搜索"
              accessibilityRole="switch"
              accessibilityState={{ checked: webSearchEnabled }}
              onPress={() => setWebSearch((current) => !current)}
              style={[styles.contextChip, webSearchEnabled && styles.webToggleActive]}
            >
              <Globe2
                color={webSearchEnabled ? theme.colors.canvas : theme.colors.mutedText}
                size={15}
              />
              <Text
                style={[styles.contextChipText, webSearchEnabled && styles.webToggleTextActive]}
              >
                联网
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {sending ? (
        <View style={styles.activity} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.colors.accent} size="small" />
          <Text style={styles.providerStatus}>Mira 正在回复</Text>
        </View>
      ) : null}
      <View style={styles.composer}>
        <View style={styles.inputPill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加笔记上下文"
            onPress={() => setContextSheetVisible(true)}
            style={({ pressed }) => [styles.attachButton, pressed && styles.pressed]}
          >
            <Plus color={theme.colors.mutedText} size={23} />
          </Pressable>
          <TextInput
            accessibilityLabel="向 Agent 对话提问"
            multiline
            onChangeText={setPrompt}
            placeholder={`给 ${threadTitle ?? "Mira"} 发消息…`}
            placeholderTextColor={theme.colors.mutedText}
            style={styles.composerInput}
            value={prompt}
          />
          {sending ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="停止 AI 回复"
              onPress={() => abortRef.current?.abort()}
              style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
            >
              <Square color={theme.colors.canvas} fill={theme.colors.canvas} size={14} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="发送消息"
              accessibilityState={{
                disabled: threadState !== "ready" || !activeProfile || !prompt.trim(),
              }}
              disabled={threadState !== "ready" || !activeProfile || !prompt.trim()}
              onPress={() => {
                followLatest.current = true;
                void send();
              }}
              style={({ pressed }) => [
                styles.sendButton,
                (threadState !== "ready" || !activeProfile || !prompt.trim()) &&
                  styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <ArrowUp color={theme.colors.canvas} size={20} />
            </Pressable>
          )}
        </View>
      </View>
      <MiraSheet onClose={() => setMenu(null)} title="对话选项" visible={menu !== null}>
        <SheetAction
          icon={<Clock3 color={theme.colors.text} size={20} />}
          label="AI 自动任务"
          onPress={() => {
            setMenu(null);
            setAutomationSheetVisible(true);
          }}
        />
        <SheetAction
          icon={<Inbox color={theme.colors.text} size={20} />}
          label={hasPendingProposal ? "AI 修改建议 · 待确认" : "AI 修改建议"}
          onPress={() => {
            setMenu(null);
            setInboxVisible(true);
          }}
        />
      </MiraSheet>

      <AiModelPicker
        activeProfileId={activeProfile?.id ?? null}
        onClose={() => setModelPickerVisible(false)}
        onManage={() => {
          setModelPickerVisible(false);
          setProviderSheetVisible(true);
        }}
        onSelect={(profile) => {
          setActiveProfileId(profile.id);
          setModelPickerVisible(false);
        }}
        profiles={profiles}
        visible={modelPickerVisible}
      />
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
    screen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 12 },
    header: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      justifyContent: "space-between",
    },
    headerSide: { width: 48, height: 48 },
    attachButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      margin: 3,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    identity: {
      minWidth: 0,
      flexShrink: 1,
      maxWidth: "74%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 48,
      paddingLeft: 6,
      paddingRight: 14,
      borderRadius: 24,
      backgroundColor: theme.colors.canvas,
    },
    identityCopy: { minWidth: 0, flexShrink: 1 },
    identityModel: { color: theme.colors.mutedText, fontSize: 11 },
    title: { color: theme.colors.text, flexShrink: 1, fontSize: 16, fontWeight: "600" },
    pressed: { opacity: 0.66 },
    messageContent: { gap: 4 },
    messageSpace: { height: 5 },
    messageHeading: { color: theme.colors.text, fontSize: 16, fontWeight: "600", lineHeight: 23 },
    strong: { fontWeight: "600" },
    inlineCode: {
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      color: theme.colors.accent,
      backgroundColor: theme.colors.surfaceMuted,
    },
    codeBlock: {
      padding: 11,
      borderRadius: 10,
      color: theme.colors.text,
      backgroundColor: theme.colors.canvas,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      fontSize: 12,
      lineHeight: 18,
    },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    bulletMark: { color: theme.colors.accent, fontSize: 15, lineHeight: 21 },
    providerStatus: { color: theme.colors.mutedText, fontSize: 11 },
    badge: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.colors.error,
    },
    contextRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    contextChip: {
      minWidth: 0,
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      minHeight: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
    },
    contextChipText: { flexShrink: 1, color: theme.colors.text, fontSize: 12 },
    webToggleActive: { backgroundColor: theme.colors.text },
    webToggleTextActive: { color: theme.colors.canvas },
    timelineList: { flex: 1 },
    timeline: { flexGrow: 1, gap: 8, paddingVertical: 16 },
    timelineEmpty: { justifyContent: "center" },
    message: { maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22 },
    userMessage: {
      alignSelf: "flex-end",
      backgroundColor: "#BB460A",
    },
    assistantMessage: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.surface,
    },
    errorMessage: { backgroundColor: theme.colors.warningSurface },
    userMessageText: { color: theme.colors.canvas, fontSize: 15, lineHeight: 22 },
    messageText: { color: theme.colors.text, fontSize: 15, lineHeight: 22, flexShrink: 1 },
    citations: { gap: 3, marginBottom: 8, paddingHorizontal: 4 },
    citationTitle: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    citationText: { color: theme.colors.accent, fontSize: 11, lineHeight: 16 },
    toolTrace: { gap: 3, marginBottom: 8, paddingHorizontal: 4 },
    toolText: { color: theme.colors.mutedText, fontSize: 10, lineHeight: 15 },
    proposalCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
      padding: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.background,
    },
    proposalCopy: { minWidth: 0, flex: 1 },
    proposalTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    proposalPath: { marginTop: 2, color: theme.colors.mutedText, fontSize: 11 },
    reviewButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 10 },
    reviewText: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingVertical: 8 },
    inputPill: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
      paddingLeft: 2,
      borderRadius: 28,
      backgroundColor: theme.colors.canvas,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    composerInput: {
      flex: 1,
      minWidth: 0,
      maxHeight: 112,
      minHeight: 48,
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 22,
      paddingVertical: 12,
    },
    sendButton: {
      width: 44,
      height: 44,
      margin: 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: "#BB460A",
    },
    sendButtonDisabled: { opacity: 0.35 },
    activity: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
    emptyTitle: { color: theme.colors.text, fontSize: 23, fontWeight: "600", letterSpacing: -0.4 },
    emptyCopy: {
      maxWidth: 320,
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    primaryButton: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
      paddingHorizontal: 20,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.text,
    },
    primaryButtonText: { color: theme.colors.background, fontSize: 14, fontWeight: "700" },
  });
}
