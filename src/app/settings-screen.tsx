import { Bot, Check, Minus, Plus, ScrollText, Shield, Volume2 } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from "react-native";

import {
  resolveThemeMode,
  type AppSettings,
  type SettingsStore,
  type ThemePreference,
} from "./settings-store";
import { translate, type LocalePreference } from "./i18n";
import { LocaleContext, useTranslate, type Translator } from "./locale";
import { DARK_THEME, LIGHT_THEME, ThemeContext, useTheme } from "./theme";
import { triggerClickFeedback } from "./press-feedback";
import { useUiSound } from "./ui-sound-context";
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
  const systemDark = useColorScheme() === "dark";
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

  async function updateThemePreference(preference: ThemePreference): Promise<void> {
    const next = await store.update((current) => ({ ...current, themePreference: preference }));
    if (next.ok) {
      setSettings(next.value);
      onSettingsChanged?.();
    }
  }

  async function updateLocalePreference(preference: LocalePreference): Promise<void> {
    const next = await store.update((current) => ({ ...current, localePreference: preference }));
    if (next.ok) {
      setSettings(next.value);
      onSettingsChanged?.();
    }
  }

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

  const resolvedMode = resolveThemeMode(settings?.themePreference ?? "system", systemDark);
  const themeContext = resolvedMode === "dark" ? DARK_THEME : LIGHT_THEME;

  return (
    <LocaleContext.Provider value={locale}>
      <ThemeContext.Provider value={themeContext}>
        <SettingsContent
          confirmClearSearchHistory={confirmClearSearchHistory}
          onThemeChange={(preference) => void updateThemePreference(preference)}
          onLocaleChange={(preference) => void updateLocalePreference(preference)}
          onEditorChange={(patch) => void updateEditor(patch)}
          onClipboardReadChange={(value) => void updateClipboardRead(value)}
          onInteractionChange={(patch) => void updateInteraction(patch)}
          onOpenSidebar={onOpenSidebar}
          onWholeWorkspaceAiSearchChange={(value) => void updateWholeWorkspaceAiSearch(value)}
          {...(onClearAiConversations ? { onClearAiConversations } : {})}
          {...(onClearAiAudit ? { onClearAiAudit } : {})}
          settings={settings}
        />
      </ThemeContext.Provider>
    </LocaleContext.Provider>
  );
}

function SettingsContent({
  confirmClearSearchHistory,
  onThemeChange,
  onLocaleChange,
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
  onThemeChange: (preference: ThemePreference) => void;
  onLocaleChange: (preference: LocalePreference) => void;
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
  return (
    <View style={styles.screen}>
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
      <ScrollView
        accessibilityLabel={t("settings.title")}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        <Section title={t("settings.editor")} styles={styles} theme={theme}>
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
                thumbColor="#FFFFFF"
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
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
                thumbColor="#FFFFFF"
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
                value={settings?.editor.wordWrap ?? true}
              />
            }
          />
        </Section>

        <Section title={t("settings.interaction")} styles={styles} theme={theme}>
          <SettingRow
            icon={null}
            label={t("settings.clickVibration")}
            styles={styles}
            theme={theme}
            trailing={
              <View style={styles.hapticControls}>
                <Pressable
                  accessibilityLabel="测试点击震动"
                  onPress={() => triggerClickFeedback(settings?.interaction.clickVibration ?? true)}
                  style={styles.testHaptic}
                >
                  <Text style={styles.testHapticText}>试一下</Text>
                </Pressable>
                <Switch
                  accessibilityLabel={t("settings.clickVibration")}
                  onValueChange={(clickVibration) => onInteractionChange({ clickVibration })}
                  thumbColor="#FFFFFF"
                  trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
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
                  thumbColor="#FFFFFF"
                  trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
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
                onChange={(soundVolume) => onInteractionChange({ soundVolume: soundVolume / 100 })}
                step={10}
                styles={styles}
                suffix="%"
                theme={theme}
                value={Math.round((settings?.interaction.soundVolume ?? 0.35) * 100)}
              />
            }
          />
        </Section>

        <Section title={t("settings.security")} styles={styles} theme={theme}>
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
                thumbColor="#FFFFFF"
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
                value={settings?.security.allowClipboardRead ?? true}
              />
            }
          />
        </Section>
        <Section title={t("settings.ai")} styles={styles} theme={theme}>
          <SettingRow
            icon={Bot}
            label={t("settings.aiWholeWorkspace")}
            styles={styles}
            theme={theme}
            trailing={
              <Switch
                accessibilityLabel={t("settings.aiWholeWorkspace")}
                onValueChange={onWholeWorkspaceAiSearchChange}
                thumbColor="#FFFFFF"
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.text }}
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
      </ScrollView>
    </View>
  );
}

function Section({
  children,
  styles,
  theme,
  title,
}: Readonly<{
  children: ReactNode;
  styles: ReturnType<typeof useMemoStyles>;
  theme: ReturnType<typeof useTheme>;
  title: string;
}>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
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
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 20, gap: 28 },
    pageHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      minHeight: 74,
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
    pageTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.6 },
    section: { gap: 9 },
    sectionTitle: {
      color: theme.colors.mutedText,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      paddingBottom: 2,
    },
    card: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
      overflow: "hidden",
    },
    row: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    rowPressed: { opacity: 0.62 },
    rowLabel: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    rowValue: { maxWidth: "55%", color: theme.colors.mutedText, fontSize: 13, textAlign: "right" },
    hapticControls: { flexDirection: "row", alignItems: "center", gap: 8 },
    testHaptic: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceMuted,
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    stepButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    stepValue: { minWidth: 48, color: theme.colors.text, fontSize: 13, textAlign: "center" },
  });
}
