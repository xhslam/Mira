import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Focus,
  Languages,
  Pause,
  Play,
  Repeat2,
  Volume2,
} from "lucide-react-native";

import type { Theme } from "../app/theme";
import type { LearningResource, LearningSentence } from "./learning-types";
import { VideoPreview } from "./video-preview";
import { BilibiliPreview } from "./bilibili-preview";

type LearningMode = "normal" | "dictation" | "shadowing" | "cards";

const MODES: readonly Readonly<{ id: LearningMode; label: string }>[] = [
  { id: "normal", label: "正常" },
  { id: "dictation", label: "听写" },
  { id: "shadowing", label: "跟读" },
  { id: "cards", label: "词卡" },
];

export type VideoLearningPlayerProps = Readonly<{
  resource: LearningResource;
  sentences: readonly LearningSentence[];
  selectedSentence: LearningSentence;
  theme: Theme;
  positionMs: number;
  durationMs: number | null;
  playing: boolean;
  playbackRate: number;
  repeat: boolean;
  showTranslation: boolean;
  hasMissingTranslations: boolean;
  translationBusy: boolean;
  onSelectSentence: (sentenceId: string) => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (positionMs: number) => void;
  onCycleRate: () => void;
  onToggleRepeat: () => void;
  onToggleTranslation: () => void;
  onGenerateTranslation: () => void;
  onOpenFocus: () => void;
  onPositionMsChange: (positionMs: number) => void;
}>;

