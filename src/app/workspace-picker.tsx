import {
  Check,
  FileText,
  FolderOpen,
  Link,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { WorkspaceId } from "../domain/identifiers";
import type { WorkspaceCatalog, WorkspaceRecord } from "../workspace/workspace-catalog";
import { AppSafeArea } from "./app-safe-area";
import { useTranslate } from "./locale";
import { resolveWorkspaceLocation, resolveWorkspaceName } from "./managed-workspace-identity";
import { useTheme, type Theme } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";
import { IconButton } from "./workspace-header";

type WorkspacePickerProps = Readonly<{
  visible: boolean;
  catalog: WorkspaceCatalog;
  activeWorkspaceId: WorkspaceId | null;
  busy: boolean;
  error: string | null;
  canClose: boolean;
  onClose: () => void;
  onOpenManaged: () => void;
  onAddLinked: () => void;
  onSelect: (record: WorkspaceRecord) => void;
  onReauthorize: (record: WorkspaceRecord) => void;
  onRename: (record: WorkspaceRecord, displayName: string) => void;
  onPin: (record: WorkspaceRecord, pinned: boolean) => void;
  onRemove: (record: WorkspaceRecord) => void;
}>;

export function WorkspacePicker({
  visible,
  catalog,
  activeWorkspaceId,
  busy,
  error,
  canClose,
  onClose,
  onOpenManaged,
  onAddLinked,
  onSelect,
  onReauthorize,
  onRename,
  onPin,
  onRemove,
}: WorkspacePickerProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const reduceMotion = useReducedMotion();
  const [renaming, setRenaming] = useState<WorkspaceRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const records = [...catalog.workspaces].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      resolveWorkspaceName(left.grant, t).localeCompare(resolveWorkspaceName(right.grant, t)),
  );

  function beginRename(record: WorkspaceRecord): void {
    setRenaming(record);
    // Prefill with the name shown on screen, so confirming without editing
    // does not silently replace a localized label with the English constant.
    setDisplayName(resolveWorkspaceName(record.grant, t));
  }

  function submitRename(): void {
    if (!renaming) return;
    onRename(renaming, displayName);
    setRenaming(null);
    setDisplayName("");
  }

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={canClose && !busy ? onClose : undefined}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <AppSafeArea style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={styles.title}>
              {t("picker.title")}
            </Text>
          </View>
          {canClose ? (
            <IconButton label={t("picker.close")} onPress={onClose}>
              <X color={theme.colors.text} size={21} />
            </IconButton>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <View accessibilityRole="alert" style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {records.map((record) => {
            const active = record.grant.workspaceId === activeWorkspaceId;
            const needsAuthorization = record.grant.status !== "authorized";
            return (
              <View
                key={record.grant.workspaceId}
                style={[styles.card, active && styles.activeCard]}
              >
                <Pressable
                  accessibilityHint={
                    needsAuthorization ? t("picker.reauthorizeHint") : t("picker.openHint")
                  }
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => (needsAuthorization ? onReauthorize(record) : onSelect(record))}
                  style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
                >
                  <View style={styles.cardIcon}>
                    {record.grant.provider === "managed" ? (
                      <FileText color={theme.colors.accent} size={23} />
                    ) : (
                      <FolderOpen color={theme.colors.accent} size={23} />
                    )}
                  </View>
                  <View style={styles.cardText}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.workspaceName}>
                        {resolveWorkspaceName(record.grant, t)}
                      </Text>
                      {record.pinned ? <Pin color={theme.colors.accent} size={14} /> : null}
                    </View>
                    <Text numberOfLines={2} style={styles.location}>
                      {resolveWorkspaceLocation(record.grant, t)}
                    </Text>
                    {needsAuthorization ? (
                      <Text style={[styles.status, styles.statusWarning]}>
                        {workspaceStatusLabel(record)}
                      </Text>
                    ) : null}
                  </View>
                  {active ? (
                    <View accessibilityLabel={t("picker.activeWorkspace")} style={styles.check}>
                      <Check color="#FFFFFF" size={16} strokeWidth={3} />
                    </View>
                  ) : null}
                </Pressable>

                <View style={styles.cardActions}>
                  {needsAuthorization ? (
                    <WorkspaceAction
                      icon={RefreshCw}
                      label={t("picker.reauthorize")}
                      onPress={() => onReauthorize(record)}
                    />
                  ) : null}
                  <WorkspaceAction
                    icon={Pencil}
                    label={t("picker.rename")}
                    onPress={() => beginRename(record)}
                  />
                  <WorkspaceAction
                    icon={record.pinned ? PinOff : Pin}
                    label={record.pinned ? t("picker.unpin") : t("picker.pin")}
                    onPress={() => onPin(record, !record.pinned)}
                  />
                  {!active && record.grant.provider !== "managed" ? (
                    <WorkspaceAction
                      danger
                      icon={Trash2}
                      label={t("picker.remove")}
                      onPress={() => onRemove(record)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}

          {!records.some((record) => record.grant.provider === "managed") ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onOpenManaged}
              style={({ pressed }) => [styles.addCard, pressed && styles.pressed]}
            >
              <FileText color={theme.colors.accent} size={24} />
              <View style={styles.addText}>
                <Text style={styles.addTitle}>{t("picker.managedTitle")}</Text>
                <Text style={styles.addBody}>{t("picker.managedBody")}</Text>
              </View>
            </Pressable>
          ) : null}

          {Platform.OS === "android" ? (
            <Pressable
              accessibilityHint={t("picker.linkedHint")}
              accessibilityRole="button"
              disabled={busy}
              onPress={onAddLinked}
              style={({ pressed }) => [styles.addCard, pressed && styles.pressed]}
            >
              <Link color={theme.colors.accent} size={24} />
              <View style={styles.addText}>
                <Text style={styles.addTitle}>{t("picker.linkedTitle")}</Text>
                <Text style={styles.addBody}>{t("picker.linkedBody")}</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.platformBoundary}>
              <Text style={styles.boundaryTitle}>{t("picker.linkedUnavailable")}</Text>
              <Text style={styles.boundaryBody}>
                iOS requires the native security-scoped bookmark adapter before linked folders can
                be persisted safely.
              </Text>
            </View>
          )}
        </ScrollView>

        {busy ? (
          <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.busyOverlay}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
            <Text style={styles.busyText}>{t("picker.checkingAccess")}</Text>
          </View>
        ) : null}

        <Modal
          animationType={reduceMotion ? "none" : "fade"}
          transparent
          visible={renaming !== null}
        >
          <AppSafeArea contentStyle={styles.renameOverlay} opticalTopSpacing={0}>
            <View style={styles.renameDialog}>
              <Text accessibilityRole="header" style={styles.renameTitle}>
                {t("picker.renameTitle")}
              </Text>
              <TextInput
                accessibilityLabel={t("picker.renameLabel")}
                autoFocus
                maxLength={200}
                onChangeText={setDisplayName}
                onSubmitEditing={submitRename}
                selectTextOnFocus
                style={styles.input}
                value={displayName}
              />
              <View style={styles.renameActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRenaming(null)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>{t("picker.cancel")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={submitRename}
                  style={styles.confirmButton}
                >
                  <Text style={styles.confirmButtonText}>{t("picker.rename")}</Text>
                </Pressable>
              </View>
            </View>
          </AppSafeArea>
        </Modal>
      </AppSafeArea>
    </Modal>
  );
}

function workspaceStatusLabel(record: WorkspaceRecord): string {
  if (record.grant.status === "needs-reauthorization") return "Needs reauthorization";
  if (record.grant.status === "offline") return "Provider unavailable";
  if (record.grant.provider === "managed") return "Available offline";
  return "Authorized linked folder";
}

function WorkspaceAction({
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
  const styles = createStyles(theme);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Icon color={danger ? theme.colors.error : theme.colors.mutedText} size={16} />
      <Text style={[styles.actionText, danger && styles.actionDanger]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 12,
      paddingLeft: 16,
      paddingRight: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    headerText: { minWidth: 0, flex: 1 },
    title: { color: theme.colors.text, fontSize: 21, fontWeight: "700" },
    content: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 12, padding: 20 },
    errorBanner: { padding: 12, borderRadius: 10, backgroundColor: "#FDECEC" },
    errorText: { color: theme.colors.error, fontSize: 13, lineHeight: 19 },
    card: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    activeCard: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
    cardMain: {
      minHeight: 92,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    cardIcon: {
      width: 46,
      height: 46,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.background,
    },
    cardText: { minWidth: 0, flex: 1, gap: 3 },
    nameRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
    workspaceName: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    location: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    status: { fontSize: 11, fontWeight: "600" },
    statusWarning: { color: "#9A6700" },
    check: {
      width: 26,
      height: 26,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    cardActions: {
      minHeight: 44,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    action: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
    },
    actionText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    actionDanger: { color: theme.colors.error },
    addCard: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.colors.accent,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    addText: { minWidth: 0, flex: 1 },
    addTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    addBody: { color: theme.colors.mutedText, fontSize: 12, marginTop: 3 },
    platformBoundary: {
      gap: 4,
      padding: 14,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    boundaryTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    boundaryBody: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    busyOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      backgroundColor: "rgba(247, 248, 250, 0.88)",
    },
    busyText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    renameOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: theme.colors.overlay,
    },
    renameDialog: {
      width: "100%",
      maxWidth: 420,
      gap: 16,
      padding: 20,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    renameTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
    input: {
      minHeight: 48,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      fontSize: 15,
    },
    renameActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    secondaryButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    secondaryButtonText: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "600" },
    confirmButton: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    confirmButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    pressed: { opacity: 0.68 },
  });
}
