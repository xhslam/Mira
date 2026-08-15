import { Eye, Menu, MoreVertical, Search } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EditorMode } from "../session/document-session";
import type { TranslationKey } from "./i18n";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";
import type { WorkspaceSaveState } from "./workspace-state";

const MODE_KEYS: Readonly<Record<EditorMode, TranslationKey>> = Object.freeze({
  wysiwyg: "mode.wysiwyg",
  source: "mode.source",
  reading: "mode.reading",
  tree: "mode.tree",
  table: "mode.table",
});

const SAVE_KEYS: Readonly<Record<WorkspaceSaveState, TranslationKey>> = Object.freeze({
  loading: "save.loading",
  editing: "save.editing",
  saving: "save.saving",
  saved: "save.saved",
  "recovery-only": "save.recoveryOnly",
  conflict: "save.conflict",
  error: "save.error",
});

type WorkspaceHeaderProps = Readonly<{
  filename: string;
  dirty: boolean;
  editorMode: EditorMode;
  nextEditorMode: EditorMode;
  showEditorMode: boolean;
  saveState: WorkspaceSaveState;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  onToggleEditorMode: () => void;
}>;

export function WorkspaceHeader({
  filename,
  dirty,
  editorMode,
  nextEditorMode,
  showEditorMode,
  saveState,
  onOpenDrawer,
  onOpenSearch,
  onOpenMenu,
  onToggleEditorMode,
}: WorkspaceHeaderProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const failing = saveState === "conflict" || saveState === "error";
  return (
    <View accessibilityRole="header" style={styles.header}>
      <IconButton label={t("header.openWorkspace")} onPress={onOpenDrawer}>
        <Menu color={theme.colors.text} size={22} strokeWidth={2} />
      </IconButton>
      <View accessibilityElementsHidden style={styles.fileMark} />
      <View style={styles.title}>
        <View style={styles.titleRow}>
          <Text
            allowFontScaling
            maxFontSizeMultiplier={2}
            numberOfLines={1}
            style={styles.filename}
          >
            {filename}
          </Text>
          {dirty ? (
            <View
              accessibilityLabel={t("header.unsavedChanges")}
              accessibilityRole="text"
              style={styles.dirtyDot}
            />
          ) : null}
        </View>
        <Text
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={[styles.saveState, failing && styles.saveStateError]}
        >
          {t(SAVE_KEYS[saveState])}
        </Text>
      </View>
      <IconButton label={t("header.searchNotes")} onPress={onOpenSearch}>
        <Search color={theme.colors.text} size={21} strokeWidth={2} />
      </IconButton>
      {showEditorMode ? (
        <Pressable
          accessibilityLabel={t("header.switchMode", { mode: t(MODE_KEYS[nextEditorMode]) })}
          accessibilityRole="button"
          onPress={onToggleEditorMode}
          style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
        >
          {editorMode === "reading" ? (
            <Eye color={theme.colors.accent} size={14} strokeWidth={2.2} />
          ) : null}
          <Text style={[styles.modeButtonText, editorMode === "reading" && styles.readingModeText]}>
            {t(MODE_KEYS[editorMode])}
          </Text>
        </Pressable>
      ) : null}
      <IconButton label={t("header.moreActions")} onPress={onOpenMenu}>
        <MoreVertical color={theme.colors.text} size={22} strokeWidth={2} />
      </IconButton>
    </View>
  );
}

type IconButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}>;

export function IconButton({ label, onPress, children }: IconButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      backgroundColor: theme.colors.canvas,
      shadowColor: "#10131A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.mode === "dark" ? 0.22 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    modeButton: {
      minWidth: 52,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
      flexDirection: "row",
      gap: 5,
    },
    modeButtonText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    readingModeText: {
      color: theme.colors.accent,
    },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
      opacity: 0.78,
    },
    fileMark: {
      width: 5,
      height: 30,
      marginLeft: 4,
      marginRight: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    filename: {
      minWidth: 0,
      flex: 1,
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 23,
    },
    title: {
      minWidth: 0,
      flex: 1,
      justifyContent: "center",
    },
    titleRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    saveState: {
      color: theme.colors.mutedText,
      fontSize: 11,
      fontWeight: "600",
    },
    saveStateError: {
      color: theme.colors.error,
    },
    dirtyDot: {
      width: 8,
      height: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
  });
}
