import { History, ListTree, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MarkdownOutlineItem } from "../editor-kernel/editor-kernel-state";
import type { HistorySnapshot } from "../history/history-store";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";
import { useWorkspaceDrawerStyles } from "./workspace-drawer-styles";

export function WorkspaceDrawerSecondary({
  view,
  outline,
  history,
  historyError,
  onRestoreHistory,
  onRemoveHistory,
  onClearHistory,
}: Readonly<{
  view: "outline" | "history";
  outline: readonly MarkdownOutlineItem[];
  history: readonly HistorySnapshot[];
  historyError: string | null;
  onRestoreHistory: (snapshot: HistorySnapshot) => void;
  onRemoveHistory: (snapshot: HistorySnapshot) => void;
  onClearHistory: () => void;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = useWorkspaceDrawerStyles();
  const localStyles = createLocalStyles(theme);
  return (
    <ScrollView contentContainerStyle={styles.list} style={styles.scroll}>
      {view === "outline"
        ? outline.map((item) => (
            <View
              key={`${item.offset}-${item.text}`}
              style={[styles.row, { paddingLeft: 14 + (item.level - 1) * 12 }]}
            >
              <ListTree color={theme.colors.mutedText} size={16} />
              <Text numberOfLines={2} style={styles.rowText}>
                {item.text}
              </Text>
            </View>
          ))
        : null}
      {view === "outline" && outline.length === 0 ? (
        <Text style={styles.empty}>{t("drawer.noHeadings")}</Text>
      ) : null}
      {view === "history" && history.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClearHistory}
          style={({ pressed }) => [localStyles.clear, pressed && styles.pressed]}
        >
          <Trash2 color={theme.colors.error} size={16} />
          <Text style={localStyles.clearText}>{t("drawer.deleteAllHistory")}</Text>
        </Pressable>
      ) : null}
      {view === "history"
        ? history.map((snapshot) => (
            <View key={snapshot.snapshotId} style={localStyles.historyRow}>
              <Pressable
                accessibilityHint="Opens a confirmation before restoring this version"
                accessibilityRole="button"
                disabled={snapshot.metadataOnly}
                onPress={() => onRestoreHistory(snapshot)}
                style={({ pressed }) => [localStyles.restore, pressed && styles.pressed]}
              >
                <History color={theme.colors.mutedText} size={17} />
                <View style={styles.entryText}>
                  <Text numberOfLines={1} style={styles.rowText}>
                    {new Date(snapshot.createdAt).toLocaleString()}
                  </Text>
                  <Text numberOfLines={1} style={styles.meta}>
                    {historySourceLabel(snapshot.source)} ·{" "}
                    {snapshot.metadataOnly
                      ? "Metadata only (file exceeded autosave history limit)"
                      : snapshot.markdown.trim().slice(0, 80) || "Empty note"}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel="Delete this history version"
                accessibilityRole="button"
                onPress={() => onRemoveHistory(snapshot)}
                style={({ pressed }) => [localStyles.delete, pressed && styles.pressed]}
              >
                <Trash2 color={theme.colors.error} size={17} />
              </Pressable>
            </View>
          ))
        : null}
      {view === "history" && history.length === 0 && !historyError ? (
        <Text style={styles.empty}>{t("drawer.noVersions")}</Text>
      ) : null}
      {view === "history" && historyError ? (
        <Text accessibilityRole="alert" style={styles.errorBanner}>
          {historyError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function createLocalStyles(theme: Theme) {
  return StyleSheet.create({
    clear: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
    },
    clearText: { color: theme.colors.error, fontSize: 13, fontWeight: "700" },
    historyRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "stretch",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    restore: {
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    delete: { width: 48, alignItems: "center", justifyContent: "center" },
  });
}

function historySourceLabel(source: HistorySnapshot["source"]): string {
  if (source === "manual") return "Manual save";
  if (source === "restore") return "Restored version";
  return "Autosave";
}
