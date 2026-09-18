import { FileText, Plus, X } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DocumentId } from "../domain/identifiers";
import type { OpenWorkspaceDocument } from "./workspace-state";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";

type DocumentTabsProps = Readonly<{
  documents: readonly OpenWorkspaceDocument[];
  activeDocumentId: DocumentId;
  onSelect: (documentId: DocumentId) => void;
  onClose: (documentId: DocumentId) => void;
  onAdd: () => void;
}>;

export function DocumentTabs({
  documents,
  activeDocumentId,
  onSelect,
  onClose,
  onAdd,
}: DocumentTabsProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  return (
    <View style={styles.lane}>
      <ScrollView
        contentContainerStyle={styles.tabs}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {documents.map((document) => {
          const active = document.documentId === activeDocumentId;
          return (
            <View key={document.documentId} style={[styles.tab, active && styles.activeTab]}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(document.documentId)}
                style={({ pressed }) => [styles.tabMain, pressed && styles.pressed]}
              >
                <FileText color={active ? theme.colors.accent : theme.colors.mutedText} size={16} />
                <Text numberOfLines={1} style={[styles.tabText, active && styles.activeTabText]}>
                  {document.path.replace(/\.md$/i, "")}
                  {document.dirty ? " *" : ""}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t("tabs.closeNote", {
                  name: document.path.replace(/\.md$/i, ""),
                })}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => onClose(document.documentId)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
              >
                <X color={active ? theme.colors.text : theme.colors.mutedText} size={14} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityLabel={t("tabs.newNote")}
        accessibilityRole="button"
        onPress={onAdd}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Plus color={theme.colors.text} size={20} />
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    lane: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "stretch",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.headerBackground,
    },
    tabs: {
      alignItems: "stretch",
      paddingLeft: theme.spacing[2],
    },
    tab: {
      maxWidth: 180,
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabMain: {
      minWidth: 0,
      minHeight: 40,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[2],
      paddingLeft: theme.spacing[3],
      paddingRight: 4,
    },
    activeTab: {
      borderBottomColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    tabText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: "500",
    },
    activeTabText: {
      color: theme.colors.text,
      fontWeight: "600",
    },
    closeButton: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      marginRight: 4,
    },
    closePressed: {
      backgroundColor: theme.colors.surfaceMuted,
      transform: [{ scale: 0.94 }],
    },
    addButton: {
      width: 44,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: theme.colors.borderSubtle,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
