import { Check, ChevronDown, MoreHorizontal, Pencil, Search, Undo2 } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { EditorMode } from "../session/document-session";
import type { TranslationKey } from "./i18n";
import { useTranslate } from "./locale";
import { MiraSheet } from "./mira-controls";
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
  saveState: WorkspaceSaveState;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  onBeginRename: () => void;
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
  saveState,
  onOpenDrawer,
  onOpenSearch,
  onOpenMenu,
  onBeginRename,
  canRename,
  rename,
}: WorkspaceHeaderProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const failing = saveState === "conflict" || saveState === "error";
  return (
    <View accessibilityRole="header" style={styles.header}>
      <IconButton label={t("header.openWorkspace")} onPress={onOpenDrawer} plain>
        <View style={styles.sidebarCircle}>
          <SidebarToggleIcon color={theme.colors.text} expanded={false} size={19} />
        </View>
      </IconButton>
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
            {canRename ? <Pencil color={theme.colors.text} size={16} strokeWidth={2} /> : null}
            {dirty ? (
              <View
                accessibilityLabel={t("header.unsavedChanges")}
                accessibilityRole="text"
                style={styles.dirtyDot}
              />
            ) : null}
          </View>
          <View style={styles.saveLine}>
            {saveState === "saved" ? (
              <Check color={theme.colors.mutedText} size={14} strokeWidth={2} />
            ) : null}
            <Text
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              style={[styles.saveState, failing && styles.saveStateError]}
            >
              {t(SAVE_KEYS[saveState])}
            </Text>
          </View>
        </Pressable>
      )}
      {rename ? (
        <>
          <IconButton label={t("header.cancelRename")} onPress={rename.onCancel}>
            <Undo2 color={theme.colors.mutedText} size={20} strokeWidth={2} />
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
          <IconButton label={t("header.searchNotes")} onPress={onOpenSearch} plain>
            <Search color={theme.colors.text} size={22} strokeWidth={2} />
          </IconButton>
          <IconButton label={t("header.moreActions")} onPress={onOpenMenu} plain>
            <MoreHorizontal color={theme.colors.text} size={23} strokeWidth={2} />
          </IconButton>
        </>
      )}
    </View>
  );
}

export function WorkspaceModePicker({
  mode,
  modes,
  onSelect,
}: Readonly<{
  mode: EditorMode;
  modes: readonly EditorMode[];
  onSelect: (mode: EditorMode) => void;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const [visible, setVisible] = useState(false);
  if (modes.length < 2) return null;

  return (
    <>
      <Pressable
        accessibilityLabel={t("header.editorMode", { mode: t(MODE_KEYS[mode]) })}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        hitSlop={{ top: 7, bottom: 7 }}
        onPress={() => {
          Keyboard.dismiss();
          setVisible(true);
        }}
        style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.modeButtonText}>
          {t(MODE_KEYS[mode])}
        </Text>
        <ChevronDown color={theme.colors.text} size={16} strokeWidth={2} />
      </Pressable>
      <MiraSheet
        onClose={() => setVisible(false)}
        title={t("header.editorModes")}
        visible={visible}
      >
        {modes.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: option === mode }}
            onPress={() => {
              setVisible(false);
              if (option !== mode) onSelect(option);
            }}
            style={({ pressed }) => [styles.modeOption, pressed && styles.pressed]}
          >
            <Text style={styles.modeOptionText}>{t(MODE_KEYS[option])}</Text>
            {option === mode ? <Check color={theme.colors.text} size={19} /> : null}
          </Pressable>
        ))}
      </MiraSheet>
    </>
  );
}

type IconButtonProps = Readonly<{
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  plain?: boolean;
}>;

export function IconButton({
  label,
  onPress,
  children,
  disabled = false,
  plain = false,
}: IconButtonProps) {
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
        plain && styles.plainIconButton,
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
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 12,
      paddingRight: 4,
      paddingTop: 10,
      backgroundColor: theme.colors.background,
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.canvas,
    },
    plainIconButton: { backgroundColor: "transparent" },
    sidebarCircle: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceMuted,
    },
    modeButton: {
      maxWidth: "36%",
      minHeight: 30,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceMuted,
      flexDirection: "row",
      gap: 4,
    },
    modeButtonText: {
      color: theme.colors.text,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "600",
    },
    modeOption: {
      minHeight: 48,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      borderRadius: theme.radius.medium,
    },
    modeOptionText: { flex: 1, color: theme.colors.text, fontSize: 16 },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
      opacity: 0.78,
    },
    filename: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
    title: {
      minWidth: 0,
      flex: 1,
      justifyContent: "center",
      borderRadius: 8,
      marginLeft: 4,
      marginRight: 12,
    },
    titlePressed: { opacity: 0.66 },
    titleRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    saveLine: { flexDirection: "row", alignItems: "center", gap: 4 },
    saveState: {
      flexShrink: 1,
      color: theme.colors.mutedText,
      fontSize: 12,
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
      marginHorizontal: 12,
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
