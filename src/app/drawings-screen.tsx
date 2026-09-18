import { FileJson2, Paintbrush, Plus, Shapes } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import {
  createEmptyExcalidrawFile,
  isExcalidrawMarkdownPath,
  isExcalidrawPath,
} from "../formats/excalidraw/excalidraw-file";
import type { FileEntry } from "../workspace/workspace-adapter";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import { drawingCreateTarget } from "./drawing-create";
import { useTranslate } from "./locale";
import { triggerClickFeedback } from "./press-feedback";
import { useTheme, type Theme } from "./theme";
import { useUiSound } from "./ui-sound-context";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";

export function DrawingsScreen({
  clickVibration = true,
  controller,
  onEnterEditor,
  onOpenSidebar,
}: Readonly<{
  clickVibration?: boolean;
  controller: EditorWorkspaceController;
  onEnterEditor: () => void;
  onOpenSidebar: () => void;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const uiSound = useUiSound();
  const { width } = useWindowDimensions();
  const styles = createStyles(theme, width);
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeCreate = useCallback(() => {
    if (busy) return;
    Keyboard.dismiss();
    setCreateVisible(false);
    setName("");
    setError(null);
  }, [busy]);
  const drawings = useMemo(
    () =>
      controller.browserEntries
        .filter((entry) => entry.kind === "file" && isExcalidrawPath(entry.path))
        .sort((left, right) => {
          const leftTime = left.modifiedAt ? Date.parse(left.modifiedAt) : 0;
          const rightTime = right.modifiedAt ? Date.parse(right.modifiedAt) : 0;
          return rightTime - leftTime || left.name.localeCompare(right.name);
        }),
    [controller.browserEntries],
  );

  useEffect(() => {
    if (!createVisible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) closeCreate();
      return true;
    });
    return () => subscription.remove();
  }, [busy, closeCreate, createVisible]);

  async function open(entry: FileEntry): Promise<void> {
    triggerClickFeedback(clickVibration);
    setBusy(true);
    setError(null);
    try {
      const result = await controller.openBrowserFile(entry);
      if (result.ok) {
        uiSound.play("open");
        onEnterEditor();
      } else {
        uiSound.play("error");
        setError(result.error ?? t("drawings.openFailed"));
      }
    } catch {
      uiSound.play("error");
      setError(t("drawings.openFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function create(): Promise<void> {
    const target = drawingCreateTarget(name);
    if (!target.ok) {
      uiSound.play("blocked");
      setError(target.code === "EMPTY" ? t("drawings.nameRequired") : t("drawings.nameInvalid"));
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      const result = await controller.createBrowserFile(
        target.path,
        createEmptyExcalidrawFile(target.path),
      );
      if (!result.ok) {
        uiSound.play("error");
        setError(
          result.errorCode === "ALREADY_EXISTS"
            ? t("drawings.nameExists")
            : (result.error ?? t("drawings.createFailed")),
        );
        return;
      }
      setCreateVisible(false);
      setName("");
      uiSound.play("success");
      onEnterEditor();
    } catch {
      uiSound.play("error");
      setError(t("drawings.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="打开全局侧边栏"
          accessibilityRole="button"
          onPress={onOpenSidebar}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <SidebarToggleIcon color={theme.colors.text} expanded={false} />
        </Pressable>
        <View style={styles.headerMark}>
          <Paintbrush color={theme.colors.text} size={22} strokeWidth={1.8} />
        </View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.eyebrow}>
            MIRA · 画板
          </Text>
          <Text style={styles.title}>{t("drawings.title")}</Text>
        </View>
        <Pressable
          accessibilityLabel={t("drawings.new")}
          accessibilityRole="button"
          onPress={() => {
            triggerClickFeedback(clickVibration);
            setError(null);
            setCreateVisible(true);
          }}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <Plus color="#FFFFFF" size={19} />
          <Text style={styles.newButtonText}>{t("drawings.new")}</Text>
        </Pressable>
      </View>

      <ScrollView
        accessibilityElementsHidden={createVisible}
        contentContainerStyle={styles.content}
        importantForAccessibility={createVisible ? "no-hide-descendants" : "auto"}
        pointerEvents={createVisible ? "none" : "auto"}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("drawings.recent")}</Text>
          {busy ? <ActivityIndicator color={theme.colors.accent} size="small" /> : null}
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {drawings.length > 0 ? (
          <View style={styles.grid}>
            {drawings.map((entry, index) => (
              <DrawingCard
                entry={entry}
                index={index}
                key={entry.path}
                onOpen={() => void open(entry)}
                styles={styles}
                theme={theme}
              />
            ))}
          </View>
        ) : (
          <Pressable onPress={() => setCreateVisible(true)} style={styles.emptyCard}>
            <View style={styles.emptyCanvas}>
              <View style={styles.emptyShapeA} />
              <View style={styles.emptyShapeB} />
              <View style={styles.emptyLine} />
            </View>
            <Text style={styles.emptyTitle}>{t("drawings.emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("drawings.emptyBody")}</Text>
            <View style={styles.emptyCtaButton}>
              <Plus color="#FFFFFF" size={16} strokeWidth={2.4} />
              <Text style={styles.emptyCtaButtonText}>{t("drawings.new")}</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>

      {createVisible ? (
        <KeyboardAvoidingView
          accessibilityViewIsModal
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalScrim}
        >
          <Pressable
            accessibilityLabel={t("drawings.cancel")}
            accessibilityRole="button"
            disabled={busy}
            onPress={closeCreate}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Shapes color={theme.colors.accent} size={23} />
            </View>
            <Text style={styles.modalTitle}>{t("drawings.createTitle")}</Text>
            <Text style={styles.modalBody}>{t("drawings.createBody")}</Text>
            <TextInput
              autoFocus
              editable={!busy}
              maxLength={100}
              onChangeText={setName}
              onSubmitEditing={() => void create()}
              placeholder={t("drawings.namePlaceholder")}
              placeholderTextColor={theme.colors.mutedText}
              returnKeyType="done"
              style={styles.input}
              value={name}
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.modalError}>
                {error}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable disabled={busy} onPress={closeCreate} style={styles.cancelButton}>
                <Text style={styles.cancelText}>{t("drawings.cancel")}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void create()} style={styles.createButton}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Plus color="#FFFFFF" size={19} />
                )}
                <Text style={styles.createText}>{t("drawings.create")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function DrawingCard({
  entry,
  index,
  onOpen,
  styles,
  theme,
}: Readonly<{
  entry: FileEntry;
  index: number;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  const t = useTranslate();
  const name = entry.name.replace(/\.excalidraw(?:\.md)?$/i, "");
  const colors = ["#FFFFFF", "#C8C8C8", "#949494", "#666666"] as const;
  const accent = colors[index % colors.length] ?? colors[0];
  return (
    <Pressable
      accessibilityLabel={t("drawings.openLabel", { name })}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.preview}>
        <View style={[styles.previewStamp, { backgroundColor: accent }]} />
        <View style={[styles.previewRect, { borderColor: accent }]} />
        <View style={[styles.previewCircle, { borderColor: accent }]} />
        <View style={[styles.previewArrow, { backgroundColor: accent }]} />
        <Text style={[styles.previewInitial, { color: accent }]}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {name}
        </Text>
        <View style={styles.cardMetaRow}>
          <FileJson2 color={theme.colors.mutedText} size={13} />
          <Text style={styles.cardMeta}>
            {isExcalidrawMarkdownPath(entry.path) ? "EXCALIDRAW · MD" : "EXCALIDRAW · JSON"}
          </Text>
        </View>
        <Text style={styles.cardDate}>
          {entry.modifiedAt
            ? new Date(entry.modifiedAt).toLocaleDateString()
            : t("drawings.localFile")}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(theme: Theme, width: number) {
  const wide = width >= 720;
  const columns = width >= 1100 ? 4 : wide ? 3 : 2;
  const horizontalPadding = wide ? 28 : 16;
  const gap = wide ? 18 : 12;
  const cardWidth = (width - horizontalPadding * 2 - gap * (columns - 1)) / columns;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: {
      gap: 22,
      paddingHorizontal: horizontalPadding,
      paddingTop: wide ? 24 : 16,
      paddingBottom: 34,
    },
    header: {
      minHeight: 74,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: theme.colors.headerBackground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    menuButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    headerMark: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    headerCopy: { flex: 1, minWidth: 0, gap: 1 },
    eyebrow: { color: theme.colors.mutedText, fontSize: 10, fontWeight: "700", letterSpacing: 1.1 },
    title: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.4,
    },
    newButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: 9,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    newButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
    pressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "600" },
    error: { color: theme.colors.error, fontSize: 13 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap },
    card: {
      width: cardWidth,
      overflow: "hidden",
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      ...theme.shadows.sm,
    },
    cardPressed: { opacity: 0.64 },
    preview: {
      height: wide ? 132 : 108,
      position: "relative",
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceMuted,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(15, 23, 42, 0.08)",
    },
    previewStamp: { position: "absolute", left: 15, top: 15, width: 7, height: 7, borderRadius: 4 },
    previewRect: {
      position: "absolute",
      left: "18%",
      top: "31%",
      width: "34%",
      height: "38%",
      borderWidth: 2,
      borderRadius: 10,
      transform: [{ rotate: "-4deg" }],
    },
    previewCircle: {
      position: "absolute",
      right: "15%",
      top: "24%",
      width: 42,
      height: 42,
      borderWidth: 2,
      borderRadius: 12,
    },
    previewArrow: {
      position: "absolute",
      left: "48%",
      top: "62%",
      width: "30%",
      height: 2,
      transform: [{ rotate: "-15deg" }],
    },
    previewInitial: {
      position: "absolute",
      right: 11,
      bottom: -11,
      fontSize: 58,
      fontWeight: "700",
      opacity: 0.08,
    },
    cardBody: { gap: 6, padding: 13 },
    cardTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    cardMeta: { color: theme.colors.mutedText, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
    cardDate: { color: theme.colors.mutedText, fontSize: 11 },
    emptyCard: {
      alignItems: "center",
      gap: 8,
      padding: theme.spacing[8],
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: "dashed",
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    emptyCanvas: {
      width: 150,
      height: 92,
      position: "relative",
      marginBottom: 8,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
    },
    emptyShapeA: {
      position: "absolute",
      left: 28,
      top: 23,
      width: 48,
      height: 33,
      borderWidth: 2,
      borderColor: theme.colors.text,
      borderRadius: 10,
      transform: [{ rotate: "-5deg" }],
    },
    emptyShapeB: {
      position: "absolute",
      right: 28,
      top: 30,
      width: 29,
      height: 29,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.colors.text,
    },
    emptyLine: {
      position: "absolute",
      left: 64,
      top: 59,
      width: 45,
      height: 2,
      backgroundColor: theme.colors.text,
      transform: [{ rotate: "-12deg" }],
    },
    emptyTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
    emptyBody: {
      maxWidth: 420,
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    emptyCtaButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: 9,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primary,
      marginTop: theme.spacing[2],
      ...theme.shadows.sm,
    },
    emptyCtaButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
    modalScrim: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 20,
      elevation: 20,
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
      backgroundColor: theme.colors.overlay,
    },
    modalCard: {
      width: "100%",
      maxWidth: 440,
      gap: 12,
      padding: 24,
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      ...theme.shadows.xl,
    },
    modalIcon: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.accentSoft,
    },
    modalTitle: { color: theme.colors.text, fontSize: 21, fontWeight: "600" },
    modalBody: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19 },
    input: {
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: theme.radius.medium,
      borderWidth: 1.5,
      borderColor: theme.colors.borderDefault,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      fontSize: 15,
    },
    modalError: { color: theme.colors.error, fontSize: 12 },
    modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
    cancelButton: { paddingHorizontal: 15, paddingVertical: 11 },
    cancelText: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "700" },
    createButton: {
      minWidth: 112,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    createText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  });
}
