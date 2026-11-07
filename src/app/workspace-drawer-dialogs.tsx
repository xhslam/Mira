import {
  Copy,
  FilePlus2,
  FolderPlus,
  LayoutTemplate,
  Move,
  Pencil,
  Share2,
  Star,
  Trash2,
} from "lucide-react-native";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import type { FileEntry } from "../workspace/workspace-adapter";
import type { WorkspaceBrowserCapabilities } from "../workspace/workspace-browser";
import { AppSafeArea } from "./app-safe-area";
import type { FileTemplate } from "./file-template-registry";
import { useTheme } from "./theme";
import { useWorkspaceDrawerStyles } from "./workspace-drawer-styles";
import { useReducedMotion } from "./use-reduced-motion";

export type WorkspaceCreateKind = "file" | "directory";

export function NewEntryModal({
  visible,
  canCreateFile,
  canCreateDirectory,
  onClose,
  onFile,
  onDirectory,
  onTemplate,
}: Readonly<{
  visible: boolean;
  canCreateFile: boolean;
  canCreateDirectory: boolean;
  onClose: () => void;
  onFile: () => void;
  onDirectory: () => void;
  onTemplate: () => void;
}>) {
  return (
    <ChoiceModal title="New" visible={visible} onClose={onClose}>
      {canCreateFile ? <ActionButton icon={FilePlus2} label="File" onPress={onFile} /> : null}
      {canCreateDirectory ? (
        <ActionButton icon={FolderPlus} label="Folder" onPress={onDirectory} />
      ) : null}
      {canCreateFile ? (
        <ActionButton icon={LayoutTemplate} label="From template" onPress={onTemplate} />
      ) : null}
    </ChoiceModal>
  );
}

export function TemplatePickerModal({
  visible,
  templates,
  onClose,
  onSelect,
}: Readonly<{
  visible: boolean;
  templates: readonly FileTemplate[];
  onClose: () => void;
  onSelect: (template: FileTemplate) => void;
}>) {
  return (
    <ChoiceModal title="From template" visible={visible} onClose={onClose}>
      {templates.map((template) => (
        <ActionButton
          key={template.id}
          icon={LayoutTemplate}
          label={template.label}
          onPress={() => onSelect(template)}
        />
      ))}
    </ChoiceModal>
  );
}

function ChoiceModal({
  visible,
  title,
  onClose,
  children,
}: Readonly<{
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}>) {
  const styles = useWorkspaceDrawerStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <AppSafeArea contentStyle={styles.dialogScrim} opticalTopSpacing={0}>
        <Pressable
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={styles.dialogBackdrop}
        />
        <View accessibilityRole="menu" style={styles.actionSheet}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {children}
        </View>
      </AppSafeArea>
    </Modal>
  );
}

export function EntryActionModal({
  entry,
  capabilities,
  favorite,
  onClose,
  onRename,
  onMove,
  onCopy,
  onRemove,
  onShare,
  onFavorite,
}: Readonly<{
  entry: FileEntry | null;
  capabilities: WorkspaceBrowserCapabilities;
  favorite: boolean;
  onClose: () => void;
  onRename: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onRemove: (entry: FileEntry) => void;
  onShare: (entry: FileEntry) => void;
  onFavorite: (entry: FileEntry, favorite: boolean) => void;
}>) {
  const styles = useWorkspaceDrawerStyles();
  const reduceMotion = useReducedMotion();
  if (!entry) return null;
  const canRename = entry.kind === "file" ? capabilities.rename : capabilities.renameDirectory;
  const canRemove = entry.kind === "file" ? capabilities.remove : capabilities.removeDirectory;
  const canMove = entry.kind === "file" ? capabilities.move : capabilities.moveDirectory;
  const canCopy = entry.kind === "file" ? capabilities.copy : capabilities.copyDirectory;
  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onClose}
      transparent
      visible
    >
      <AppSafeArea contentStyle={styles.dialogScrim} opticalTopSpacing={0}>
        <Pressable
          accessibilityLabel="Close file actions"
          onPress={onClose}
          style={styles.dialogBackdrop}
        />
        <View accessibilityRole="menu" style={styles.actionSheet}>
          <Text numberOfLines={2} style={styles.dialogTitle}>
            {entry.path}
          </Text>
          {canRename ? (
            <ActionButton icon={Pencil} label="Rename" onPress={() => onRename(entry)} />
          ) : null}
          {canMove ? <ActionButton icon={Move} label="Move" onPress={() => onMove(entry)} /> : null}
          {canCopy ? <ActionButton icon={Copy} label="Copy" onPress={() => onCopy(entry)} /> : null}
          {entry.kind === "file" ? (
            <ActionButton
              icon={Star}
              label={favorite ? "Remove from favorites" : "Add to favorites"}
              onPress={() => onFavorite(entry, !favorite)}
            />
          ) : null}
          {entry.kind === "file" && capabilities.share ? (
            <ActionButton icon={Share2} label="Share" onPress={() => onShare(entry)} />
          ) : null}
          {canRemove ? (
            <ActionButton
              danger
              icon={Trash2}
              label={capabilities.trash ? "Move to Trash" : "Delete"}
              onPress={() => onRemove(entry)}
            />
          ) : null}
        </View>
      </AppSafeArea>
    </Modal>
  );
}

