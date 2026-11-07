import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { LocateFixed, Volume2 } from "lucide-react-native";
import type { Theme } from "../../../app/theme";
import { studyAccent, studyHighlight } from "../../study-appearance";

export type TranscriptPanelCue = Readonly<{
  id: string;
  order: number;
  text: string;
  translation: string | null;
  startMs: number | null;
}>;

type Props = Readonly<{
  header: ReactElement;
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
  header,
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
  const headerHeight = useRef(0);
  const lastActiveCueId = useRef(activeCueId);
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
    const changed = activeCueId !== lastActiveCueId.current;
    lastActiveCueId.current = activeCueId;
    if (!changed || !followTranscript || !activeCueId || userScrollRef.current) return;
    if (visibleCueIdsRef.current.has(activeCueId)) return;
    const scrollTimer = setTimeout(returnToActiveCue, 0);
    return () => clearTimeout(scrollTimer);
  }, [activeCueId, followTranscript, returnToActiveCue]);

  return (
    <FlatList
      ref={listRef}
      data={cues}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View
          onLayout={({ nativeEvent }) => {
            headerHeight.current = nativeEvent.layout.height;
          }}
        >
          {header}
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
      }
      renderItem={({ item }) => {
        const active = item.id === activeCueId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onCuePress(item)}
            style={({ pressed }) => [
              styles.row,
              active && styles.rowActive,
              pressed && styles.pressed,
            ]}
          >
            <Volume2 color={active ? studyAccent(theme) : theme.colors.mutedText} size={17} />
            <View style={styles.copy}>
              {showOriginal ? (
                <Text style={[styles.original, active && styles.originalActive]}>{item.text}</Text>
              ) : null}
              {showTranslation && item.translation ? (
                <Text style={styles.translation}>{item.translation}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
      onScrollBeginDrag={() => {
        userScrollRef.current = true;
        setIsUserBrowsing(true);
        onFollowChange(false);
      }}
      onScrollToIndexFailed={({ index, averageItemLength }) =>
        listRef.current?.scrollToOffset({
          offset: headerHeight.current + index * averageItemLength,
          animated: true,
        })
      }
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 65 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.list}
    />
  );
}

function useStyles(theme: Theme) {
  return useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, minHeight: 0 },
        returnPill: {
          alignItems: "center",
          backgroundColor: theme.colors.accent,
          borderRadius: 999,
          flexDirection: "row",
          gap: 6,
          minHeight: 48,
          alignSelf: "flex-end",
          margin: 12,
          paddingHorizontal: 12,
        },
        returnText: { color: theme.colors.canvas, fontSize: 12, fontWeight: "700" },
        list: { paddingBottom: 76 },
        row: {
          alignItems: "center",
          borderBottomColor: theme.colors.divider,
          borderBottomWidth: StyleSheet.hairlineWidth,
          flexDirection: "row",
          gap: 12,
          minHeight: 48,
          marginHorizontal: 16,
          paddingHorizontal: 8,
          paddingVertical: 8,
        },
        rowActive: { backgroundColor: studyHighlight(theme), borderRadius: theme.radius.small },
        copy: { flex: 1, gap: 5 },
        original: {
          color: theme.colors.text,
          fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
          fontSize: 18,
          lineHeight: 25,
        },
        originalActive: { color: studyAccent(theme), fontWeight: "600" },
        translation: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
        pressed: { opacity: 0.78 },
      }),
    [theme],
  );
}
