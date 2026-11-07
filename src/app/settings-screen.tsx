import {
  Bot,
  Check,
  ChevronRight,
  Minus,
  Plus,
  ScrollText,
  Shield,
  Volume2,
} from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { type AppSettings, type SettingsStore } from "./settings-store";
import { translate } from "./i18n";
import { LocaleContext, useTranslate, type Translator } from "./locale";
import { useTheme } from "./theme";
import { triggerClickFeedback } from "./press-feedback";
import { useUiSound } from "./ui-sound-context";
import { MiraAvatar, MiraSheet } from "./mira-controls";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";

export type SettingsScreenProps = Readonly<{
  onClearSearchHistory?: () => Promise<void>;
  onClearAiConversations?: () => Promise<void>;
  onClearAiAudit?: () => Promise<void>;
  onSettingsChanged?: () => void;
  onOpenSidebar: () => void;
  store: SettingsStore;
}>;

export function SettingsScreen({
  onClearSearchHistory,
  onClearAiConversations,
  onClearAiAudit,
  onSettingsChanged,
  onOpenSidebar,
  store,
}: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Resolved from the just-persisted preference so this screen switches
  // language immediately, before the shell reloads its own copy.
  const locale = "zh-CN" as const;
  const t: Translator = (key, values) => translate(locale, key, values);

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (active && result.ok) setSettings(result.value);
    });
    return () => {
      active = false;
    };
  }, [store]);

  async function updateEditor(patch: Partial<AppSettings["editor"]>): Promise<void> {
    const next = await store.update((current) => ({
      ...current,
      editor: Object.freeze({ ...current.editor, ...patch }),
    }));
    if (next.ok) {
      setSettings(next.value);
      onSettingsChanged?.();
    }
  }

  async function updateClipboardRead(allowClipboardRead: boolean): Promise<void> {
    const next = await store.update((current) => ({
      ...current,
      security: Object.freeze({ ...current.security, allowClipboardRead }),
    }));
    if (next.ok) setSettings(next.value);
  }

  async function updateInteraction(patch: Partial<AppSettings["interaction"]>): Promise<void> {
    const next = await store.update((current) => ({
      ...current,
      interaction: Object.freeze({ ...current.interaction, ...patch }),
    }));
    if (next.ok) {
      setSettings(next.value);
      onSettingsChanged?.();
    }
  }

  async function updateWholeWorkspaceAiSearch(allowWholeWorkspaceSearch: boolean): Promise<void> {
    const next = await store.update((current) => ({
      ...current,
      ai: Object.freeze({ ...current.ai, allowWholeWorkspaceSearch }),
    }));
    if (next.ok) setSettings(next.value);
  }

  function confirmClearSearchHistory(): void {
    Alert.alert(t("settings.clearHistoryTitle"), t("settings.clearHistoryBody"), [
      { text: t("settings.cancel"), style: "cancel" },
      {
        text: t("settings.clear"),
        style: "destructive",
        onPress: () => {
          void (onClearSearchHistory?.() ?? Promise.resolve())
            .then(() => {
              Alert.alert(t("settings.clearHistoryDone"), t("settings.clearHistoryDoneBody"));
            })
            .catch(() => {
              Alert.alert(t("settings.clearHistoryFailed"), t("settings.clearHistoryFailedBody"));
            });
        },
      },
    ]);
  }

  return (
    <LocaleContext.Provider value={locale}>
      <SettingsContent
        confirmClearSearchHistory={confirmClearSearchHistory}
        onEditorChange={(patch) => void updateEditor(patch)}
        onClipboardReadChange={(value) => void updateClipboardRead(value)}
        onInteractionChange={(patch) => void updateInteraction(patch)}
        onOpenSidebar={onOpenSidebar}
        onWholeWorkspaceAiSearchChange={(value) => void updateWholeWorkspaceAiSearch(value)}
        {...(onClearAiConversations ? { onClearAiConversations } : {})}
        {...(onClearAiAudit ? { onClearAiAudit } : {})}
        settings={settings}
      />
    </LocaleContext.Provider>
  );
}

