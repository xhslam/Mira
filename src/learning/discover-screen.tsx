import { useMemo } from "react";
import { FileText, Link, Subtitles } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../app/theme";
import type { LearningImportIntent, LearningSnapshot } from "./learning-types";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  theme: Theme;
  onChange: (next: LearningSnapshot) => void;
}>;

type LocalImportIntent = Exclude<LearningImportIntent, null>;

export function DiscoverScreen({ snapshot, theme, onChange }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  function openLibrary(intent: LocalImportIntent) {
    onChange(
      Object.freeze({
        ...snapshot,
        ui: Object.freeze({ ...snapshot.ui, section: "library", importIntent: intent }),
      }),
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>本地优先</Text>
        <Text style={styles.title}>从你拥有的材料开始学习</Text>
        <Text style={styles.subtitle}>
          直接保存公开视频链接，再导入你有权使用的 SRT 或 VTT
          字幕。资料和字幕只保存在本机，应用不会自动抓取频道、视频或字幕。
        </Text>
      </View>

      <View style={styles.steps}>
        <Step
          index="1"
          title="保存公开视频链接"
          detail="粘贴 哔哩哔哩 等公开链接，作为播放器和学习资料的引用。"
          styles={styles}
          theme={theme}
        />
        <Step
          index="2"
          title="导入字幕文件"
          detail="选择与视频匹配的 SRT/VTT，保留原始时间轴并切分为可练习句子。"
          styles={styles}
          theme={theme}
        />
        <Step
          index="3"
          title="进入逐句学习"
          detail="在资料库选择已绑定字幕的视频，进行播放、跟读、查词和复习。"
          styles={styles}
          theme={theme}
        />
      </View>

      <View style={styles.actions}>
        <ImportAction
          icon={Link}
          title="保存公开视频链接"
          detail="先创建一个本地视频引用"
          onPress={() => openLibrary("url")}
          styles={styles}
          theme={theme}
        />
        <ImportAction
          icon={Subtitles}
          title="导入 SRT / VTT 字幕"
          detail="为当前已选视频绑定本地时间轴"
          onPress={() => openLibrary("subtitle")}
          styles={styles}
          theme={theme}
        />
        <ImportAction
          icon={FileText}
          title="导入本地媒体或文本"
          detail="选择音频、视频、Markdown 或纯文本"
          onPress={() => openLibrary("local")}
          styles={styles}
          theme={theme}
        />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>为什么这样设计？</Text>
        <Text style={styles.noticeText}>
          自动频道 Feed
          和自动字幕都需要稳定的外部内容服务。当前模式只使用用户主动提供的公开链接与本地文件，因此导入结果可预期、可验证，也不依赖第三方抓取服务。
        </Text>
      </View>
    </View>
  );
}

function Step(
  props: Readonly<{
    index: string;
    title: string;
    detail: string;
    styles: ReturnType<typeof createStyles>;
    theme: Theme;
  }>,
) {
  const { index, title, detail, styles, theme } = props;
  return (
    <View style={styles.step}>
      <View style={styles.stepIndex}>
        <Text style={[styles.stepIndexText, { color: theme.colors.accent }]}>{index}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function ImportAction(
  props: Readonly<{
    icon: typeof Link;
    title: string;
    detail: string;
    onPress: () => void;
    styles: ReturnType<typeof createStyles>;
    theme: Theme;
  }>,
) {
  const { icon: Icon, title, detail, onPress, styles, theme } = props;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <View style={styles.actionIcon}>
        <Icon color={theme.colors.accent} size={20} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Text style={styles.actionArrow}>›</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { gap: 18, paddingHorizontal: 20, paddingTop: 4 },
    hero: { gap: 7, paddingBottom: 2 },
    eyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
    title: { color: theme.colors.text, fontSize: 29, fontWeight: "700", letterSpacing: -0.5 },
    subtitle: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 21 },
    steps: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 16, gap: 14, padding: 16 },
    step: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
    stepIndex: {
      alignItems: "center",
      backgroundColor: theme.colors.canvas,
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    stepIndexText: { fontSize: 13, fontWeight: "700" },
    stepCopy: { flex: 1, gap: 3 },
    stepTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    stepDetail: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19 },
    actions: { gap: 10 },
    action: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 14,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    actionIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 12,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    actionCopy: { flex: 1, gap: 3 },
    actionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    actionDetail: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    actionArrow: { color: theme.colors.mutedText, fontSize: 28, fontWeight: "300", lineHeight: 30 },
    notice: { backgroundColor: theme.colors.accentSoft, borderRadius: 14, gap: 5, padding: 15 },
    noticeTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    noticeText: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
  });
}
