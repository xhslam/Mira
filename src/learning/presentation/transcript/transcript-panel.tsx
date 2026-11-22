import { useCallback, useEffect, useMemo, useRef, type ReactElement } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { Volume2 } from "lucide-react-native";
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
  focusOnCuePress?: boolean;
  revealHeaderOffset?: number;
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
  focusOnCuePress = false,
  revealHeaderOffset,
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

  useEffect(() => {
    if (revealHeaderOffset === undefined) return;
    listRef.current?.scrollToOffset({ offset: revealHeaderOffset, animated: true });
  }, [revealHeaderOffset]);

  const scrollToActiveCue = useCallback(() => {
    if (!activeCueId || userScrollRef.current) return;
    const index = cues.findIndex((cue) => cue.id === activeCueId);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 });
  }, [activeCueId, cues]);

  useEffect(() => {
    const changed = activeCueId !== lastActiveCueId.current;
    lastActiveCueId.current = activeCueId;
    if (!changed || !followTranscript || !activeCueId || userScrollRef.current) return;
    if (visibleCueIdsRef.current.has(activeCueId)) return;
    const scrollTimer = setTimeout(scrollToActiveCue, 0);
    return () => clearTimeout(scrollTimer);
  }, [activeCueId, followTranscript, scrollToActiveCue]);

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
        </View>
      }
      renderItem={({ item }) => {
        const active = item.id === activeCueId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              userScrollRef.current = false;
              onFollowChange(true);
              onCuePress(item);
              if (focusOnCuePress) listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
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
