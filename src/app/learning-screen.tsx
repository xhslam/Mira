import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Bell,
  BookOpen,
  Captions,
  Compass,
  Headphones,
  LibraryBig,
  PlusSquare,
  Search,
  Settings2,
  Languages,
  UserRound,
} from "lucide-react-native";
import type { AppServices } from "./app-services";
import { useTheme, type Theme } from "./theme";
import { AiProviderSheet } from "./ai-provider-sheet";
import { createExpoLearningStore } from "../learning/expo-learning-store";
import { seedLearningSnapshot } from "../learning/learning-seed";
import { LibraryScreen } from "../learning/library-screen";
import { CraftScreen } from "../learning/craft-screen";
import { DiscoverScreen } from "../learning/discover-screen";
import { LearningHomeScreen, LearningImportSheet } from "../learning/learning-home-screen";
import { openLearningResource } from "../learning/learning-session";
import { hasLearningSttKey, saveLearningSttKey } from "../learning/learning-stt";
import { hasLearningTtsKey, saveLearningTtsKey } from "../learning/learning-tts";
import { PracticeScreen } from "../learning/practice-screen";
import { PhraseMemoryScreen } from "../learning/phrase-memory-screen";
import { LearningResourceSearchSheet } from "../learning/learning-resource-search-sheet";
import type {
  LearningResource,
  LearningSection,
  LearningSnapshot,
} from "../learning/learning-types";

type PrimarySection = Extract<
  LearningSection,
  "home" | "discover" | "library" | "practice" | "settings"
>;

type TabDefinition = Readonly<{
  id: PrimarySection;
  label: string;
  icon: typeof Compass;
}>;

const TABS: readonly TabDefinition[] = Object.freeze([
  Object.freeze({ id: "home", label: "首页", icon: BookOpen }),
  Object.freeze({ id: "discover", label: "发现", icon: Compass }),
  Object.freeze({ id: "library", label: "资料库", icon: LibraryBig }),
  Object.freeze({ id: "settings", label: "个人资料", icon: UserRound }),
]);