function SettingsContent({
  confirmClearSearchHistory,
  onEditorChange,
  onClipboardReadChange,
  onInteractionChange,
  onWholeWorkspaceAiSearchChange,
  onOpenSidebar,
  onClearAiConversations,
  onClearAiAudit,
  settings,
}: Readonly<{
  confirmClearSearchHistory: () => void;
  onEditorChange: (patch: Partial<AppSettings["editor"]>) => void;
  onClipboardReadChange: (value: boolean) => void;
  onInteractionChange: (patch: Partial<AppSettings["interaction"]>) => void;
  onWholeWorkspaceAiSearchChange: (value: boolean) => void;
  onOpenSidebar: () => void;
  onClearAiConversations?: () => Promise<void>;
  onClearAiAudit?: () => Promise<void>;
  settings: AppSettings | null;
}>) {
  const theme = useTheme();
  const styles = useMemoStyles(theme);
  const t = useTranslate();
  const uiSound = useUiSound();

  const [category, setCategory] = useState<"editor" | "interaction" | "security" | "ai" | null>(
    null,
  );
  const categories = [
    { id: "editor", icon: ScrollText, label: t("settings.editor") },
    { id: "interaction", icon: Volume2, label: t("settings.interaction") },
    { id: "security", icon: Shield, label: t("settings.security") },
    { id: "ai", icon: Bot, label: t("settings.ai") },
  ] as const;

  return (
    <View style={styles.scroll}>
      <View style={styles.pageHeader}>
        <Pressable
          accessibilityLabel="打开全局侧边栏"
          accessibilityRole="button"
          onPress={onOpenSidebar}
          style={({ pressed }) => [styles.menuButton, pressed && styles.rowPressed]}
        >
          <SidebarToggleIcon color={theme.colors.text} expanded={false} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.pageTitle}>
          {t("settings.title")}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <MiraAvatar size={56} />
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>Mira</Text>
            <Text style={styles.identityMeta}>{t("settings.title")}</Text>
          </View>
        </View>
        {categories.map(({ id, icon: Icon, label }) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            onPress={() => setCategory(id)}
            style={({ pressed }) => [styles.categoryRow, pressed && styles.rowPressed]}
          >
            <View style={styles.categoryIcon}>
              <Icon color={theme.colors.text} size={20} />
            </View>
            <Text style={styles.rowLabel}>{label}</Text>
            <ChevronRight color={theme.colors.mutedText} size={18} />
          </Pressable>
        ))}
      </ScrollView>
      <MiraSheet
        visible={category !== null}
        title={categories.find(({ id }) => id === category)?.label ?? t("settings.title")}
        onClose={() => setCategory(null)}
      >
        {category === "editor" ? (
          <Section styles={styles} theme={theme}>
            <SettingRow
              icon={null}
              label={t("settings.fontSize")}
              styles={styles}
              theme={theme}
              trailing={
                <Stepper
                  label={t("settings.fontSize")}
                  maximum={24}
                  minimum={12}
                  onChange={(fontSize) => onEditorChange({ fontSize })}
                  styles={styles}
                  theme={theme}
                  value={settings?.editor.fontSize ?? 16}
                />
              }
            />
            <SettingRow
              icon={null}
              label={t("settings.lineHeight")}
              styles={styles}
              theme={theme}
              trailing={
                <Stepper
                  label={t("settings.lineHeight")}
                  maximum={2.2}
                  minimum={1.2}
                  onChange={(lineHeight) => onEditorChange({ lineHeight })}
                  precision={1}
                  step={0.1}
                  styles={styles}
                  theme={theme}
                  value={settings?.editor.lineHeight ?? 1.65}
                />
              }
            />
            <SettingRow
              icon={null}
              label={t("settings.autosave")}
              styles={styles}
              theme={theme}
              trailing={
                <Stepper
                  label={t("settings.autosave")}
                  maximum={10}
                  minimum={1}
                  onChange={(seconds) => onEditorChange({ autoSaveDelayMs: seconds * 1_000 })}
                  styles={styles}
                  suffix="s"
                  theme={theme}
                  value={(settings?.editor.autoSaveDelayMs ?? 2000) / 1000}
                />
              }
            />
            <SettingRow
              icon={null}
              label={t("settings.lineNumbers")}
              styles={styles}
              theme={theme}
              trailing={
                <Switch
                  accessibilityLabel={t("settings.showLineNumbers")}
                  onValueChange={(lineNumbers) => onEditorChange({ lineNumbers })}
                  value={settings?.editor.lineNumbers ?? true}
                />
              }
            />
            <SettingRow
              icon={null}
              label={t("settings.wordWrap")}
              styles={styles}
              theme={theme}
              trailing={
                <Switch
                  accessibilityLabel={t("settings.wrapLongLines")}
                  onValueChange={(wordWrap) => onEditorChange({ wordWrap })}
                  value={settings?.editor.wordWrap ?? true}
                />
              }
            />
          </Section>
        ) : null}

        {category === "interaction" ? (
          <Section styles={styles} theme={theme}>
            <SettingRow
              icon={null}
              label={t("settings.clickVibration")}
              styles={styles}
              theme={theme}
              trailing={
                <View style={styles.hapticControls}>
                  <Pressable
                    accessibilityLabel="测试点击震动"
                    onPress={() =>
                      triggerClickFeedback(settings?.interaction.clickVibration ?? true)
                    }
                    style={styles.testHaptic}
                  >
                    <Text style={styles.testHapticText}>试一下</Text>
                  </Pressable>
                  <Switch
                    accessibilityLabel={t("settings.clickVibration")}
                    onValueChange={(clickVibration) => onInteractionChange({ clickVibration })}
                    value={settings?.interaction.clickVibration ?? true}
                  />
                </View>
              }
            />
            <SettingRow
              icon={Volume2}
              label={t("settings.interfaceSounds")}
              styles={styles}
              theme={theme}
              trailing={
                <View style={styles.hapticControls}>
                  <Pressable
                    accessibilityLabel={t("settings.testSound")}
                    accessibilityRole="button"
                    disabled={!settings?.interaction.soundEnabled}
                    onPress={() => uiSound.play("success")}
                    style={[
                      styles.testHaptic,
                      !settings?.interaction.soundEnabled && styles.testControlDisabled,
                    ]}
                  >
                    <Text style={styles.testHapticText}>{t("settings.trySound")}</Text>
                  </Pressable>
                  <Switch
                    accessibilityLabel={t("settings.interfaceSounds")}
                    onValueChange={(soundEnabled) => onInteractionChange({ soundEnabled })}
                    value={settings?.interaction.soundEnabled ?? false}
                  />
                </View>
              }
            />
            <SettingRow
              icon={null}
              label={t("settings.soundVolume")}
              styles={styles}
              theme={theme}
              trailing={
                <Stepper
                  label={t("settings.soundVolume")}
                  maximum={100}
                  minimum={10}
                  onChange={(soundVolume) =>
                    onInteractionChange({ soundVolume: soundVolume / 100 })
                  }
                  step={10}
                  styles={styles}
                  suffix="%"
                  theme={theme}
                  value={Math.round((settings?.interaction.soundVolume ?? 0.35) * 100)}
                />
              }
            />
          </Section>
        ) : null}

        {category === "security" ? (
          <Section styles={styles} theme={theme}>
            <SettingRow
              icon={Check}
              label={t("settings.searchHistory")}
              onPress={confirmClearSearchHistory}
              styles={styles}
              theme={theme}
              value={t("settings.clearLocal")}
            />
            <SettingRow
              icon={Shield}
              label={t("settings.clipboard")}
              styles={styles}
              theme={theme}
              trailing={
                <Switch
                  accessibilityLabel={t("settings.allowClipboard")}
                  onValueChange={onClipboardReadChange}
                  value={settings?.security.allowClipboardRead ?? true}
                />
              }
            />
          </Section>
        ) : null}
        {category === "ai" ? (
          <Section styles={styles} theme={theme}>
            <SettingRow
              icon={Bot}
              label={t("settings.aiWholeWorkspace")}
              styles={styles}
              theme={theme}
              trailing={
                <Switch
                  accessibilityLabel={t("settings.aiWholeWorkspace")}
                  onValueChange={onWholeWorkspaceAiSearchChange}
                  value={settings?.ai.allowWholeWorkspaceSearch ?? false}
                />
              }
            />
            <SettingRow
              icon={Check}
              label={t("settings.clearAiConversations")}
              onPress={() => void onClearAiConversations?.()}
              styles={styles}
              theme={theme}
              value={t("settings.localOnly")}
            />
            <SettingRow
              icon={Shield}
              label={t("settings.clearAiAudit")}
              onPress={() => void onClearAiAudit?.()}
              styles={styles}
              theme={theme}
              value={t("settings.metadataOnly")}
            />
            <SettingRow
              icon={ScrollText}
              label={t("settings.licenses")}
              onPress={() =>
                Alert.alert(
                  "VMark AI Genie prompts · ISC",
                  "Copyright (c) 2026 Xiaolai Li\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the copyright and permission notice appear in all copies.\n\nSource: xiaolai/vmark @ 7e248a557fed26830e6496ced266ee4e967d549d",
                )
              }
              styles={styles}
              theme={theme}
              value={t("settings.thirdParty")}
            />
          </Section>
        ) : null}
      </MiraSheet>
    </View>
  );
}

