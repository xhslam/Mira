import { Check, Search, X } from "lucide-react-native";
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
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text accessibilityRole="header" style={styles.title}>
                Note context
              </Text>
              <Text style={styles.subtitle}>Current note is always included</Text>
            </View>
            <Pressable
              accessibilityLabel="Close note context"
              onPress={props.onClose}
              style={styles.close}
            >
              <X color={theme.colors.text} size={21} />
            </Pressable>
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionTitle}>Allow AI to search the whole workspace</Text>
              <Text style={styles.permissionBody}>
                Off by default. This lets the model call local note search during a request.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Allow AI to search the whole workspace"
              onValueChange={(allowed) => void props.onPermissionChange(allowed)}
              value={props.allowWholeWorkspaceSearch}
            />
          </View>

          <Text style={styles.sectionLabel}>MANUALLY ADD NOTES</Text>
          <View style={styles.searchBox}>
            <Search color={theme.colors.mutedText} size={17} />
            <TextInput
              accessibilityLabel="Search notes to add"
              onChangeText={setQuery}
              placeholder="Search by path…"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <FlatList
            data={files}
            keyExtractor={(item) => item.path}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No matching notes</Text>}
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
            <Text style={styles.doneText}>Done · {props.selectedPaths.length} added</Text>
          </Pressable>
        </View>
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
      borderTopLeftRadius: theme.radius.modal,
      borderTopRightRadius: theme.radius.modal,
      backgroundColor: theme.colors.background,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    subtitle: { marginTop: 3, color: theme.colors.mutedText, fontSize: 12 },
    close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    permissionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    permissionCopy: { minWidth: 0, flex: 1, gap: 3 },
    permissionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    permissionBody: { color: theme.colors.mutedText, fontSize: 11, lineHeight: 16 },
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
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
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
      borderBottomColor: theme.colors.borderSubtle,
    },
    filePath: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 13 },
    check: {
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: 6,
    },
    checkSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    empty: { paddingVertical: 28, color: theme.colors.mutedText, textAlign: "center" },
    doneButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.primary,
    },
    doneText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  });
}
