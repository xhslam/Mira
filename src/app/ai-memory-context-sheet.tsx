import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AiConversation, AiConversationId } from "../ai/conversation";
import type { MemoryEntry } from "../ai/memory-store";
import type { AppServices } from "./app-services";
import { MiraSheet } from "./mira-controls";
import { useTheme } from "./theme";

const categoryLabels = { profile: "个人信息", preferences: "偏好", topic: "主题" } as const;
export function AiMemoryContextSheet(
  props: Readonly<{
    services: AppServices;
    visible: boolean;
    currentId: AiConversationId | null;
    selected: readonly AiConversationId[];
    onSelect: (ids: readonly AiConversationId[]) => void;
    useMemory: boolean;
    onUseMemory: (enabled: boolean) => void;
    onClose: () => void;
    onNotes: () => void;
    seed: MemoryEntry | null;
  }>,
) {
  const { colors, radius } = useTheme();
  const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.medium,
      padding: 14,
      gap: 8,
      marginBottom: 12,
    },
    text: { color: colors.text, fontSize: 15, lineHeight: 23, flexShrink: 1 },
    muted: { color: colors.mutedText, fontSize: 12, lineHeight: 19 },
    input: {
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: radius.medium,
      padding: 12,
      minHeight: 48,
      marginBottom: 12,
    },
    action: { color: colors.accent, fontSize: 14, paddingVertical: 12 },
  });
  const workspace = props.services.activeWorkspace.grant.workspaceId;
  const [tab, setTab] = useState<"references" | "memory">(props.seed ? "memory" : "references");
  const [conversations, setConversations] = useState<readonly AiConversation[]>([]);
  const [entries, setEntries] = useState<readonly MemoryEntry[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<MemoryEntry | null>(props.seed);
  const [preview, setPreview] = useState<{
    id: AiConversationId;
    title: string;
    content: string;
  } | null>(null);
  useEffect(() => {
    if (!props.visible) return;
    let active = true;
    void Promise.all([
      props.services.aiStore.listConversations(workspace),
      props.services.aiMemory.list(workspace),
      props.services.aiMemory.isEnabled(workspace),
    ])
      .then(([chats, memories, policy]) => {
        if (!active) return;
        setConversations(chats);
        setEntries(memories);
        setEnabled(policy);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("上下文读取失败，请重试");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [props.visible, props.services, props.seed, workspace, retry]);

  async function mutate(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setEntries(await props.services.aiMemory.list(workspace));
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  const button = (label: string, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || loading }}
      disabled={busy || loading}
      onPress={action}
    >
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
  return (
    <MiraSheet title="对话上下文" visible={props.visible} onClose={props.onClose}>
      <View style={styles.row}>
        {button(`${tab === "references" ? "● " : ""}引用对话 · ${props.selected.length}`, () => {
          setTab("references");
          setEdit(null);
        })}
        {button(`${tab === "memory" ? "● " : ""}记忆`, () => setTab("memory"))}
        {button("笔记", props.onNotes)}
      </View>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? (
        <View>
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {error}
          </Text>
          {button("重新读取", () => {
            setLoading(true);
            setError("");
            setRetry((value) => value + 1);
          })}
        </View>
      ) : null}
      {tab === "references" ? (
        <>
          <Text style={styles.muted}>
            选择当前工作区的对话，发送时读取已完成的消息。最多 5 个；长对话会提示缩小范围。
          </Text>
          {props.selected.map((id) => (
            <View key={id} style={styles.row}>
              <Text numberOfLines={1} style={[styles.text, { flex: 1 }]}>
                {conversations.find((chat) => chat.id === id)?.title ?? "此对话已不可用"}
              </Text>
              {button("移除引用", () =>
                props.onSelect(props.selected.filter((selected) => selected !== id)),
              )}
            </View>
          ))}
          <TextInput
            accessibilityLabel="搜索引用对话"
            placeholder="搜索对话标题…"
            placeholderTextColor={colors.mutedText}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
          />
          {conversations
            .filter(
              (chat) =>
                chat.id !== props.currentId &&
                chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
            )
            .map((chat) => (
              <View key={chat.id} style={styles.card}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: props.selected.includes(chat.id) }}
                  onPress={() => {
                    if (props.selected.includes(chat.id))
                      props.onSelect(props.selected.filter((id) => id !== chat.id));
                    else if (props.selected.length < 5)
                      props.onSelect([...props.selected, chat.id]);
                    else setError("每次最多引用 5 个对话");
                  }}
                >
                  <Text numberOfLines={2} style={styles.text}>
                    {props.selected.includes(chat.id) ? "✓ " : "○ "}
                    {chat.title}
                  </Text>
                  <Text numberOfLines={2} style={styles.muted}>
                    {chat.preview}
                  </Text>
                </Pressable>
                {button("预览对话", () => {
                  void props.services.aiStore
                    .listMessages(chat.id)
                    .then((messages) =>
                      setPreview({
                        id: chat.id,
                        title: chat.title,
                        content:
                          messages
                            .filter((item) => item.status === "completed")
                            .map(
                              (item) => `${item.role === "user" ? "你" : "Mira"}：${item.content}`,
                            )
                            .join("\n\n") || "此对话暂无已完成的消息",
                      }),
                    )
                    .catch(() => setError("对话预览失败，请重试"));
                })}
              </View>
            ))}
          {!loading && conversations.filter((chat) => chat.id !== props.currentId).length === 0 ? (
            <Text style={styles.muted}>还没有可引用的其他对话。</Text>
          ) : null}
          {preview ? (
            <View style={styles.card}>
              <Text style={styles.text}>{preview.title}</Text>
              <Text selectable style={styles.text}>
                {preview.content}
              </Text>
              {button("收起预览", () => setPreview(null))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {!edit ? (
            <>
              <View style={styles.row}>
                <Text style={[styles.text, { flex: 1 }]}>工作区记忆</Text>
                <Switch
                  accessibilityLabel="工作区记忆"
                  disabled={busy || loading}
                  value={enabled}
                  onValueChange={(value) =>
                    void mutate(async () => {
                      await props.services.aiMemory.setEnabled(workspace, value);
                      setEnabled(value);
                    })
                  }
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.text, { flex: 1 }]}>本次对话使用记忆</Text>
                <Switch
                  accessibilityLabel="本次对话使用记忆"
                  value={props.useMemory}
                  onValueChange={props.onUseMemory}
                />
              </View>
              <Text style={styles.muted}>
                个人信息和偏好随请求提供；主题记忆按需读取。可以说“记住……”来保存原文，也可手动整理。停用后保留本地记忆。
              </Text>
              {button("添加记忆", () =>
                setEdit({
                  id: Crypto.randomUUID(),
                  workspaceId: workspace,
                  title: "",
                  category: "topic",
                  content: "",
                  enabled: true,
                  source: null,
                  updatedAt: new Date().toISOString(),
                }),
              )}
            </>
          ) : null}
          {edit ? (
            <View>
              <TextInput
                accessibilityLabel="记忆标题"
                placeholder="标题"
                placeholderTextColor={colors.mutedText}
                value={edit.title}
                onChangeText={(title) => setEdit({ ...edit, title })}
                style={styles.input}
                maxLength={120}
              />
              <View style={styles.row}>
                {(["profile", "preferences", "topic"] as const).map((category) => (
                  <View key={category}>
                    {button(
                      `${edit.category === category ? "● " : ""}${categoryLabels[category]}`,
                      () => setEdit({ ...edit, category }),
                    )}
                  </View>
                ))}
              </View>
              <TextInput
                accessibilityLabel="记忆内容"
                placeholder="希望 Mira 了解的信息…"
                placeholderTextColor={colors.mutedText}
                value={edit.content}
                onChangeText={(content) => setEdit({ ...edit, content })}
                multiline
                style={[styles.input, { minHeight: 120 }]}
                maxLength={8000}
              />
              {button(
                "保存记忆",
                () =>
                  void mutate(async () => {
                    await props.services.aiMemory.save({
                      ...edit,
                      updatedAt: new Date().toISOString(),
                    });
                    setEdit(null);
                  }),
              )}
              {button("取消编辑", () => setEdit(null))}
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>{entry.title}</Text>
                  <Switch
                    accessibilityLabel={`使用记忆：${entry.title}`}
                    disabled={busy}
                    value={entry.enabled}
                    onValueChange={(value) =>
                      void mutate(() =>
                        props.services.aiMemory.save({
                          ...entry,
                          enabled: value,
                          updatedAt: new Date().toISOString(),
                        }),
                      )
                    }
                  />
                </View>
                <Text style={styles.muted}>
                  {categoryLabels[entry.category]} ·{" "}
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </Text>
                <Text selectable style={styles.text}>
                  {entry.content}
                </Text>
                {entry.source ? (
                  <Text selectable style={styles.muted}>
                    来源：
                    {conversations.find((chat) => chat.id === entry.source?.conversationId)
                      ?.title ?? "原对话已不可用"}
                    \n原文：{entry.source.quote}
                  </Text>
                ) : (
                  <Text style={styles.muted}>手动整理</Text>
                )}
                <View style={styles.row}>
                  {button("编辑", () => setEdit(entry))}
                  {button(
                    "删除",
                    () => void mutate(() => props.services.aiMemory.remove(workspace, entry.id)),
                  )}
                </View>
              </View>
            ))
          )}
          {!loading && entries.length === 0 && !edit ? (
            <Text style={styles.muted}>记忆还是空的。添加偏好，或从一条用户消息保存。</Text>
          ) : null}
        </>
      )}
      {button("完成", props.onClose)}
    </MiraSheet>
  );
}
