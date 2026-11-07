import { CircleAction } from "./mira-controls";
import { Check, Search, ChevronDown } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { FileEntry } from "../workspace/workspace-adapter";
import { useTheme, type Theme } from "./theme";

export function AiContextSheet(
  props: Readonly<{
    visible: boolean;
    entries: readonly FileEntry[];
    currentPath: string | null;
    selectedPaths: readonly string[];
    allowWholeWorkspaceSearch: boolean;
    onTogglePath: (path: string) => void;
    onPermissionChange: (allowed: boolean) => Promise<void>;
    onClose: () => void;
  }>,
) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const files = useMemo(
    () =>
      props.entries.filter(
        (entry) =>
          entry.kind === "file" &&
          entry.path !== props.currentPath &&
          (!normalized || entry.path.toLocaleLowerCase().includes(normalized)),
      ),
    [normalized, props.currentPath, props.entries],
  );

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={props.visible}>
      <View style={styles.backdrop}>
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text accessibilityRole="header" style={styles.title}>
                笔记上下文
              </Text>
              {props.currentPath ? <Text style={styles.subtitle}>已包含当前笔记</Text> : null}
            </View>
            <CircleAction label="关闭笔记上下文" onPress={props.onClose} muted>
              <ChevronDown color={theme.colors.text} size={21} />
            </CircleAction>
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionTitle}>允许搜索整个工作区</Text>
            </View>
            <Switch
              accessibilityLabel="允许搜索整个工作区"
              onValueChange={(allowed) => void props.onPermissionChange(allowed)}
              value={props.allowWholeWorkspaceSearch}
            />
          </View>

          <Text style={styles.sectionLabel}>添加笔记</Text>
          <View style={styles.searchBox}>
            <Search color={theme.colors.mutedText} size={17} />
            <TextInput
              accessibilityLabel="搜索笔记"
              onChangeText={setQuery}
              placeholder="搜索笔记…"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <FlatList
            data={files}
            keyExtractor={(item) => item.path}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>没有匹配的笔记</Text>}
            renderItem={({ item }) => {
              const selected = props.selectedPaths.includes(item.path);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => props.onTogglePath(item.path)}
                  style={styles.fileRow}
                >
                  <Text numberOfLines={1} style={styles.filePath}>
                    {item.path}
                  </Text>
                  <View style={[styles.check, selected && styles.checkSelected]}>
                    {selected ? <Check color="#FFFFFF" size={14} /> : null}
                  </View>
                </Pressable>
              );
            }}
            style={styles.list}
          />
          <Pressable onPress={props.onClose} style={styles.doneButton}>
            <Text style={styles.doneText}>完成 · 已选 {props.selectedPaths.length} 篇</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.colors.overlay },
    sheet: {
      maxHeight: "88%",
      minHeight: "66%",
      gap: 14,
      padding: 18,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: theme.colors.background,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    subtitle: { marginTop: 3, color: theme.colors.mutedText, fontSize: 12 },
    permissionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    permissionCopy: { minWidth: 0, flex: 1, gap: 3 },
    permissionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    sectionLabel: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    searchBox: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    searchInput: { flex: 1, color: theme.colors.text, fontSize: 14 },
    list: { flex: 1 },
    fileRow: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    filePath: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 13 },
    check: {
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: theme.radius.medium,
    },
    checkSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
    empty: { paddingVertical: 28, color: theme.colors.mutedText, textAlign: "center" },
    doneButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.accent,
    },
    doneText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  });
}