export function LearningScreen({ services }: Readonly<{ services: AppServices }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const store = useMemo(() => createExpoLearningStore(), []);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showResourceSearch, setShowResourceSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        await store.initialize();
        const loaded = await store.load();
        const seeded = seedLearningSnapshot(loaded, new Date().toISOString());
        if (seeded !== loaded) await store.save(seeded);
        if (!cancelled) setSnapshot(seeded);
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "学习数据暂时无法载入。");
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [store, loadRevision]);

  function retryLoad() {
    setError(null);
    setLoadRevision((revision) => revision + 1);
  }

  async function update(next: LearningSnapshot) {
    setSnapshot(next);
    try {
      await store.save(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "修改暂时无法保存。");
    }
  }

  if (!snapshot) {
    return (
      <View style={styles.loading}>
        {error ? (
          <>
            <Text style={styles.loadingError}>学习资料暂时无法打开。</Text>
            <Text style={styles.loadingText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={retryLoad} style={styles.loadingRetry}>
              <Text style={styles.loadingRetryText}>重新打开</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>正在准备学习资料</Text>
          </>
        )}
      </View>
    );
  }

  const activeSnapshot = snapshot;
  const showingPhraseMemory =
    activeSnapshot.ui.section === "phrase-memory" || activeSnapshot.ui.section === "vocabulary";
  const section: PrimarySection = showingPhraseMemory
    ? "settings"
    : activeSnapshot.ui.section === "practice"
      ? "practice"
      : TABS.some((tab) => tab.id === activeSnapshot.ui.section)
        ? (activeSnapshot.ui.section as PrimarySection)
        : "home";

  function navigate(next: PrimarySection) {
    void update(
      Object.freeze({
        ...activeSnapshot,
        ui: Object.freeze({ ...activeSnapshot.ui, section: next }),
      }),
    );
  }

  function openResource(resource: LearningResource) {
    void update(openLearningResource(activeSnapshot, resource.id));
  }
  if (activeSnapshot.ui.section === "phrase-memory" || activeSnapshot.ui.section === "vocabulary") {
    return (
      <PhraseMemoryScreen
        snapshot={activeSnapshot}
        onChange={(next) => void update(next)}
        onClose={() =>
          void update(
            Object.freeze({
              ...activeSnapshot,
              ui: Object.freeze({ ...activeSnapshot.ui, section: "settings" }),
            }),
          )
        }
        theme={theme}
      />
    );
  }

  if (activeSnapshot.ui.section === "craft") {
    return (
      <CraftScreen
        services={services}
        snapshot={activeSnapshot}
        theme={theme}
        onChange={(next) => void update(next)}
        onClose={() =>
          void update(
            Object.freeze({
              ...activeSnapshot,
              ui: Object.freeze({ ...activeSnapshot.ui, section: "home" }),
            }),
          )
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>{sectionTitle(section)}</Text>
        </View>
        <View style={styles.headerActions}>
          {section === "home" ? (
            <Pressable
              accessibilityLabel="导入学习材料"
              accessibilityRole="button"
              onPress={() => setShowImportSheet(true)}
              style={styles.iconButton}
            >
              <PlusSquare color={theme.colors.text} size={25} />
            </Pressable>
          ) : null}
          {section === "home" || section === "library" ? (
            <Pressable
              accessibilityLabel={section === "library" ? "搜索资料库" : "搜索导入的文件"}
              accessibilityRole="button"
              onPress={() => setShowResourceSearch(true)}
              style={section === "library" ? styles.librarySearchButton : styles.iconButton}
            >
              <Search color={theme.colors.text} size={section === "library" ? 22 : 26} />
            </Pressable>
          ) : null}
          {section === "settings" ? <Bell color={theme.colors.mutedText} size={22} /> : null}
        </View>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={() => setError(null)} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>关闭</Text>
        </Pressable>
      ) : null}
      <View accessibilityRole="tablist" style={styles.sectionRail}>
        {TABS.map((tab) => {
          const selected = section === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => navigate(tab.id)}
              style={[styles.sectionPill, selected && styles.sectionPillActive]}
            >
              <Text style={[styles.sectionPillText, selected && styles.sectionPillTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === "practice" ? (
        <View style={styles.practiceShell}>
          <PracticeScreen
            services={services}
            snapshot={snapshot}
            onChange={(next) => void update(next)}
            theme={theme}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          key={section}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.contentScroll}
        >
          {section === "home" ? (
            <LearningHomeScreen
              snapshot={snapshot}
              theme={theme}
              onOpenImport={() => setShowImportSheet(true)}
              onOpenCraft={() =>
                void update(
                  Object.freeze({
                    ...activeSnapshot,
                    ui: Object.freeze({ ...activeSnapshot.ui, section: "craft" }),
                  }),
                )
              }
              onOpenLibrary={() => navigate("library")}
              onOpenResource={openResource}
            />
          ) : null}
          {section === "discover" ? (
            <DiscoverScreen
              snapshot={activeSnapshot}
              theme={theme}
              onChange={(next) => void update(next)}
            />
          ) : null}
          {section === "library" ? (
            <LibraryScreen
              services={services}
              snapshot={snapshot}
              onChange={(next) => void update(next)}
              onOpenPractice={(resource, snapshotForOpen = snapshot) =>
                void update(openLearningResource(snapshotForOpen, resource.id))
              }
              theme={theme}
            />
          ) : null}
          {section === "settings" ? (
            <SettingsScreen
              services={services}
              snapshot={snapshot}
              onChange={(next) => void update(next)}
              onOpenPhraseMemory={() =>
                void update(
                  Object.freeze({
                    ...snapshot,
                    ui: Object.freeze({ ...snapshot.ui, section: "phrase-memory" }),
                  }),
                )
              }
              styles={styles}
              theme={theme}
            />
          ) : null}
        </ScrollView>
      )}

      <LearningImportSheet
        visible={showImportSheet}
        theme={theme}
        onClose={() => setShowImportSheet(false)}
        onOpenLibrary={() => navigate("library")}
        onSelectIntent={(intent) =>
          void update(
            Object.freeze({
              ...activeSnapshot,
              ui: Object.freeze({ ...activeSnapshot.ui, section: "library", importIntent: intent }),
            }),
          )
        }
      />
      <LearningResourceSearchSheet
        visible={showResourceSearch}
        resources={activeSnapshot.resources}
        theme={theme}
        onClose={() => setShowResourceSearch(false)}
        onOpenResource={openResource}
      />
    </View>
  );
}

function SettingsScreen({
  services,
  snapshot,
  onChange,
  onOpenPhraseMemory,
  styles,
  theme,
}: Readonly<{
  services: AppServices;
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  onOpenPhraseMemory: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  const settings = snapshot.settings;
  const [providerSheetVisible, setProviderSheetVisible] = useState(false);
  const [mediaServicesVisible, setMediaServicesVisible] = useState(false);
  const [ttsBaseUrl, setTtsBaseUrl] = useState(settings.ttsBaseUrl);
  const [sttBaseUrl, setSttBaseUrl] = useState(settings.sttBaseUrl);
  const [ttsKey, setTtsKey] = useState("");
  const [sttKey, setSttKey] = useState("");
  const [mediaServiceBusy, setMediaServiceBusy] = useState(false);
  function patch(values: Partial<LearningSnapshot["settings"]>) {
    onChange(Object.freeze({ ...snapshot, settings: Object.freeze({ ...settings, ...values }) }));
  }
  async function saveMediaServices() {
    setMediaServiceBusy(true);
    try {
      if (ttsKey.trim()) await saveLearningTtsKey(ttsKey);
      if (sttKey.trim()) await saveLearningSttKey(sttKey);
      const [ttsStored, sttStored] = await Promise.all([hasLearningTtsKey(), hasLearningSttKey()]);
      patch({
        ttsBaseUrl: ttsBaseUrl.trim(),
        sttBaseUrl: sttBaseUrl.trim(),
        ttsApiKeyStored: ttsStored,
        sttApiKeyStored: sttStored,
      });
      setTtsKey("");
      setSttKey("");
      setMediaServicesVisible(false);
    } finally {
      setMediaServiceBusy(false);
    }
  }
  return (
    <View style={styles.settingsPage}>
      <SettingRow
        icon={Captions}
        title="显示当前字幕"
        detail="学习时默认显示英文"
        value={settings.autoSpeakResponses}
        onChange={(value) => patch({ autoSpeakResponses: value })}
        styles={styles}
        theme={theme}
      />
      <SettingRow
        icon={Languages}
        title="逐句翻译"
        detail="需要时显示中文释义"
        value={settings.translationTargetLanguage === "zh-CN"}
        onChange={(value) => patch({ translationTargetLanguage: value ? "zh-CN" : "en-US" })}
        styles={styles}
        theme={theme}
      />
      <SettingRow
        icon={Headphones}
        title="单句循环"
        detail={`默认重复 ${settings.echoLoopCount} 次`}
        value={settings.echoLoopCount > 1}
        onChange={(value) => patch({ echoLoopCount: value ? 3 : 1 })}
        styles={styles}
        theme={theme}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onOpenPhraseMemory}
        style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
      >
        <View style={styles.settingsIcon}>
          <BookOpen color={theme.colors.accent} size={21} />
        </View>
        <View style={styles.settingsCopy}>
          <Text style={styles.settingsTitle}>短语与记忆</Text>
          <Text style={styles.settingsDetail}>
            {snapshot.vocabulary.length} 个短语 · {snapshot.memories.length} 条记忆
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMediaServicesVisible(true)}
        style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
      >
        <View style={styles.settingsIcon}>
          <Headphones color={theme.colors.accent} size={21} />
        </View>
        <View style={styles.settingsCopy}>
          <Text style={styles.settingsTitle}>媒体转写与语音</Text>
          <Text style={styles.settingsDetail}>
            STT {settings.sttApiKeyStored ? "已配置" : "未配置"} · TTS{" "}
            {settings.ttsApiKeyStored ? "已配置" : "未配置"}
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setProviderSheetVisible(true)}
        style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
      >
        <View style={styles.settingsIcon}>
          <Settings2 color={theme.colors.accent} size={21} />
        </View>
        <View style={styles.settingsCopy}>
          <Text style={styles.settingsTitle}>学习 AI Provider</Text>
          <Text style={styles.settingsDetail}>用于改写、解释和结构化分析</Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </Pressable>
      <Modal
        transparent
        visible={mediaServicesVisible}
        animationType="slide"
        onRequestClose={() => setMediaServicesVisible(false)}
      >
        <View style={styles.mediaServiceBackdrop}>
          <View style={styles.mediaServiceSheet}>
            <Text style={styles.mediaServiceTitle}>媒体转写与语音</Text>
            <Text style={styles.mediaServiceCopy}>
              地址只保存到学习设置；密钥仅安全存储在本设备，不会显示或写入普通数据库。
            </Text>
            <Text style={styles.mediaServiceLabel}>STT HTTPS Base URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://api.example.com/v1"
              placeholderTextColor={theme.colors.mutedText}
              value={sttBaseUrl}
              onChangeText={setSttBaseUrl}
              style={styles.mediaServiceInput}
            />
            <Text style={styles.mediaServiceLabel}>STT API Key（留空则保留现有密钥）</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="sk-..."
              placeholderTextColor={theme.colors.mutedText}
              value={sttKey}
              onChangeText={setSttKey}
              style={styles.mediaServiceInput}
            />
            <Text style={styles.mediaServiceLabel}>TTS HTTPS Base URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://api.example.com/v1"
              placeholderTextColor={theme.colors.mutedText}
              value={ttsBaseUrl}
              onChangeText={setTtsBaseUrl}
              style={styles.mediaServiceInput}
            />
            <Text style={styles.mediaServiceLabel}>TTS API Key（留空则保留现有密钥）</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="sk-..."
              placeholderTextColor={theme.colors.mutedText}
              value={ttsKey}
              onChangeText={setTtsKey}
              style={styles.mediaServiceInput}
            />
            <View style={styles.mediaServiceActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMediaServicesVisible(false)}
                style={styles.mediaServiceSecondary}
              >
                <Text style={styles.mediaServiceSecondaryText}>取消</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={mediaServiceBusy}
                onPress={() => void saveMediaServices()}
                style={styles.mediaServicePrimary}
              >
                <Text style={styles.mediaServicePrimaryText}>
                  {mediaServiceBusy ? "保存中" : "安全保存"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <AiProviderSheet
        visible={providerSheetVisible}
        onClose={() => setProviderSheetVisible(false)}
        manager={services.aiProviderProfiles}
        connectionTester={services.aiConnectionTester}
        settingsStore={services.settingsStore}
        onChanged={() => {
          void services.aiProviderProfiles.list().then((profiles) => {
            const next =
              profiles.find((item) => item.profile.id === settings.selectedProviderProfileId) ??
              profiles[0];
            if (next) patch({ selectedProviderProfileId: next.profile.id });
          });
        }}
      />
    </View>
  );
}

function SettingRow({
  detail,
  icon: Icon,
  onChange,
  styles,
  theme,
  title,
  value,
}: Readonly<{
  detail: string;
  icon: typeof Captions;
  onChange: (value: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  title: string;
  value: boolean;
}>) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsIcon}>
        <Icon color={theme.colors.accent} size={21} />
      </View>
      <View style={styles.settingsCopy}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.settingsDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#4A4A4A", true: theme.colors.accent }}
        thumbColor={value ? "#FFFFFF" : "#D0D0D0"}
      />
    </View>
  );
}