export function TransferDialog({
  kind,
  entry,
  value,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<{
  kind: "move" | "copy" | null;
  entry: FileEntry | null;
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}>) {
  const styles = useWorkspaceDrawerStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onCancel}
      transparent
      visible={kind !== null}
    >
      <AppSafeArea contentStyle={styles.dialogScrim} opticalTopSpacing={0}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{kind === "move" ? "Move" : "Copy"} file</Text>
          <Text numberOfLines={2} style={styles.dialogHint}>
            {entry?.path}
          </Text>
          <TextInput
            accessibilityLabel="Destination workspace path"
            autoCapitalize="none"
            autoFocus
            onChangeText={onChange}
            selectTextOnFocus
            style={styles.pathInput}
            value={value}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.errorBanner}>
              {error}
            </Text>
          ) : null}
          <View style={styles.dialogActions}>
            <TextButton label="Cancel" onPress={onCancel} />
            <TextButton
              disabled={busy}
              label={kind === "move" ? "Move" : "Copy"}
              primary
              onPress={onSubmit}
            />
          </View>
        </View>
      </AppSafeArea>
    </Modal>
  );
}

export function PathDialog({
  kind,
  value,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<{
  kind: WorkspaceCreateKind | null;
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}>) {
  const styles = useWorkspaceDrawerStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onCancel}
      transparent
      visible={kind !== null}
    >
      <AppSafeArea contentStyle={styles.dialogScrim} opticalTopSpacing={0}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{kind === "directory" ? "New folder" : "New file"}</Text>
          <TextInput
            accessibilityLabel="Workspace path"
            autoCapitalize="none"
            autoFocus
            onChangeText={onChange}
            selectTextOnFocus
            style={styles.pathInput}
            value={value}
          />
          <Text style={styles.dialogHint}>Use a relative path inside this workspace.</Text>
          {error ? (
            <Text accessibilityRole="alert" style={styles.errorBanner}>
              {error}
            </Text>
          ) : null}
          <View style={styles.dialogActions}>
            <TextButton label="Cancel" onPress={onCancel} />
            <TextButton disabled={busy} label="Create" primary onPress={onSubmit} />
          </View>
        </View>
      </AppSafeArea>
    </Modal>
  );
}

export function RenameDialog({
  entry,
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<{
  entry: FileEntry | null;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}>) {
  const styles = useWorkspaceDrawerStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onCancel}
      transparent
      visible={entry !== null}
    >
      <AppSafeArea contentStyle={styles.dialogScrim} opticalTopSpacing={0}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Rename {entry?.kind}</Text>
          <TextInput
            accessibilityLabel="New workspace path"
            autoCapitalize="none"
            autoFocus
            onChangeText={onChange}
            selectTextOnFocus
            style={styles.pathInput}
            value={value}
          />
          <View style={styles.dialogActions}>
            <TextButton label="Cancel" onPress={onCancel} />
            <TextButton disabled={busy} label="Rename" primary onPress={onSubmit} />
          </View>
        </View>
      </AppSafeArea>
    </Modal>
  );
}

export function ActionButton({
  icon: Icon,
  label,
  danger = false,
  onPress,
}: Readonly<{
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>>;
  label: string;
  danger?: boolean;
  onPress: () => void;
}>) {
  const theme = useTheme();
  const styles = useWorkspaceDrawerStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
    >
      <Icon color={danger ? theme.colors.error : theme.colors.primary} size={18} />
      <Text numberOfLines={1} style={[styles.actionLabel, danger && styles.dangerText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextButton({
  label,
  primary = false,
  disabled = false,
  onPress,
}: Readonly<{ label: string; primary?: boolean; disabled?: boolean; onPress: () => void }>) {
  const styles = useWorkspaceDrawerStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textButton,
        primary && styles.primaryTextButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.textButtonLabel, primary && styles.primaryTextButtonLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}