function formatTime(value: number | null) {
  const seconds = Math.max(0, Math.floor((value ?? 0) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function isVideoResource(resource: LearningResource) {
  return resource.mediaKind === "video" || resource.mediaKind === "bilibili";
}

export function VideoLearningPlayer({
  resource,
  sentences,
  selectedSentence,
  theme,
  positionMs,
  durationMs,
  playing,
  playbackRate,
  repeat,
  showTranslation,
  hasMissingTranslations,
  translationBusy,
  onSelectSentence,
  onTogglePlayback,
  onPrevious,
  onNext,
  onSeek,
  onCycleRate,
  onToggleRepeat,
  onToggleTranslation,
  onGenerateTranslation,
  onOpenFocus,
  onPositionMsChange,
}: VideoLearningPlayerProps) {
  const [mode, setMode] = useState<LearningMode>("normal");
  const [progressWidth, setProgressWidth] = useState(0);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selectedIndex = Math.max(
    0,
    sentences.findIndex((item) => item.id === selectedSentence.id),
  );
  const progress =
    durationMs && durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex < sentences.length - 1;

  function chooseMode(nextMode: LearningMode) {
    setMode(nextMode);
    if (nextMode === "dictation" && showTranslation) onToggleTranslation();
    if (nextMode === "cards" && !showTranslation) onToggleTranslation();
    if (nextMode === "shadowing" && !repeat) onToggleRepeat();
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isVideoResource(resource) ? (
          <View style={styles.videoFrame}>
            {resource.mediaKind === "bilibili" && resource.sourceUrl ? (
              <BilibiliPreview
                sourceUrl={resource.sourceUrl}
                positionMs={positionMs}
                playing={playing}
                playbackRate={playbackRate}
                onPositionMsChange={onPositionMsChange}
              />
            ) : resource.mediaUri ? (
              <VideoPreview
                uri={resource.mediaUri}
                positionMs={positionMs}
                playing={playing}
                playbackRate={playbackRate}
                onPositionMsChange={onPositionMsChange}
              />
            ) : null}
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>{resource.title}</Text>
            </View>
          </View>
        ) : null}

        <View accessibilityRole="tablist" style={styles.modeRail}>
          {MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => chooseMode(item.id)}
                style={({ pressed }) => [styles.modeTab, pressed && styles.pressed]}
              >
                <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
                  {item.label}
                </Text>
                {selected ? <View style={styles.modeIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.lessonHeading}>
          <Text style={styles.lessonKicker}>
            {mode === "dictation"
              ? "听写练习"
              : mode === "shadowing"
                ? "跟读练习"
                : mode === "cards"
                  ? "词卡学习"
                  : "同步字幕"}
          </Text>
          <Text numberOfLines={1} style={styles.lessonTitle}>
            {resource.title}
          </Text>
        </View>

        <View style={styles.activeCard}>
          <View style={styles.cardMeta}>
            <Text style={styles.order}>{String(selectedSentence.order).padStart(2, "0")}</Text>
            <Text style={styles.timestamp}>
              {formatTime(selectedSentence.startMs)} – {formatTime(selectedSentence.endMs)}
            </Text>
            <Volume2 color={theme.colors.accent} size={18} />
          </View>
          <Text style={styles.original}>{selectedSentence.text}</Text>
          {showTranslation ? (
            <Text style={styles.translation}>
              {selectedSentence.translation ?? "这句暂时没有译文。"}
            </Text>
          ) : (
            <Text style={styles.translationHint}>先听一遍；需要时可点下方「字幕」显示译文。</Text>
          )}
          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onTogglePlayback}
              style={styles.cardAction}
            >
              <Play color={theme.colors.accent} fill={theme.colors.accent} size={16} />
              <Text style={styles.cardActionText}>播放本句</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onToggleRepeat}
              style={[styles.cardAction, repeat && styles.cardActionSelected]}
            >
              <Repeat2 color={repeat ? theme.colors.canvas : theme.colors.accent} size={16} />
              <Text style={[styles.cardActionText, repeat && styles.cardActionTextSelected]}>
                单句循环
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.transcriptHeader}>
          <View>
            <Text style={styles.transcriptTitle}>逐句精听</Text>
            <Text style={styles.transcriptMeta}>
              已定位第 {selectedSentence.order} 句 · 点按任一句跳转
            </Text>
          </View>
          <Captions color={theme.colors.primary} size={20} />
        </View>

        <View style={styles.transcriptList}>
          {sentences.map((item) => {
            const selected = item.id === selectedSentence.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => onSelectSentence(item.id)}
                style={({ pressed }) => [
                  styles.transcriptCard,
                  selected && styles.transcriptCardSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.transcriptMetaRow}>
                  <Text
                    style={[styles.transcriptOrder, selected && styles.transcriptOrderSelected]}
                  >
                    {String(item.order).padStart(2, "0")}
                  </Text>
                  <Text style={styles.transcriptTime}>
                    {formatTime(item.startMs)} – {formatTime(item.endMs)}
                  </Text>
                  {selected ? <Volume2 color={theme.colors.primary} size={17} /> : null}
                </View>
                <Text
                  style={[styles.transcriptOriginal, selected && styles.transcriptOriginalSelected]}
                >
                  {item.text}
                </Text>
                {showTranslation && item.translation ? (
                  <Text style={styles.transcriptTranslation}>{item.translation}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.controlDock}>
        {resource.mediaKind === "bilibili" ? (
          <View
            accessibilityLabel="哔哩哔哩外链播放器说明"
            accessibilityRole="summary"
            style={[
              styles.focusButton,
              { alignItems: "flex-start", flexDirection: "column", gap: 7 },
            ]}
          >
            <Text style={styles.focusButtonText}>使用哔哩哔哩播放器控制播放</Text>
            <Text
              style={[
                styles.focusButtonText,
                { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
              ]}
            >
              播放、进度与倍速请在上方官方播放器中操作。选择字幕仅切换学习内容，不会控制外链播放器的位置。
            </Text>
            {hasMissingTranslations ? (
              <ControlButton
                icon={Languages}
                label={translationBusy ? "翻译中" : "生成译文"}
                onPress={onGenerateTranslation}
                active={translationBusy}
                disabled={translationBusy}
                styles={styles}
                theme={theme}
              />
            ) : (
              <ControlButton
                icon={showTranslation ? Captions : EyeOff}
                label={showTranslation ? "隐藏字幕译文" : "显示字幕译文"}
                onPress={onToggleTranslation}
                active={showTranslation}
                styles={styles}
                theme={theme}
              />
            )}
          </View>
        ) : (
          <>
            <Pressable
              accessibilityLabel="拖动播放进度"
              accessibilityRole="adjustable"
              onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
              onPress={(event) => {
                if (!durationMs || progressWidth <= 0) return;
                onSeek((event.nativeEvent.locationX / progressWidth) * durationMs);
              }}
              style={styles.progressTrack}
            >
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
              <View style={[styles.progressThumb, { left: `${progress}%` }]} />
            </Pressable>
            <View style={styles.progressMeta}>
              <Text style={styles.progressText}>{formatTime(positionMs)}</Text>
              <Text style={styles.progressText}>
                {durationMs === null ? "—:—" : formatTime(durationMs)}
              </Text>
            </View>
            <View style={styles.controls}>
              <ControlButton
                icon={Focus}
                label={`${playbackRate}×`}
                onPress={onCycleRate}
                styles={styles}
                theme={theme}
              />
              {hasMissingTranslations ? (
                <ControlButton
                  icon={Languages}
                  label={translationBusy ? "翻译中" : "翻译"}
                  onPress={onGenerateTranslation}
                  active={translationBusy}
                  disabled={translationBusy}
                  styles={styles}
                  theme={theme}
                />
              ) : (
                <ControlButton
                  icon={showTranslation ? Captions : EyeOff}
                  label={showTranslation ? "隐藏" : "字幕"}
                  onPress={onToggleTranslation}
                  active={showTranslation}
                  styles={styles}
                  theme={theme}
                />
              )}
              <ControlButton
                icon={ChevronLeft}
                label="上句"
                onPress={onPrevious}
                disabled={!canGoPrevious}
                styles={styles}
                theme={theme}
              />
              <ControlButton
                icon={playing ? Pause : Play}
                label={playing ? "暂停" : "播放"}
                onPress={onTogglePlayback}
                active
                styles={styles}
                theme={theme}
              />
              <ControlButton
                icon={ChevronRight}
                label="下句"
                onPress={onNext}
                disabled={!canGoNext}
                styles={styles}
                theme={theme}
              />
              <ControlButton
                icon={Repeat2}
                label="精听"
                onPress={onToggleRepeat}
                active={repeat}
                styles={styles}
                theme={theme}
              />
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenFocus} style={styles.focusButton}>
              <Languages color={theme.colors.accent} size={16} />
              <Text style={styles.focusButtonText}>进入专注听力</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onPress,
  active = false,
  disabled = false,
  styles,
  theme,
}: Readonly<{
  icon: typeof Play;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        active && styles.controlButtonActive,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        color={active ? "#FFFFFF" : theme.colors.mutedText}
        fill={label === "播放" && active ? "#FFFFFF" : "transparent"}
        size={20}
      />
      <Text numberOfLines={1} style={[styles.controlLabel, active && styles.controlLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.colors.background, flex: 1 },
    scrollContent: { paddingBottom: 12 },
    videoFrame: { backgroundColor: "#101010", overflow: "hidden", position: "relative" },
    videoBadge: {
      backgroundColor: "rgba(0, 0, 0, 0.56)",
      bottom: 12,
      left: 12,
      maxWidth: "82%",
      paddingHorizontal: 9,
      paddingVertical: 5,
      position: "absolute",
    },
    videoBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
    modeRail: {
      backgroundColor: theme.colors.canvas,
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingHorizontal: 12,
    },
    modeTab: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 58,
      position: "relative",
    },
    modeLabel: { color: theme.colors.mutedText, fontSize: 15, fontWeight: "600" },
    modeLabelSelected: { color: theme.colors.text, fontWeight: "800" },
    modeIndicator: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.full,
      bottom: 0,
      height: 3,
      position: "absolute",
      width: 44,
    },
    lessonHeading: { gap: 3, paddingHorizontal: 18, paddingTop: 18 },
    lessonKicker: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.15,
    },
    lessonTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
    activeCard: {
      backgroundColor: theme.colors.canvas,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      gap: 13,
      marginHorizontal: 14,
      marginTop: 12,
      padding: 18,
      ...theme.shadows.sm,
    },
    cardMeta: { alignItems: "center", flexDirection: "row", gap: 9 },
    order: {
      color: theme.colors.primary,
      fontSize: 13,
      fontVariant: ["tabular-nums"],
      fontWeight: "800",
    },
    timestamp: {
      color: theme.colors.mutedText,
      flex: 1,
      fontSize: 12,
      fontVariant: ["tabular-nums"],
    },
    original: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 25,
      letterSpacing: -0.22,
      lineHeight: 35,
    },
    translation: { color: theme.colors.mutedText, fontSize: 15, lineHeight: 22 },
    translationHint: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    cardActions: {
      borderTopColor: theme.colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 8,
      paddingTop: 12,
    },
    cardAction: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      flexDirection: "row",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
    },
    cardActionSelected: { backgroundColor: theme.colors.primary },
    cardActionText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
    cardActionTextSelected: { color: "#FFFFFF" },
    transcriptHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingTop: 21,
    },
    transcriptTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
    transcriptMeta: { color: theme.colors.mutedText, fontSize: 11, marginTop: 3 },
    transcriptList: { gap: 10, paddingHorizontal: 14, paddingTop: 12 },
    transcriptCard: {
      backgroundColor: theme.colors.background,
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 7,
      paddingHorizontal: 6,
      paddingVertical: 14,
    },
    transcriptCardSelected: {
      backgroundColor: theme.colors.canvas,
      borderColor: theme.colors.primary,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
    },
    transcriptMetaRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    transcriptOrder: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
    },
    transcriptOrderSelected: { color: theme.colors.primary },
    transcriptTime: {
      color: theme.colors.mutedText,
      flex: 1,
      fontSize: 11,
      fontVariant: ["tabular-nums"],
    },
    transcriptOriginal: { color: theme.colors.text, fontSize: 17, lineHeight: 25 },
    transcriptOriginalSelected: { fontWeight: "800" },
    transcriptTranslation: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    controlDock: {
      backgroundColor: theme.colors.canvas,
      borderTopColor: theme.colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingBottom: 12,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    progressTrack: {
      backgroundColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.full,
      height: 5,
      position: "relative",
    },
    progressFill: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.full,
      height: "100%",
    },
    progressThumb: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.full,
      height: 14,
      marginLeft: -7,
      marginTop: -4.5,
      position: "absolute",
      top: 0,
      width: 14,
    },
    progressMeta: { flexDirection: "row", justifyContent: "space-between", paddingTop: 7 },
    progressText: { color: theme.colors.mutedText, fontSize: 11, fontVariant: ["tabular-nums"] },
    controls: { alignItems: "flex-start", flexDirection: "row", gap: 2, paddingTop: 8 },
    controlButton: {
      alignItems: "center",
      borderRadius: 13,
      flex: 1,
      gap: 4,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 1,
    },
    controlButtonActive: { backgroundColor: theme.colors.primary },
    controlLabel: { color: theme.colors.mutedText, fontSize: 10, fontWeight: "700" },
    controlLabelActive: { color: "#FFFFFF" },
    focusButton: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      flexDirection: "row",
      gap: 6,
      marginTop: 7,
      minHeight: 44,
      paddingHorizontal: 14,
    },
    focusButtonText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
    disabled: { opacity: 0.3 },
    pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  });
}
