import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Link2,
  Play,
  Sparkles,
  Subtitles,
  Video,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import type { Theme } from "../app/theme";
import { resourceProgress } from "./learning-session";
import type { LearningImportIntent, LearningResource, LearningSnapshot } from "./learning-types";

type HomeProps = Readonly<{
  snapshot: LearningSnapshot;
  theme: Theme;
  onOpenImport: () => void;
  onOpenLibrary: () => void;
  onOpenResource: (resource: LearningResource) => void;
}>;

type ImportSheetProps = Readonly<{
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  onOpenCraft: () => void;
  onOpenUrl: () => void;
  onSelectIntent?: (intent: Exclude<LearningImportIntent, null>) => void;
}>;

export function LearningHomeScreen(props: HomeProps) {
  const { snapshot, theme, onOpenImport, onOpenLibrary, onOpenResource } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const goalMinutes = Math.max(1, snapshot.goal.dailyMinutes);
  const studiedMinutes = Math.min(goalMinutes, snapshot.goal.practiceMinutesToday);
  const percent = Math.min(100, Math.round((studiedMinutes / goalMinutes) * 100));
  const recents = [...snapshot.resources]
    .sort((left, right) =>
      (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt),
    )
    .slice(0, 4);
  const currentResource = recents[0];
  const otherRecents = recents.slice(1);

  return (
    <View style={styles.screen}>
      {currentResource ? (
        <View style={styles.continueSection}>
          <Text style={styles.sectionTitle}>继续学习</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenResource(currentResource)}
            style={({ pressed }) => [styles.continueItem, pressed && styles.pressed]}
          >
            <View style={styles.continueArtwork}>
              <ResourceMediaIcon color={theme.colors.text} resource={currentResource} size={27} />
            </View>
            <View style={styles.continueCopy}>
              <Text numberOfLines={1} style={styles.continueTitle}>
                {currentResource.title}
              </Text>
              <Text numberOfLines={1} style={styles.continueMeta}>
                {resourceKind(currentResource)} · {currentResource.sentences.length} 句
              </Text>
              <View style={styles.continueProgressTrack}>
                <View
                  style={[
                    styles.continueProgressFill,
                    { width: `${resourceProgress(snapshot, currentResource)}%` },
                  ]}
                />
              </View>
              <Text style={styles.continueProgressText}>
                已完成 {resourceProgress(snapshot, currentResource)}%
              </Text>
            </View>
            <View style={styles.continueAction}>
              <Play color="#FFFFFF" fill="#FFFFFF" size={17} />
            </View>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.goal}>
        <View style={styles.goalCopy}>
          <Text style={styles.goalLabel}>今日学习</Text>
          <Text style={styles.goalNumber}>
            {Math.round(studiedMinutes)}
            <Text style={styles.goalUnit}> / {goalMinutes} 分钟</Text>
          </Text>
          <Text style={styles.goalCaption}>
            {percent === 0 ? "从一段喜欢的内容开始。" : "播放和跟读时间已计入进度。"}
          </Text>
        </View>
        <ProgressRing percent={percent} theme={theme} />
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.artwork, { backgroundColor: ARTWORKS[index % ARTWORKS.length] }]}>
        <ResourceMediaIcon color="#FFFFFF" resource={resource} size={18} />
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

function ProgressRing({ percent, theme }: Readonly<{ percent: number; theme: Theme }>) {
  const size = 58;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View accessibilityLabel={`今日完成 ${percent}%`} style={stylesForRing.ring}>
      <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={theme.colors.divider}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          origin={`${size / 2}, ${size / 2}`}
          r={radius}
          rotation={-90}
          stroke={theme.colors.accent}
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - percent / 100)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
      <Text style={stylesForRing.text}>{percent}%</Text>
    </View>
  );
}