function sectionTitle(section: PrimarySection) {
  return section === "home"
    ? "学习"
    : section === "discover"
      ? "发现"
      : section === "library"
        ? "资料库"
        : section === "practice"
          ? "沉浸学习"
          : "个人资料";
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { backgroundColor: "#020817", flex: 1 },
    loading: {
      alignItems: "center",
      backgroundColor: theme.colors.background,
      flex: 1,
      gap: 12,
      justifyContent: "center",
    },
    loadingText: { color: theme.colors.mutedText, fontSize: 13, textAlign: "center" },
    loadingError: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "600",
      textAlign: "center",
    },
    loadingRetry: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.medium,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    loadingRetryText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "600" },
    sectionRail: {
      alignSelf: "stretch",
      borderBottomColor: "rgba(123, 145, 183, 0.2)",
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      marginHorizontal: 18,
    },
    sectionPill: {
      alignItems: "center",
      borderBottomColor: "transparent",
      borderBottomWidth: 2,
      flex: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 4,
    },
    sectionPillActive: {
      borderBottomColor: "#3C84FF",
      shadowColor: "#3C84FF",
      shadowOpacity: 0.7,
      shadowRadius: 7,
    },
    sectionPillText: { color: "#7D8492", fontSize: 12, fontWeight: "600" },
    sectionPillTextActive: { color: "#F7F9FF", fontWeight: "700" },
    header: {
      alignItems: "center",
      backgroundColor: "#020817",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 12,
      paddingHorizontal: 20,
      paddingTop: 18,
    },
    brand: {
      color: theme.colors.text,
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: -1,
      lineHeight: 37,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: "700",
      letterSpacing: -0.6,
      lineHeight: 33,
    },
    headerActions: { alignItems: "center", flexDirection: "row", gap: 8 },
    iconButton: {
      alignItems: "center",
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    librarySearchButton: {
      alignItems: "center",
      backgroundColor: "rgba(18, 27, 45, 0.86)",
      borderColor: "rgba(130, 151, 188, 0.2)",
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    contentScroll: { flex: 1, minHeight: 0 },
    content: { flexGrow: 1, paddingBottom: 64 },
    practiceShell: { flex: 1, minHeight: 0 },
    error: {
      alignItems: "center",
      backgroundColor: theme.colors.warningSurface,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginHorizontal: 20,
      padding: 12,
    },
    errorText: { color: theme.colors.warningText, flex: 1, fontSize: 12 },
    errorDismiss: { color: theme.colors.warningText, fontSize: 12, fontWeight: "600" },
    subscription: { gap: 24 },
    sourceStrip: { gap: 17, paddingHorizontal: 20, paddingTop: 1 },
    sourceItem: { alignItems: "center", gap: 7, width: 70 },
    sourceAvatar: {
      alignItems: "center",
      borderColor: "#222222",
      borderRadius: 33,
      borderWidth: 2,
      height: 62,
      justifyContent: "center",
      width: 62,
    },
    sourceInitial: { color: "#FFFFFF", fontSize: 22, fontWeight: "600" },
    sourceName: { color: theme.colors.text, fontSize: 11, textAlign: "center", width: 75 },
    feed: { gap: 20, paddingHorizontal: 20 },
    feedRow: { flexDirection: "row", gap: 13 },
    thumbnail: { borderRadius: 10, height: 91, overflow: "hidden", padding: 10, width: 142 },
    thumbnailText: {
      color: "rgba(255,255,255,0.92)",
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 17,
    },
    durationBadge: {
      alignSelf: "flex-end",
      backgroundColor: "rgba(0,0,0,0.78)",
      borderRadius: 10,
      marginTop: "auto",
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    durationText: { color: "#FFFFFF", fontSize: 10, fontWeight: "600" },
    feedCopy: { flex: 1, gap: 4, paddingTop: 2 },
    feedTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700", lineHeight: 21 },
    feedSource: { color: theme.colors.mutedText, fontSize: 13 },
    feedMeta: { color: "#737373", fontSize: 12, marginTop: 5 },
    emptyFeed: { alignItems: "center", gap: 12, paddingHorizontal: 38, paddingTop: 85 },
    emptyFeedTitle: {
      color: theme.colors.text,
      fontSize: 23,
      fontWeight: "600",
      textAlign: "center",
    },
    emptyFeedCopy: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    emptyFeedButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    emptyFeedButtonText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "700" },
    mediaServiceBackdrop: {
      backgroundColor: "rgba(0,0,0,0.42)",
      flex: 1,
      justifyContent: "flex-end",
      padding: 14,
    },
    mediaServiceSheet: {
      backgroundColor: theme.colors.canvas,
      borderRadius: 16,
      gap: 10,
      padding: 20,
    },
    mediaServiceTitle: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 23,
      fontWeight: "700",
    },
    mediaServiceCopy: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    mediaServiceLabel: { color: theme.colors.text, fontSize: 12, fontWeight: "600", marginTop: 4 },
    mediaServiceInput: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      color: theme.colors.text,
      fontSize: 14,
      minHeight: 44,
      paddingHorizontal: 14,
    },
    mediaServiceActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
      marginTop: 8,
    },
    mediaServiceSecondary: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: 17,
    },
    mediaServiceSecondaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    mediaServicePrimary: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 999,
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: 17,
    },
    mediaServicePrimaryText: { color: theme.colors.canvas, fontSize: 13, fontWeight: "700" },
    settingsPage: { gap: 0, paddingHorizontal: 20, paddingTop: 16 },
    settingsRow: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 70,
      paddingVertical: 10,
    },
    settingsIcon: {
      alignItems: "center",
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    settingsCopy: { flex: 1, gap: 3 },
    settingsTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "500" },
    settingsDetail: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    settingsChevron: { color: theme.colors.mutedText, fontSize: 24, fontWeight: "300" },
    tabBar: {
      alignItems: "flex-start",
      backgroundColor: "rgba(20,20,20,0.96)",
      borderColor: "rgba(255,255,255,0.08)",
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      bottom: 14,
      flexDirection: "row",
      left: 14,
      paddingHorizontal: 4,
      paddingVertical: 7,
      position: "absolute",
      right: 14,
    },
    tab: { alignItems: "center", flex: 1, gap: 3, minHeight: 48 },
    tabIcon: {
      alignItems: "center",
      borderRadius: 999,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    tabIconSelected: { backgroundColor: theme.colors.accent },
    tabLabel: { color: theme.colors.mutedText, fontSize: 11, fontWeight: "700" },
    tabLabelSelected: { color: theme.colors.accent },
    pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  });
}
