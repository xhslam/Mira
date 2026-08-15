import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, Plus, RefreshCw, Rss, X } from "lucide-react-native";
import type { Theme } from "../app/theme";
import { providerForUrl, RECOMMENDED_CHANNELS } from "./learning-content-sources";
import type { DiscoverFeedEntry, DiscoverSubscription, LearningSnapshot } from "./learning-types";
import { fetchYoutubeCaptions } from "./youtube-learning";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  theme: Theme;
  onChange: (next: LearningSnapshot) => void;
}>;

export function DiscoverScreen({ snapshot, theme, onChange }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [managerVisible, setManagerVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const subscriptions = snapshot.subscriptions;
  const entries = snapshot.discoverEntries
    .filter((entry) => !selectedSource || entry.subscriptionId === selectedSource)
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
  async function addSubscription(value = url) {
    setBusy(true);
    setNotice(null);
    try {
      const provider = providerForUrl(value);
      if (!provider)
        throw new Error(
          "当前仅支持真实可用的 YouTube 频道、@handle 或播放列表订阅；B 站请使用一次性 URL 导入。",
        );
      const normalized = provider.normalizeSubscription(value);
      const duplicate = snapshot.subscriptions.some(
        (item) => item.provider === provider.id && item.sourceId === normalized.sourceId,
      );
      if (duplicate) throw new Error("这个频道已经订阅。 ");
      const now = new Date().toISOString();
      const subscription: DiscoverSubscription = Object.freeze({
        id: `source-${Date.now()}`,
        provider: provider.id,
        sourceId: normalized.sourceId,
        sourceUrl: normalized.sourceUrl,
        title: normalized.title,
        avatarUrl: null,
        language: null,
        createdAt: now,
        updatedAt: now,
        lastFetchedAt: null,
        lastError: null,
      });
      const next = Object.freeze({
        ...snapshot,
        subscriptions: Object.freeze([subscription, ...snapshot.subscriptions]),
      });
      onChange(next);
      setUrl("");
      await refreshSubscription(subscription, next);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法添加频道。 ");
    } finally {
      setBusy(false);
    }
  }
  async function refreshSubscription(subscription: DiscoverSubscription, base = snapshot) {
    const provider = providerForUrl(subscription.sourceUrl);
    if (!provider) return;
    setBusy(true);
    try {
      const entries = await provider.fetchFeed(subscription);
      const now = new Date().toISOString();
      onChange(
        Object.freeze({
          ...base,
          subscriptions: Object.freeze(
            base.subscriptions.map((item) =>
              item.id === subscription.id
                ? Object.freeze({ ...item, lastFetchedAt: now, lastError: null, updatedAt: now })
                : item,
            ),
          ),
          discoverEntries: Object.freeze([
            ...entries,
            ...base.discoverEntries.filter((item) => item.subscriptionId !== subscription.id),
          ]),
        }),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "频道刷新失败。";
      setNotice(message);
      const updatedSubscriptions = base.subscriptions.map((item) =>
        item.id === subscription.id
          ? Object.freeze({ ...item, lastError: message, updatedAt: new Date().toISOString() })
          : item,
      );
      onChange(Object.freeze({ ...base, subscriptions: Object.freeze(updatedSubscriptions) }));
    } finally {
      setBusy(false);
    }
  }
  function removeSubscription(id: string) {
    onChange(
      Object.freeze({
        ...snapshot,
        subscriptions: Object.freeze(snapshot.subscriptions.filter((item) => item.id !== id)),
        discoverEntries: Object.freeze(
          snapshot.discoverEntries.filter((item) => item.subscriptionId !== id),
        ),
      }),
    );
    if (selectedSource === id) setSelectedSource(null);
  }

  async function addEntry(entry: DiscoverFeedEntry) {
    if (snapshot.resources.some((resource) => resource.sourceUrl === entry.sourceUrl)) {
      setNotice("这条外部来源已经在资料库中。 ");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const captions = await fetchYoutubeCaptions(entry.sourceUrl);
      const now = new Date().toISOString();
      const id = `youtube-${entry.externalId}`;
      const resource = Object.freeze({
        id,
        title: entry.title,
        description: entry.description ?? "来自已订阅 YouTube 频道的学习视频。",
        language: "en",
        source: "youtube" as const,
        provider: "discover" as const,
        content: captions.map((cue) => cue.text).join("\n"),
        sentences: Object.freeze(
          captions.map((cue) =>
            Object.freeze({
              id: `${id}-caption-${cue.index}`,
              resourceId: id,
              order: cue.index,
              text: cue.text,
              translation: null,
              startMs: cue.startMs,
              endMs: cue.endMs,
              sourceAudioUri: null,
            }),
          ),
        ),
        mediaKind: "youtube" as const,
        sourceUrl: entry.sourceUrl,
        durationMs: entry.durationMs,
        thumbnailUri: entry.thumbnailUrl,
        createdAt: now,
        updatedAt: now,
      });
      onChange(
        Object.freeze({
          ...snapshot,
          resources: Object.freeze([resource, ...snapshot.resources]),
        }),
      );
      setNotice(`已加入资料库并导入 ${captions.length} 条英文字幕；现在可在资料库进入逐句学习。`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "无法获取此视频的公开英文字幕。 ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>发现</Text>
          <Text style={styles.subtitle}>订阅长期内容来源；一次性链接仍通过导入处理。</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setManagerVisible(true)}
          style={styles.manageButton}
        >
          <Text style={styles.manageText}>管理频道</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedSource(null)}
          style={[styles.filter, !selectedSource && styles.filterActive]}
        >
          <Text style={[styles.filterText, !selectedSource && styles.filterTextActive]}>全部</Text>
        </Pressable>
        {subscriptions.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => setSelectedSource(item.id)}
            style={[styles.filter, selectedSource === item.id && styles.filterActive]}
          >
            <Text
              numberOfLines={1}
              style={[styles.filterText, selectedSource === item.id && styles.filterTextActive]}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {entries.length ? (
        <View style={styles.feed}>
          {entries.map((entry) => {
            const exists = snapshot.resources.some(
              (resource) => resource.sourceUrl === entry.sourceUrl,
            );
            return (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryArtwork}>
                  <Rss color={theme.colors.accent} size={20} />
                </View>
                <View style={styles.entryCopy}>
                  <Text numberOfLines={2} style={styles.entryTitle}>
                    {entry.title}
                  </Text>
                  <Text numberOfLines={2} style={styles.entryMeta}>
                    {entry.description || "频道未提供文字摘要"}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={exists}
                  onPress={() => void addEntry(entry)}
                  style={[styles.addButton, exists && styles.addButtonDisabled]}
                >
                  {exists ? (
                    <Check color={theme.colors.mutedText} size={17} />
                  ) : (
                    <Plus color={theme.colors.canvas} size={17} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Rss color={theme.colors.accent} size={26} />
          <Text style={styles.emptyTitle}>订阅后，这里会显示真实频道内容。</Text>
          <Text style={styles.emptyCopy}>
            当前不会生成演示 Feed。可先管理频道，或用首页的导入处理某一条链接。
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setManagerVisible(true)}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>添加频道</Text>
          </Pressable>
        </View>
      )}
      <Modal
        transparent
        animationType="fade"
        visible={managerVisible}
        onRequestClose={() => setManagerVisible(false)}
      >
        <View style={styles.modal}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setManagerVisible(false)}
            style={styles.backdrop}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>管理频道</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setManagerVisible(false)}
                style={styles.close}
              >
                <X color={theme.colors.text} size={18} />
              </Pressable>
            </View>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              placeholder="粘贴 YouTube 频道、@handle 或播放列表链接"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void addSubscription()}
              style={styles.subscribe}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.canvas} />
              ) : (
                <Text style={styles.subscribeText}>订阅</Text>
              )}
            </Pressable>
            <Text style={styles.label}>推荐频道</Text>
            {RECOMMENDED_CHANNELS.map((item) => (
              <Pressable
                key={item.url}
                accessibilityRole="button"
                onPress={() => void addSubscription(item.url)}
                style={styles.recommend}
              >
                <Text style={styles.recommendTitle}>{item.title}</Text>
                <Text style={styles.recommendCopy}>{item.language}</Text>
                <Plus color={theme.colors.accent} size={17} />
              </Pressable>
            ))}
            <Text style={styles.label}>你的频道</Text>
            {subscriptions.map((item) => (
              <View key={item.id} style={styles.subscription}>
                <View style={styles.subCopy}>
                  <Text style={styles.recommendTitle}>{item.title}</Text>
                  <Text style={styles.recommendCopy}>
                    {item.lastError ?? (item.lastFetchedAt ? "已刷新" : "待刷新")}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void refreshSubscription(item)}
                  style={styles.icon}
                >
                  <RefreshCw color={theme.colors.accent} size={17} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => removeSubscription(item.id)}
                  style={styles.icon}
                >
                  <X color={theme.colors.mutedText} size={17} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}
function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { gap: 16, paddingHorizontal: 20, paddingTop: 4 },
    header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
    title: { color: theme.colors.text, fontSize: 29, fontWeight: "600" },
    subtitle: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      maxWidth: "76%",
    },
    manageButton: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      minHeight: 38,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    manageText: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
    filters: { gap: 8 },
    filter: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      maxWidth: 140,
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    filterActive: { backgroundColor: theme.colors.accent },
    filterText: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "700" },
    filterTextActive: { color: theme.colors.canvas },
    notice: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19 },
    feed: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 16, overflow: "hidden" },
    entry: {
      alignItems: "center",
      flexDirection: "row",
      gap: 11,
      minHeight: 88,
      paddingHorizontal: 13,
    },
    entryArtwork: {
      alignItems: "center",
      backgroundColor: theme.colors.canvas,
      borderRadius: 10,
      height: 52,
      justifyContent: "center",
      width: 52,
    },
    entryCopy: { flex: 1, gap: 5 },
    entryTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 },
    entryMeta: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    addButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 999,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    addButtonDisabled: { backgroundColor: theme.colors.canvas },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 16,
      gap: 10,
      padding: 24,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600", textAlign: "center" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19, textAlign: "center" },
    emptyButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: 999,
      marginTop: 4,
      minHeight: 42,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    emptyButtonText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "600" },
    modal: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.5)" },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      gap: 10,
      maxHeight: "85%",
      padding: 20,
      paddingBottom: 32,
    },
    sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    sheetTitle: { color: theme.colors.text, fontSize: 22, fontWeight: "600" },
    close: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    input: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      color: theme.colors.text,
      fontSize: 14,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    subscribe: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 46,
    },
    subscribeText: { color: theme.colors.canvas, fontSize: 15, fontWeight: "600" },
    label: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.4,
      marginTop: 7,
    },
    recommend: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 9,
      minHeight: 50,
      paddingHorizontal: 13,
    },
    recommendTitle: { color: theme.colors.text, flex: 1, fontSize: 14, fontWeight: "600" },
    recommendCopy: { color: theme.colors.mutedText, fontSize: 12 },
    subscription: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      minHeight: 54,
      paddingHorizontal: 13,
    },
    subCopy: { flex: 1, gap: 2 },
    icon: {
      alignItems: "center",
      borderRadius: 999,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
  });
}
