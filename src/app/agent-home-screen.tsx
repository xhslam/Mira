import {
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Plus, Search, Settings2, SquarePen, ChevronUp, Pin } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiConversation, AiConversationId } from "../ai/conversation";
import { AgentAvatar, agentAvatarSource, pickAgentAvatar } from "./agent-avatar";
import { AgentHistorySwipeRow } from "./agent-history-swipe-row";
import { ConversationMemorySheet } from "./ai-memory-context-sheet";
import { useReducedMotion } from "./use-reduced-motion";
import { AgentConversationScreen } from "./ai-workspace-screen";
import { AiProviderSheet } from "./ai-provider-sheet";
import type { PrimaryTab } from "./app-shell-state";
import type { AppServices } from "./app-services";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import { CircleAction, MiraSheet, SheetAction } from "./mira-controls";
import { useTheme, type Theme } from "./theme";
import { PrimaryNavigation } from "./primary-navigation";

export function AgentHomeScreen({
  services,
  controller,
  clickVibration,
  onNavigate,
}: Readonly<{
  services: AppServices;
  controller: EditorWorkspaceController;
  clickVibration: boolean;
  onNavigate: (tab: PrimaryTab) => void;
}>) {
  const theme = useTheme();
  const workspaceId = services.activeWorkspace.grant.workspaceId;
  const reduceMotion = useReducedMotion();
  const styles = createStyles(theme);
  const { width, fontScale } = useWindowDimensions();
  const split = width >= 640 && width / Math.max(1, fontScale) >= 580;
  const [conversations, setConversations] = useState<readonly AiConversation[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [revealedId, setRevealedId] = useState<AiConversationId | null>(null);
  const [memoryConversation, setMemoryConversation] = useState<AiConversation | null>(null);
  const historyWrite = useRef(false);
  const [selection, setSelection] = useState<{
    conversation: AiConversation | null;
    key: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<AiConversationId | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [menu, setMenu] = useState(false);
  const [models, setModels] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const [workspaceAvatar] = useState(pickAgentAvatar);
  const revision = useRef(0);
  const nextKey = useRef(0);
  const [drafts] = useState(() => new Map<AiConversationId | null, string>());
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const entries = await services.aiStore.listConversations(workspaceId, "history");
      if (current !== revision.current) return;
      setConversations(entries);
      setLoadState("ready");
    } catch {
      if (current === revision.current) setLoadState("error");
    }
  }, [services.aiStore, workspaceId]);

  const invalidateRefresh = useCallback(() => {
    revision.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      invalidateRefresh();
      listener.remove();
    };
  }, [invalidateRefresh, refresh]);

  const open = useCallback((conversation: AiConversation | null) => {
    Keyboard.dismiss();
    setRevealedId(null);
    setSelection({ conversation, key: nextKey.current++ });
    setSelectedId(conversation?.id ?? null);
    setShowConversation(true);
  }, []);

  const close = useCallback(() => {
    Keyboard.dismiss();
    setShowConversation(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!split || selection || loadState !== "ready") return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) open(conversations[0] ?? null);
    });
    return () => {
      active = false;
    };
  }, [conversations, loadState, open, selection, split]);

  useEffect(() => {
    if (!revealedId && (split || (!showConversation && !searching))) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (revealedId) setRevealedId(null);
      else if (showConversation) close();
      else {
        setSearching(false);
        setQuery("");
      }
      return true;
    });
    return () => listener.remove();
  }, [close, revealedId, searching, showConversation, split]);

  async function writeHistory(failure: string, action: () => Promise<void>) {
    if (historyWrite.current) return;
    historyWrite.current = true;
    try {
      await action();
      await refresh();
    } catch {
      Alert.alert(failure, "请重试。");
    } finally {
      historyWrite.current = false;
    }
  }

  function confirmDelete(item: AiConversation) {
    setRevealedId(null);
    Alert.alert(
      "删除对话？",
      `「${item.title}」及其消息将被删除，无法撤销。已保存的记忆不受影响。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void writeHistory("删除对话失败", async () => {
              await services.aiStore.removeConversation(workspaceId, item.id);
              invalidateRefresh();
              drafts.delete(item.id);
              setConversations((current) => current.filter(({ id }) => id !== item.id));
              if (selectedId === item.id) {
                setSelectedId(null);
                setSelection(null);
                setShowConversation(false);
              }
            }),
        },
      ],
    );
  }

  const term = query.trim().toLocaleLowerCase();
  const results = conversations.filter(
    (conversation) =>
      !term ||
      conversation.title.toLocaleLowerCase().includes(term) ||
      conversation.preview?.toLocaleLowerCase().includes(term),
  );
  const selectedTitle =
    conversations.find(({ id }) => id === selectedId)?.title ?? selection?.conversation?.title;

  return (
    <View style={styles.root}>
      {split || !showConversation ? (
        <View style={[styles.listPane, split && styles.splitPane]}>
          <View style={styles.toolbar}>
            {searching ? (
              <TextInput
                autoFocus
                accessibilityLabel="搜索会话标题"
                onChangeText={(value) => {
                  setRevealedId(null);
                  setQuery(value);
                }}
                placeholder="搜索会话"
                placeholderTextColor={theme.colors.mutedText}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
            ) : (
              <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
                Agent
              </Text>
            )}
            <CircleAction
              label={searching ? "关闭会话搜索" : "搜索历史会话"}
              onPress={() => {
                setRevealedId(null);
                if (searching) {
                  Keyboard.dismiss();
                  setQuery("");
                }
                setSearching(!searching);
              }}
            >
              {searching ? (
                <ChevronUp size={22} color={theme.colors.text} />
              ) : (
                <Search size={22} color={theme.colors.text} />
              )}
            </CircleAction>
            <CircleAction
              label="新建与工具"
              onPress={() => {
                setRevealedId(null);
                setMenu(true);
              }}
            >
              <Plus size={24} color={theme.colors.text} />
            </CircleAction>
          </View>
          <FlatList
            accessibilityLabel="会话列表"
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            onScrollBeginDrag={() => setRevealedId(null)}
            renderItem={({ item }) => {
              const active = selectedId === item.id;
              const revealed = revealedId === item.id;
              const toggleActions = () => setRevealedId(revealed ? null : item.id);
              return (
                <AgentHistorySwipeRow
                  title={item.title}
                  open={revealed}
                  pinned={item.pinned === true}
                  reduceMotion={reduceMotion}
                  onOpenChange={(value) => setRevealedId(value ? item.id : null)}
                  onDelete={() => confirmDelete(item)}
                  onPin={() => {
                    setRevealedId(null);
                    void writeHistory(item.pinned ? "取消置顶失败" : "置顶失败", () =>
                      services.aiStore.setConversationPinned(workspaceId, item.id, !item.pinned),
                    );
                  }}
                  onMemory={() => {
                    setRevealedId(null);
                    Keyboard.dismiss();
                    setMemoryConversation(item);
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, expanded: revealed }}
                    accessibilityLabel={item.pinned ? `${item.title}，已置顶` : item.title}
                    accessibilityActions={[
                      { name: "longpress", label: revealed ? "收起对话选项" : "显示对话选项" },
                    ]}
                    onAccessibilityAction={({ nativeEvent }) => {
                      if (nativeEvent.actionName === "longpress") toggleActions();
                    }}
                    onLongPress={toggleActions}
                    onPress={() => {
                      if (revealed) setRevealedId(null);
                      else if (active) {
                        Keyboard.dismiss();
                        setRevealedId(null);
                        setShowConversation(true);
                      } else open(item);
                    }}
                    style={({ pressed }) => [styles.row, (active || pressed) && styles.rowActive]}
                  >
                    <AgentAvatar source={agentAvatarSource(item.id)} size={48} />
                    <View style={styles.rowCopy}>
                      <View style={styles.rowHeading}>
                        {item.pinned ? <Pin size={13} color={theme.colors.mutedText} /> : null}
                        <Text numberOfLines={1} style={styles.rowTitle}>
                          {item.title}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.preview}>
                        {item.preview
                          ?.replace(/\*\*|__/g, "")
                          .replace(/\s+/g, " ")
                          .trim() || "暂无消息"}
                      </Text>
                    </View>
                  </Pressable>
                </AgentHistorySwipeRow>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text accessibilityLiveRegion="polite" style={styles.emptyText}>
                  {loadState === "loading"
                    ? "正在读取会话…"
                    : loadState === "error"
                      ? "暂时无法读取会话"
                      : term
                        ? "没有匹配的会话。"
                        : "还没有会话"}
                </Text>
                {loadState === "error" || (loadState === "ready" && !term) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={loadState === "error" ? () => void refresh() : () => open(null)}
                    style={styles.emptyAction}
                  >
                    <Text style={styles.emptyActionText}>
                      {loadState === "error" ? "重试" : "新对话"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
          <PrimaryNavigation
            activeTab="agent"
            clickVibration={clickVibration}
            onSelect={onNavigate}
          >
            <View style={styles.workspaceIdentity}>
              <AgentAvatar source={workspaceAvatar} size={44} />
              <Text numberOfLines={1} style={styles.workspaceName}>
                {services.activeWorkspace.grant.displayName}
              </Text>
            </View>
          </PrimaryNavigation>
        </View>
      ) : null}
      {selection ? (
        <View style={[styles.conversationPane, !split && !showConversation && styles.hidden]}>
          <AgentConversationScreen
            key={selection.key}
            services={services}
            controller={controller}
            onBack={close}
            initialConversation={selection.conversation}
            threadTitle={selectedTitle ?? "Mira"}
            avatarSource={agentAvatarSource(selectedId)}
            splitPane={split}
            wallpaperActive={split || showConversation}
            sharedDrafts={drafts}
            providerRefresh={profileRevision}
            onThreadActivity={(id) => {
              if (id) setSelectedId(id);
              void refresh();
            }}
          />
        </View>
      ) : null}
      <MiraSheet title="新建与工具" visible={menu} onClose={() => setMenu(false)}>
        <SheetAction
          label="新对话"
          icon={<SquarePen size={20} color={theme.colors.text} />}
          onPress={() => {
            setMenu(false);
            open(null);
          }}
        />
        <SheetAction
          label="模型设置"
          icon={<Settings2 size={20} color={theme.colors.text} />}
          onPress={() => {
            setMenu(false);
            setModels(true);
          }}
        />
      </MiraSheet>
      {memoryConversation ? (
        <ConversationMemorySheet
          services={services}
          conversation={memoryConversation}
          onClose={() => setMemoryConversation(null)}
        />
      ) : null}
      <AiProviderSheet
        connectionTester={services.aiConnectionTester}
        modelDiscovery={services.aiModelDiscovery}
        manager={services.aiProviderProfiles}
        onChanged={() => setProfileRevision((value) => value + 1)}
        onClose={() => setModels(false)}
        settingsStore={services.settingsStore}
        visible={models}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  const colors = theme.colors;
  return StyleSheet.create({
    root: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
    listPane: { flex: 1, minWidth: 0, backgroundColor: colors.historyBackground },
    splitPane: {
      flex: 0,
      width: "34%",
      minWidth: 220,
      maxWidth: 380,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.divider,
    },
    conversationPane: { flex: 1, minWidth: 0 },
    hidden: { display: "none" },
    toolbar: {
      minHeight: 66,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    heading: { flex: 1, color: colors.text, fontSize: 23, fontWeight: "600" },
    searchInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 24,
      color: colors.text,
      backgroundColor: colors.canvas,
      fontSize: 16,
    },
    list: { flexGrow: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
    row: {
      minHeight: 72,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
    },
    rowActive: { backgroundColor: colors.historySelection },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowHeading: { flexDirection: "row", alignItems: "center", gap: 4 },
    rowTitle: {
      flexShrink: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: "600",
      lineHeight: 23,
    },
    preview: { color: colors.mutedText, fontSize: 14, lineHeight: 20 },
    empty: {
      flex: 1,
      minHeight: 130,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 12,
    },
    emptyText: { color: colors.mutedText, fontSize: 15, textAlign: "center" },
    emptyAction: {
      minHeight: 48,
      paddingHorizontal: 18,
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: colors.canvas,
    },
    emptyActionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
    workspaceIdentity: { alignItems: "center", flexDirection: "row", gap: 8 },
    workspaceName: { color: colors.text, flexShrink: 1, fontSize: 15 },
  });
}
