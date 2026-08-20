import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type ViewToken } from "react-native";
import { LocateFixed, Volume2 } from "lucide-react-native";
import type { Theme } from "../../../app/theme";

export type TranscriptPanelCue = Readonly<{
  id: string;
  order: number;
  text: string;
  translation: string | null;
  startMs: number | null;
}>;

type Props = Readonly<{
  cues: readonly TranscriptPanelCue[];
  activeCueId: string | null;
  followTranscript: boolean;
  showOriginal: boolean;
  showTranslation: boolean;
  onFollowChange: (follow: boolean) => void;
  onCuePress: (cue: TranscriptPanelCue) => void;
  theme: Theme;
}>;

export function TranscriptPanel({
  cues,
  activeCueId,
  followTranscript,
  showOriginal,
  showTranslation,
  onFollowChange,
  onCuePress,
  theme,
}: Props) {
  const styles = useStyles(theme);
  const listRef = useRef<FlatList<TranscriptPanelCue>>(null);
  const visibleCueIdsRef = useRef(new Set<string>());
  const userScrollRef = useRef(false);
  const [isUserBrowsing, setIsUserBrowsing] = useState(false);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      visibleCueIdsRef.current = new Set(
        viewableItems.flatMap((item) =>
          typeof item.item === "object" && item.item ? [item.item.id] : [],
        ),
      );
    },
    [],
  );

  const returnToActiveCue = useCallback(() => {
    if (!activeCueId) return;
    const index = cues.findIndex((cue) => cue.id === activeCueId);
    if (index < 0) return;
    userScrollRef.current = false;
    setIsUserBrowsing(false);
    onFollowChange(true);
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 });
  }, [activeCueId, cues, onFollowChange]);

  useEffect(() => {
    if (!followTranscript || !activeCueId || userScrollRef.current) return;
    if (visibleCueIdsRef.current.has(activeCueId)) return;
    const scrollTimer = setTimeout(returnToActiveCue, 0);
    return () => clearTimeout(scrollTimer);
  }, [activeCueId, followTranscript, returnToActiveCue]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>字幕轨道</Text>
          <Text style={styles.meta}>{cues.length} 条 · 点字幕跳转到对应位置</Text>
        </View>
        {!followTranscript || isUserBrowsing ? (
          <Pressable
            accessibilityRole="button"
            onPress={returnToActiveCue}
            style={styles.returnPill}
          >
            <LocateFixed color={theme.colors.canvas} size={15} />
            <Text style={styles.returnText}>回到当前句</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        ref={listRef}
        data={cues}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const active = item.id === activeCueId;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onCuePress(item)}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.rail, active && styles.railActive]} />
              <View style={styles.copy}>
                {showOriginal ? (
                  <Text style={[styles.original, active && styles.originalActive]}>
                    {item.text}
                  </Text>
                ) : null}
                {showTranslation && item.translation ? (
                  <Text style={styles.translation}>{item.translation}</Text>
                ) : null}
              </View>
              {active ? (
                <Volume2 color={theme.colors.accent} size={17} />
              ) : (
                <Text style={styles.order}>{String(item.order).padStart(2, "0")}</Text>
              )}
            </Pressable>
          );
        }}
        onScrollBeginDrag={() => {
          userScrollRef.current = true;
          setIsUserBrowsing(true);
          onFollowChange(false);
        }}
        onScrollToIndexFailed={({ index }) =>
          listRef.current?.scrollToOffset({ offset: Math.max(0, index * 72), animated: true })
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 65 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function useStyles(theme: Theme) {
  const [styles] = useState(() =>
    StyleSheet.create({
      container: { flex: 1, minHeight: 280 },
      header: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
      },
      title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
      meta: { color: theme.colors.mutedText, fontSize: 11, marginTop: 3 },
      returnPill: {
        alignItems: "center",
        backgroundColor: theme.colors.accent,
        borderRadius: 999,
        flexDirection: "row",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
      },
      returnText: { color: theme.colors.canvas, fontSize: 12, fontWeight: "700" },
      list: { paddingBottom: 22 },
      row: {
        alignItems: "center",
        borderBottomColor: theme.colors.divider,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: 12,
        minHeight: 72,
        paddingHorizontal: 20,
        paddingVertical: 12,
      },
      rowActive: { backgroundColor: theme.colors.surface },
      rail: { backgroundColor: theme.colors.divider, height: 32, width: 2 },
      railActive: { backgroundColor: theme.colors.accent, height: 44 },
      copy: { flex: 1, gap: 5 },
      original: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
      originalActive: { fontWeight: "700" },
      translation: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
      order: { color: theme.colors.mutedText, fontSize: 11, fontVariant: ["tabular-nums"] },
      pressed: { opacity: 0.78 },
    }),
  );
  return styles;
}
