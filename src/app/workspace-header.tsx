import { Check, ChevronLeft, Eye, MoreVertical, Pencil, Search, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { EditorMode } from "../session/document-session";
import type { TranslationKey } from "./i18n";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";
import type { WorkspaceSaveState } from "./workspace-state";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";
import { editableNoteName } from "./note-rename";

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
  onBack?: () => void;
  onOpenDrawer?: () => void;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  onBeginRename: () => void;
  onToggleEditorMode: () => void;
  canRename: boolean;
  rename: Readonly<{
    value: string;
    error: string | null;
    busy: boolean;
    onChange: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
  }> | null;
}>;

export function WorkspaceHeader({
  filename,
  dirty,
  editorMode,
  nextEditorMode,
  showEditorMode,
  saveState,
  onBack,
  onOpenDrawer,
  onOpenSearch,
  onOpenMenu,
  onBeginRename,
  onToggleEditorMode,
  canRename,
  rename,
}: WorkspaceHeaderProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const failing = saveState === "conflict" || saveState === "error";
  return (
    <View accessibilityRole="header" style={styles.header}>
      {onBack ? (
        <IconButton label={t("header.backToOverview")} onPress={onBack}>
          <ChevronLeft color={theme.colors.text} size={22} strokeWidth={2.2} />
        </IconButton>
      ) : onOpenDrawer ? (
        <IconButton label={t("header.openWorkspace")} onPress={onOpenDrawer}>
          <SidebarToggleIcon color={theme.colors.text} expanded={false} size={22} />
        </IconButton>
      ) : null}
      <View accessibilityElementsHidden style={styles.fileMark} />
      {rename ? (
        <View style={styles.renameBlock}>
          <TextInput
            accessibilityLabel={t("header.renameNoteInput")}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!rename.busy}
            onChangeText={rename.onChange}
            onSubmitEditing={rename.onSubmit}
            returnKeyType="done"
            selectTextOnFocus
            style={[styles.renameInput, rename.error && styles.renameInputError]}
            value={rename.value}
          />
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={[styles.renameHint, rename.error && styles.renameError]}
          >
            {rename.error ?? t("header.renameNoteHint")}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={t("header.renameNote", { name: editableNoteName(filename) })}
          accessibilityRole="button"
          disabled={!canRename}
          onPress={onBeginRename}
          style={({ pressed }) => [styles.title, pressed && canRename && styles.titlePressed]}
        >
          <View style={styles.titleRow}>
            <Text
              allowFontScaling
              maxFontSizeMultiplier={2}
              numberOfLines={1}
              style={styles.filename}
            >
              {editableNoteName(filename)}
            </Text>
            {canRename ? <Pencil color={theme.colors.mutedText} size={12} strokeWidth={2} /> : null}
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
        </Pressable>
      )}
      {rename ? (
        <>
          <IconButton label={t("header.cancelRename")} onPress={rename.onCancel}>
            <X color={theme.colors.mutedText} size={20} strokeWidth={2} />
          </IconButton>
          <IconButton
            disabled={rename.busy}
            label={t("header.confirmRename")}
            onPress={rename.onSubmit}
          >
            {rename.busy ? (
              <ActivityIndicator color={theme.colors.accent} size="small" />
            ) : (
              <Check color={theme.colors.accent} size={21} strokeWidth={2.3} />
            )}
          </IconButton>
        </>
      ) : (
        <>
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
              <Text
                style={[styles.modeButtonText, editorMode === "reading" && styles.readingModeText]}
              >
                {t(MODE_KEYS[editorMode])}
              </Text>
            </Pressable>
          ) : null}
          <IconButton label={t("header.moreActions")} onPress={onOpenMenu}>
            <MoreVertical color={theme.colors.text} size={22} strokeWidth={2} />
          </IconButton>
        </>
      )}
    </View>
  );
}

type IconButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}>;

export function IconButton({ label, onPress, children, disabled = false }: IconButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
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
      backgroundColor: theme.colors.headerBackground,
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
      borderRadius: 8,
    },
    titlePressed: { opacity: 0.66 },
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
    renameBlock: {
      minWidth: 0,
      flex: 1,
      justifyContent: "center",
      gap: 2,
    },
    renameInput: {
      minWidth: 0,
      height: 34,
      paddingHorizontal: 10,
      paddingVertical: 0,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: 9,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      fontSize: 16,
      fontWeight: "700",
    },
    renameInputError: { borderColor: theme.colors.error },
    renameHint: { color: theme.colors.mutedText, fontSize: 10, fontWeight: "600" },
    renameError: { color: theme.colors.error },
    disabled: { opacity: 0.42 },
  });
}
