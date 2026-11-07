import { useMemo } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  FileText,
  FolderOpen,
  Link2,
  MessageCircle,
  Pencil,
  Subtitles,
  Video,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Theme } from "../app/theme";
import { studyAccent } from "./study-appearance";
import { learningHomePreview } from "./learning-session";
import type { LearningImportIntent, LearningResource, LearningSnapshot } from "./learning-types";

type HomeActionProps = Readonly<{
  theme: Theme;
  onOpenImport: () => void;
  onOpenLibrary: () => void;
}>;

type HomeProps = HomeActionProps &
  Readonly<{
    snapshot: LearningSnapshot;
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
  const preview = learningHomePreview(snapshot);
  const hasResources = snapshot.resources.length > 0;
  const goalMinutes = Math.max(1, snapshot.goal.dailyMinutes);
  const studiedMinutes =
    snapshot.goal.lastActivityDate === new Date().toISOString().slice(0, 10)
      ? Math.round(snapshot.goal.practiceMinutesToday)
      : 0;
  const actionLabel = preview
    ? preview.resuming
      ? `继续练第 ${preview.index + 1} 句`
      : `从第 ${preview.index + 1} 句开始`
    : hasResources
      ? "准备学习资料"
      : "导入第一份资料";

  return (
    <View style={styles.screen}>
      <View style={styles.feature}>
        {preview ? (
          <>
            <Text numberOfLines={2} style={styles.eyebrow}>
              {preview.resuming ? "上次练到 · " : "准备开始 · "}
              {preview.resource.title}
            </Text>
            <Text accessibilityRole="header" numberOfLines={4} style={styles.sentence}>
              {preview.sentence.text}
            </Text>
            {preview.sentence.translation ? (
              <Text numberOfLines={3} style={styles.continueMeta}>
                {preview.sentence.translation}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>逐句学习</Text>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              {hasResources ? "准备好字幕，就能开始" : "从第一句开始"}
            </Text>
            <Text style={styles.continueMeta}>
              {hasResources
                ? "在资料库为音频或视频添加字幕。"
                : "导入音频、视频或文本，逐句听和跟读。"}
            </Text>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={
            preview
              ? () => onOpenResource(preview.resource)
              : hasResources
                ? onOpenLibrary
                : onOpenImport
          }
          style={({ pressed }) => [styles.continueAction, pressed && styles.pressed]}
        >
          <Text style={styles.continueActionText}>{actionLabel}</Text>
          <ArrowRight color={theme.colors.canvas} size={21} />
        </Pressable>
      </View>
      <Text style={styles.goal}>
        今日 <Text style={styles.goalNumber}>{studiedMinutes}</Text> / {goalMinutes} 分钟
      </Text>
    </View>
  );
}

export function LearningHomeActions({
  theme,
  onOpenLibrary,
  onOpenImport,
  onOpenCoach,
}: HomeActionProps & Readonly<{ onOpenCoach: () => void }>) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const actions = [
    { label: "资料库", icon: BookOpen, onPress: onOpenLibrary },
    { label: "创建资料", icon: Plus, onPress: onOpenImport, featured: true },
    { label: "英语陪练", icon: MessageCircle, onPress: onOpenCoach },
  ];
  return (
    <View style={styles.homeActions}>
      <View pointerEvents="none" style={styles.homeActionsTrack} />
      {actions.map(({ label, icon: Icon, onPress, featured }) => (
        <Pressable
          key={label}
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.homeAction,
            featured && styles.createAction,
            pressed && styles.pressed,
          ]}
        >
          <Icon color={featured ? theme.colors.canvas : theme.colors.text} size={18} />
          <Text
            maxFontSizeMultiplier={featured ? 1.15 : 1.6}
            numberOfLines={1}
            style={[styles.homeActionText, featured && styles.createActionText]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LearningImportSheet(props: ImportSheetProps) {
  const { visible, theme, onClose, onOpenCraft, onOpenUrl, onSelectIntent } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const options: readonly Readonly<{
    intent: Exclude<LearningImportIntent, null>;
    title: string;
    description?: string;
    icon: typeof FileText;
  }>[] = Object.freeze([
    Object.freeze({
      intent: "subtitle",
      title: "导入 SRT / VTT 字幕",
      description: "需先在资料库选择视频",
      icon: Subtitles,
    }),
    Object.freeze({
      intent: "local",
      title: "导入本地文件",
      description: "音频、视频或文本",
      icon: FolderOpen,
    }),
    Object.freeze({
      intent: "photo",
      title: "导入相册视频",
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
        <SafeAreaView
          accessibilityViewIsModal
          edges={["bottom", "left", "right"]}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetTitle}>导入资料</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭导入资料"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            >
              <ChevronDown color={theme.colors.text} size={22} />
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
                <Pencil color={theme.colors.mutedText} size={19} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>创建学习材料</Text>
                <Text style={styles.optionDetail}>手动输入文稿，直接保存为学习资料</Text>
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
                  {description ? <Text style={styles.optionDescription}>{description}</Text> : null}
                </View>
                <ChevronRight color={theme.colors.mutedText} size={18} />
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { gap: 20, paddingHorizontal: 24, paddingTop: 32 },
    feature: { gap: 12 },
    eyebrow: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "600" },
    sentence: {
      color: theme.colors.text,
      fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
      fontSize: 56,
      fontWeight: "700",
      lineHeight: 59,
      letterSpacing: -1.2,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 32, fontWeight: "600" },
    continueMeta: { color: theme.colors.mutedText, fontSize: 17, lineHeight: 25 },
    continueAction: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginTop: 20,
      minHeight: 56,
      paddingHorizontal: 22,
      paddingVertical: 10,
    },
    continueActionText: {
      color: theme.colors.canvas,
      flexShrink: 1,
      fontSize: 17,
      fontWeight: "700",
    },
    goal: { color: theme.colors.mutedText, fontSize: 15 },
    goalNumber: { color: studyAccent(theme), fontSize: 19, fontWeight: "700" },
    homeActions: {
      alignItems: "center",
      flexDirection: "row",
    },
    homeActionsTrack: {
      ...StyleSheet.absoluteFill,
      top: 6,
      bottom: 6,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.pill,
    },
    homeAction: {
      alignItems: "center",
      flex: 1,
      gap: 2,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 0,
      paddingHorizontal: 4,
    },
    createAction: {
      flex: 0,
      width: 60,
      height: 60,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
    },
    createActionText: { color: theme.colors.canvas, fontSize: 11 },
    homeActionText: { color: theme.colors.text, fontSize: 12, fontWeight: "500" },
    pressed: { opacity: 0.72 },
    modalRoot: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
    sheet: {
      backgroundColor: theme.colors.canvas,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "80%",
      paddingBottom: 32,
      paddingHorizontal: 16,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: theme.colors.divider,
      borderRadius: theme.radius.pill,
      height: 4,
      marginBottom: 16,
      marginTop: 8,
      width: 36,
    },
    sheetHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
      paddingBottom: 12,
    },
    sheetCopy: { flex: 1, gap: 4 },
    sheetTitle: { color: theme.colors.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.3 },
    doneButton: {
      minHeight: 48,
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
    },
    optionsScroll: { flexShrink: 1 },
    options: { paddingBottom: 4 },
    option: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 68,
      paddingVertical: 12,
    },
    optionIcon: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
    optionCopy: { flex: 1, gap: 4 },
    optionDetail: { color: theme.colors.mutedText, fontSize: theme.fontSizes.caption },
    optionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "500" },
    optionDescription: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
  });
}