function Section({
  children,
  styles,
}: Readonly<{
  children: ReactNode;
  styles: ReturnType<typeof useMemoStyles>;
  theme: ReturnType<typeof useTheme>;
}>) {
  return <View style={styles.card}>{children}</View>;
}

function SettingRow({
  icon: Icon,
  label,
  onPress,
  styles,
  theme,
  trailing,
  value,
}: Readonly<{
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>> | null;
  label: string;
  onPress?: () => void;
  styles: ReturnType<typeof useMemoStyles>;
  theme: ReturnType<typeof useTheme>;
  trailing?: ReactNode;
  value?: string;
}>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {Icon ? <Icon color={theme.colors.accent} size={18} /> : null}
      <Text style={styles.rowLabel}>{label}</Text>
      {trailing ?? (value ? <Text style={styles.rowValue}>{value}</Text> : null)}
    </Pressable>
  );
}

function Stepper({
  label,
  maximum,
  minimum,
  onChange,
  precision = 0,
  step = 1,
  styles,
  suffix = "",
  theme,
  value,
}: Readonly<{
  label: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  precision?: number;
  step?: number;
  styles: ReturnType<typeof useMemoStyles>;
  suffix?: string;
  theme: ReturnType<typeof useTheme>;
  value: number;
}>) {
  const t = useTranslate();
  const change = (direction: -1 | 1) => {
    const next = Math.max(minimum, Math.min(maximum, value + direction * step));
    onChange(Number(next.toFixed(precision)));
  };
  return (
    <View accessibilityLabel={`${label} ${value}`} style={styles.stepper}>
      <Pressable
        accessibilityLabel={t("settings.decrease", { label })}
        accessibilityRole="button"
        disabled={value <= minimum}
        onPress={() => change(-1)}
        style={styles.stepButton}
      >
        <Minus color={theme.colors.text} size={16} />
      </Pressable>
      <Text style={styles.stepValue}>
        {value.toFixed(precision)} {suffix}
      </Text>
      <Pressable
        accessibilityLabel={t("settings.increase", { label })}
        accessibilityRole="button"
        disabled={value >= maximum}
        onPress={() => change(1)}
        style={styles.stepButton}
      >
        <Plus color={theme.colors.text} size={16} />
      </Pressable>
    </View>
  );
}

function useMemoStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingHorizontal: 16, paddingBottom: 32 },
    pageHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      minHeight: 60,
    },
    identity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.large,
      padding: 16,
      marginVertical: 16,
    },
    identityCopy: { flex: 1, gap: 2 },
    identityTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "600" },
    identityMeta: { color: theme.colors.mutedText, fontSize: 13 },
    categoryRow: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      paddingHorizontal: 4,
    },
    categoryIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    menuButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.canvas,
    },
    pageTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "600", letterSpacing: -0.5 },
    card: {
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.canvas,
      overflow: "hidden",
    },
    row: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    rowPressed: { opacity: 0.62 },
    rowLabel: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    rowValue: { maxWidth: "55%", color: theme.colors.mutedText, fontSize: 13, textAlign: "right" },
    hapticControls: { flexDirection: "row", alignItems: "center", gap: 8 },
    testHaptic: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
    },
    testControlDisabled: { opacity: 0.4 },
    testHapticText: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
    segmented: {
      flexDirection: "row",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    segment: {
      minWidth: 50,
      minHeight: 32,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    segmentActive: { backgroundColor: theme.colors.text },
    segmentText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    segmentTextActive: { color: theme.colors.background },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
    },
    stepButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    stepValue: { minWidth: 48, color: theme.colors.text, fontSize: 13, textAlign: "center" },
  });
}
