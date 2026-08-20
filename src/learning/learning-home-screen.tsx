import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Mic,
  Play,
  Subtitles,
  Video,
} from "lucide-react-native";
import type { Theme } from "../app/theme";
import { resourceProgress } from "./learning-session";
import type { LearningImportIntent, LearningResource, LearningSnapshot } from "./learning-types";

type HomeProps = Readonly<{
  snapshot: LearningSnapshot;
  theme: Theme;
  onOpenImport: () => void;
  onOpenCraft: () => void;
  onOpenLibrary: () => void;
  onOpenResource: (resource: LearningResource) => void;
}>;

type ImportSheetProps = Readonly<{
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  onOpenLibrary: () => void;
  onSelectIntent?: (intent: Exclude<LearningImportIntent, null>) => void;
}>;

export function LearningHomeScreen(props: HomeProps) {
  const { snapshot, theme, onOpenImport, onOpenCraft, onOpenLibrary, onOpenResource } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const goalMinutes = Math.max(1, snapshot.goal.dailyMinutes);
  const studiedMinutes = Math.min(goalMinutes, snapshot.goal.practiceMinutesToday);
  const percent = Math.min(100, Math.round((studiedMinutes / goalMinutes) * 100));
  const recents = [...snapshot.resources]
    .sort((left, right) =>
      (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt),
    )
    .slice(0, 8);
  const currentResource = recents[0];
  const otherRecents = recents.slice(1);

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>今天</Text>
          <Text style={styles.title}>{currentResource ? "继续学习" : "添加学习材料"}</Text>
          <Text style={styles.subtitle}>
            {currentResource ? "从上次停下的位置开始。" : "导入文字、音频或视频，开始第一段学习。"}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenCraft} style={styles.craftButton}>
          <Text style={styles.craftText}>创建</Text>
        </Pressable>
      </View>

      {currentResource ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenResource(currentResource)}
          style={styles.continueItem}
        >
          <View style={styles.continueCopy}>
            <Text style={styles.continueLabel}>上次打开</Text>
            <Text numberOfLines={1} style={styles.continueTitle}>
              {currentResource.title}
            </Text>
            <Text numberOfLines={1} style={styles.continueMeta}>
              {resourceKind(currentResource)} · {currentResource.sentences.length} 句 · 已完成{" "}
              {resourceProgress(snapshot, currentResource)}%
            </Text>
          </View>
          <View style={styles.continueAction}>
            <Text style={styles.continueActionText}>继续</Text>
            <ChevronRight color={theme.colors.accent} size={17} />
          </View>
        </Pressable>
      ) : null}

      <View style={styles.goal}>
        <View style={styles.goalTop}>
          <View>
            <Text style={styles.goalLabel}>今日学习</Text>
            <Text style={styles.goalNumber}>
              {Math.round(studiedMinutes)}
              <Text style={styles.goalUnit}> / {goalMinutes} 分钟</Text>
            </Text>
          </View>
          <Text accessibilityLabel={`今日完成 ${percent}%`} style={styles.goalPercent}>
            {percent}%
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.goalCaption}>
          {percent === 0
            ? "完成任意一段练习后，这里会显示今天的进度。"
            : "播放和跟读时间已计入今日进度。"}
        </Text>
      </View>

      {otherRecents.length ? (
        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近资料</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onOpenLibrary}
              style={styles.libraryAction}
            >
              <Text style={styles.libraryActionText}>查看全部</Text>
              <ChevronRight color={theme.colors.accent} size={17} />
            </Pressable>
          </View>
          <View style={styles.list}>
            {otherRecents.map((resource, index) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                percent={resourceProgress(snapshot, resource)}
                index={index}
                theme={theme}
                styles={styles}
                onPress={() => onOpenResource(resource)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!currentResource ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>资料库还是空的</Text>
          <Text style={styles.emptyDescription}>导入后，你可以逐句阅读、查词、跟读和复习。</Text>
          <Pressable accessibilityRole="button" onPress={onOpenImport} style={styles.emptyAction}>
            <Text style={styles.emptyActionText}>导入资料</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ResourceRow(
  props: Readonly<{
    resource: LearningResource;
    percent: number;
    index: number;
    theme: Theme;
    styles: ReturnType<typeof createStyles>;
    onPress: () => void;
  }>,
) {
  const { resource, percent, index, theme, styles, onPress } = props;
  const Icon =
    resource.mediaKind === "video" ? Video : resource.mediaKind === "audio" ? Play : FileText;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={[styles.artwork, { backgroundColor: ARTWORKS[index % ARTWORKS.length] }]}>
        <Icon color="#FFFFFF" size={18} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {resource.title}
          </Text>
          {resource.provider === "craft" ? <Text style={styles.craftBadge}>创建</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {resourceKind(resource)} · {resource.sentences.length} 句 ·{" "}
          {resource.language || "未设置语言"}
        </Text>
        <View style={styles.smallTrack}>
          <View style={[styles.smallFill, { width: `${percent}%` }]} />
        </View>
      </View>
      <ChevronRight color={theme.colors.mutedText} size={18} />
    </Pressable>
  );
}

export function LearningImportSheet(props: ImportSheetProps) {
  const { visible, theme, onClose, onOpenLibrary, onSelectIntent } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const options: readonly Readonly<{
    intent: Exclude<LearningImportIntent, null>;
    title: string;
    description: string;
    icon: typeof Mic;
  }>[] = Object.freeze([
    Object.freeze({
      intent: "recording",
      title: "录音",
      description: "边录边转写，保存为可逐句学习的音频",
      icon: Mic,
    }),
    Object.freeze({
      intent: "url",
      title: "通过 URL 导入",
      description: "导入网页、哔哩哔哩公开链接或播客内容",
      icon: ChevronRight,
    }),
    Object.freeze({
      intent: "subtitle",
      title: "导入 SRT / VTT 字幕",
      description: "为资料库中已选视频绑定本地时间轴",
      icon: Subtitles,
    }),
    Object.freeze({
      intent: "local",
      title: "从本地导入",
      description: "选择音频、视频或文件中的学习材料",
      icon: FolderOpen,
    }),
    Object.freeze({
      intent: "photo",
      title: "从相册导入",
      description: "将手机中的视频整理为学习材料",
      icon: Video,
    }),
    Object.freeze({
      intent: "text",
      title: "导入文字",
      description: "粘贴或选择 Markdown、文本文件",
      icon: FileText,
    }),
  ]);

  function choose(intent: Exclude<LearningImportIntent, null>) {
    onClose();
    const handler = onSelectIntent ?? (() => onOpenLibrary());
    handler(intent);
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭导入面板"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetTitle}>导入资料</Text>
              <Text style={styles.sheetDescription}>选择一种来源。</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneButton}>
              <Text style={styles.doneText}>关闭</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.options}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.optionsScroll}
          >
            {options.map(({ intent, title, description, icon: Icon }) => (
              <Pressable
                key={intent}
                accessibilityRole="button"
                onPress={() => choose(intent)}
                style={styles.option}
              >
                <View style={styles.optionIcon}>
                  <Icon color={theme.colors.mutedText} size={19} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionDescription}>{description}</Text>
                </View>
                <ChevronRight color={theme.colors.mutedText} size={18} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function resourceKind(resource: LearningResource): string {
  return resource.mediaKind === "video" ? "视频" : resource.mediaKind === "audio" ? "音频" : "文本";
}

const ARTWORKS = ["#3E496A", "#31525B", "#6A493E", "#4D4263", "#5C5137", "#3D465E"] as const;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { gap: 32, paddingHorizontal: 20, paddingTop: 8 },
    hero: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
    },
    heroCopy: { flex: 1, gap: 4 },
    eyebrow: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "500" },
    title: {
      color: theme.colors.text,
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: -0.8,
      lineHeight: 37,
    },
    subtitle: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20, marginTop: 2 },
    craftButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 4 },
    craftText: { color: theme.colors.accent, fontSize: 15, fontWeight: "600" },
    continueItem: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderLeftColor: theme.colors.accent,
      borderLeftWidth: 2,
      borderRadius: 12,
      flexDirection: "row",
      gap: 12,
      minHeight: 96,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    continueCopy: { flex: 1, gap: 4, minWidth: 0 },
    continueLabel: { color: theme.colors.mutedText, fontSize: 12 },
    continueTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600", lineHeight: 22 },
    continueMeta: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    continueAction: { alignItems: "center", flexDirection: "row", gap: 1 },
    continueActionText: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" },
    goal: { gap: 8 },
    goalTop: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
    goalLabel: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "500" },
    goalNumber: {
      color: theme.colors.text,
      fontSize: 25,
      fontWeight: "600",
      letterSpacing: -0.5,
      lineHeight: 33,
      marginTop: 2,
    },
    goalUnit: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "400", letterSpacing: 0 },
    goalPercent: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontWeight: "500",
      paddingBottom: 3,
    },
    track: {
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 4,
      overflow: "hidden",
    },
    fill: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, height: "100%" },
    goalCaption: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    recentSection: { gap: 12 },
    sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 19,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    libraryAction: { alignItems: "center", flexDirection: "row", gap: 1, minHeight: 32 },
    libraryActionText: { color: theme.colors.accent, fontSize: 14, fontWeight: "500" },
    list: { borderTopColor: theme.colors.divider, borderTopWidth: StyleSheet.hairlineWidth },
    row: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 76,
      paddingVertical: 10,
    },
    artwork: {
      alignItems: "center",
      borderRadius: 8,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    rowCopy: { flex: 1, gap: 5, minWidth: 0 },
    rowTitleLine: { alignItems: "center", flexDirection: "row", gap: 6 },
    rowTitle: { color: theme.colors.text, flex: 1, fontSize: 15, fontWeight: "500" },
    craftBadge: { color: theme.colors.accent, fontSize: 11, fontWeight: "500" },
    rowMeta: { color: theme.colors.mutedText, fontSize: 12 },
    smallTrack: {
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 3,
      overflow: "hidden",
    },
    smallFill: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      height: "100%",
    },
    empty: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
      paddingVertical: 24,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600" },
    emptyDescription: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    emptyAction: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.medium,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 42,
      paddingHorizontal: 16,
    },
    emptyActionText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "600" },
    modalRoot: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
    sheet: {
      backgroundColor: theme.colors.canvas,
      borderTopLeftRadius: theme.radius.large,
      borderTopRightRadius: theme.radius.large,
      maxHeight: "80%",
      paddingBottom: 28,
      paddingHorizontal: 20,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 4,
      marginBottom: 16,
      marginTop: 10,
      width: 36,
    },
    sheetHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      paddingBottom: 12,
    },
    sheetCopy: { flex: 1, gap: 4 },
    sheetTitle: { color: theme.colors.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.3 },
    sheetDescription: { color: theme.colors.mutedText, fontSize: 13 },
    doneButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 2 },
    doneText: { color: theme.colors.accent, fontSize: 14, fontWeight: "500" },
    optionsScroll: { flexShrink: 1 },
    options: { paddingBottom: 4 },
    option: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 68,
      paddingVertical: 10,
    },
    optionIcon: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
    optionCopy: { flex: 1, gap: 3 },
    optionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "500" },
    optionDescription: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
  });
}
