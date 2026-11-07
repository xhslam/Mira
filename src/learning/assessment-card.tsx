import { StyleSheet, Text, View } from "react-native";
import { Mic, Volume2 } from "lucide-react-native";
import type { Theme } from "../app/theme";
import type { LearningRecording } from "./learning-types";

type Props = Readonly<{
  recording: LearningRecording;
  theme: Theme;
}>;

export function AssessmentCard({ recording, theme }: Props) {
  const styles = createStyles(theme);
  const seconds = Math.max(0, Math.round(recording.durationMs / 1_000));
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Mic color={theme.colors.primary} size={19} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>跟读录音已保存</Text>
        <Text style={styles.detail}>{seconds} 秒 · 可以回放并与原音对比</Text>
        <Text style={styles.notice}>
          尚未配置真实发音评测服务，因此不会显示准确度、流利度或音高评分。
        </Text>
      </View>
      <Volume2 color={theme.colors.mutedText} size={18} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      ...theme.shadows.sm,
    },
    icon: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radius.full,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    copy: { flex: 1, gap: 3 },
    title: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    detail: { color: theme.colors.mutedText, fontSize: 12 },
    notice: { color: theme.colors.mutedText, fontSize: 11, lineHeight: 16, marginTop: 3 },
  });
}