export function LearningImportSheet(props: ImportSheetProps) {
  const { visible, theme, onClose, onOpenCraft, onOpenUrl, onSelectIntent } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const options: readonly Readonly<{
    intent: Exclude<LearningImportIntent, null>;
    title: string;
    description: string;
    icon: typeof FileText;
  }>[] = Object.freeze([
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
  ]);

  function choose(intent: Exclude<LearningImportIntent, null>) {
    onClose();
    onSelectIntent?.(intent);
  }

  function chooseCraft() {
    onClose();
    onOpenCraft();
  }

  function chooseUrl() {
    onClose();
    onOpenUrl();
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
            <Pressable
              accessibilityLabel="创建学习材料"
              accessibilityRole="button"
              onPress={chooseCraft}
              style={styles.option}
            >
              <View style={styles.optionIcon}>
                <Sparkles color={theme.colors.accent} size={19} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>创建学习材料</Text>
                <Text style={styles.optionDescription}>翻译、改写并生成可反复练习的材料</Text>
              </View>
              <ChevronRight color={theme.colors.mutedText} size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel="通过 URL 导入"
              accessibilityRole="button"
              onPress={chooseUrl}
              style={styles.option}
            >
              <View style={styles.optionIcon}>
                <Link2 color={theme.colors.mutedText} size={19} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>通过 URL 导入</Text>
                <Text style={styles.optionDescription}>网页或哔哩哔哩公开链接</Text>
              </View>
              <ChevronRight color={theme.colors.mutedText} size={18} />
            </Pressable>
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
  return resource.mediaKind === "video" ||
    resource.mediaKind === "youtube" ||
    resource.mediaKind === "bilibili"
    ? "视频"
    : resource.mediaKind === "audio"
      ? "音频"
      : "文本";
}

function ResourceMediaIcon({
  color,
  resource,
  size,
}: Readonly<{ color: string; resource: LearningResource; size: number }>) {
  if (
    resource.mediaKind === "video" ||
    resource.mediaKind === "youtube" ||
    resource.mediaKind === "bilibili"
  ) {
    return <Video color={color} size={size} strokeWidth={1.8} />;
  }
  if (resource.mediaKind === "audio") {
    return <Play color={color} size={size} strokeWidth={1.8} />;
  }
  return <FileText color={color} size={size} strokeWidth={1.8} />;
}

const ARTWORKS = ["#3E496A", "#31525B", "#6A493E", "#4D4263", "#5C5137", "#3D465E"] as const;

const stylesForRing = StyleSheet.create({
  ring: { alignItems: "center", height: 58, justifyContent: "center", width: 58 },
  text: { color: "#A9B5C9", fontSize: 11, fontWeight: "700", position: "absolute" },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      gap: theme.spacing[4],
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[4],
    },
    continueSection: { gap: theme.spacing[2] },
    continueItem: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: theme.spacing[3],
      minHeight: 118,
      overflow: "hidden",
      padding: theme.spacing[3],
      ...theme.shadows.sm,
    },
    continueArtwork: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.medium,
      height: 88,
      justifyContent: "center",
      width: 88,
    },
    continueCopy: { flex: 1, gap: 4, minWidth: 0 },
    continueTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700", lineHeight: 22 },
    continueMeta: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    continueProgressTrack: {
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 4,
      marginTop: 3,
      overflow: "hidden",
    },
    continueProgressFill: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      height: "100%",
    },
    continueProgressText: { color: theme.colors.mutedText, fontSize: 11 },
    continueAction: {
      alignItems: "center",
      alignSelf: "flex-end",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      height: 38,
      justifyContent: "center",
      width: 38,
      ...theme.shadows.sm,
    },
    goal: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing[4],
      paddingVertical: 14,
      ...theme.shadows.sm,
    },
    goalCopy: { flex: 1, gap: 2 },
    goalLabel: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    goalNumber: {
      color: theme.colors.text,
      fontSize: 25,
      fontWeight: "700",
      letterSpacing: -0.5,
      lineHeight: 33,
    },
    goalUnit: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "400", letterSpacing: 0 },
    goalCaption: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    recentSection: { gap: theme.spacing[3] },
    sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    libraryAction: { alignItems: "center", flexDirection: "row", gap: 1, minHeight: 32 },
    libraryActionText: { color: theme.colors.primary, fontSize: 14, fontWeight: "600" },
    list: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      paddingHorizontal: theme.spacing[3],
      ...theme.shadows.sm,
    },
    row: {
      alignItems: "center",
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: theme.spacing[3],
      minHeight: 76,
      paddingVertical: 10,
    },
    artwork: {
      alignItems: "center",
      borderRadius: theme.radius.medium,
      height: 42,
      justifyContent: "center",
      width: 42,
      backgroundColor: theme.colors.surfaceMuted,
    },
    rowCopy: { flex: 1, gap: 5, minWidth: 0 },
    rowTitleLine: { alignItems: "center", flexDirection: "row", gap: 6 },
    rowTitle: { color: theme.colors.text, flex: 1, fontSize: 15, fontWeight: "600" },
    craftBadge: {
      color: theme.colors.primaryText,
      backgroundColor: theme.colors.primarySoft,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      overflow: "hidden",
      fontSize: 11,
      fontWeight: "600",
    },
    rowMeta: { color: theme.colors.mutedText, fontSize: 12 },
    smallTrack: {
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 3,
      overflow: "hidden",
    },
    smallFill: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      height: "100%",
    },
    pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
    empty: {
      borderTopColor: theme.colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing[2],
      paddingVertical: 24,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600" },
    emptyDescription: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    emptyAction: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.medium,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 42,
      paddingHorizontal: theme.spacing[4],
      ...theme.shadows.sm,
    },
    emptyActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
    modalRoot: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.large,
      borderTopRightRadius: theme.radius.large,
      maxHeight: "80%",
      paddingBottom: 28,
      paddingHorizontal: 20,
      ...theme.shadows.xl,
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
