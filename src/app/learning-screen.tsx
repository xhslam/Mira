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
  BookOpen,
  Captions,
  ChevronLeft,
  Headphones,
  PlusSquare,
  Search,
  Settings2,
  Languages,
} from "lucide-react-native";
import type { AppServices } from "./app-services";
import { useTheme, type Theme } from "./theme";
import { AiProviderSheet } from "./ai-provider-sheet";
import { createExpoLearningStore } from "../learning/expo-learning-store";
import { seedLearningSnapshot } from "../learning/learning-seed";
import { LibraryScreen } from "../learning/library-screen";
import { CraftScreen } from "../learning/craft-screen";
import { LearningHomeScreen, LearningImportSheet } from "../learning/learning-home-screen";
import {
  isLearningMainSection,
  LEARNING_MAIN_TABS,
  resolveLearningSurface,
  type LearningMainSection,
} from "../learning/learning-navigation";
import { openLearningResource } from "../learning/learning-session";
import { hasLearningSttKey, saveLearningSttKey } from "../learning/learning-stt";
import { hasLearningTtsKey, saveLearningTtsKey } from "../learning/learning-tts";
import { PracticeScreen } from "../learning/practice-screen";
import { PhraseMemoryScreen } from "../learning/phrase-memory-screen";
import { LearningResourceSearchSheet } from "../learning/learning-resource-search-sheet";
import { UrlImportScreen } from "../learning/url-import-screen";
import type { LearningResource, LearningSnapshot } from "../learning/learning-types";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";

export function LearningScreen({
  services,
  onOpenSidebar,
}: Readonly<{ services: AppServices; onOpenSidebar: () => void }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const store = useMemo(() => createExpoLearningStore(), []);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showResourceSearch, setShowResourceSearch] = useState(false);
  const [lastMainSection, setLastMainSection] = useState<LearningMainSection>("home");

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
  const section = resolveLearningSurface(activeSnapshot.ui.section);

  function navigate(next: LearningMainSection | "settings") {
    if (isLearningMainSection(next)) setLastMainSection(next);
    void update(
      Object.freeze({
        ...activeSnapshot,
        ui: Object.freeze({ ...activeSnapshot.ui, section: next }),
      }),
    );
  }

  function openSettings() {
    if (isLearningMainSection(section)) setLastMainSection(section);
    navigate("settings");
  }

  function openCraft() {
    if (isLearningMainSection(section)) setLastMainSection(section);
    void update(
      Object.freeze({
        ...activeSnapshot,
        ui: Object.freeze({ ...activeSnapshot.ui, section: "craft" }),
      }),
    );
  }

  function openUrlImport() {
    if (isLearningMainSection(section)) setLastMainSection(section);
    void update(
      Object.freeze({
        ...activeSnapshot,
        ui: Object.freeze({
          ...activeSnapshot.ui,
          section: "url-import",
          importIntent: null,
        }),
      }),
    );
  }

  function openResource(resource: LearningResource) {
    if (isLearningMainSection(section)) setLastMainSection(section);
    void update(openLearningResource(activeSnapshot, resource.id));
  }

  function openLibraryResource(
    resource: LearningResource,
    snapshotForOpen: LearningSnapshot = activeSnapshot,
  ) {
    setLastMainSection("library");
    void update(openLearningResource(snapshotForOpen, resource.id));
  }
  if (section === "phrase-memory") {
    return (
      <View style={styles.root}>
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
        <FloatingSidebarButton onPress={onOpenSidebar} styles={styles} theme={theme} />
      </View>
    );
  }

  if (section === "craft") {
    return (
      <View style={styles.root}>
        <CraftScreen
          services={services}
          snapshot={activeSnapshot}
          theme={theme}
          onChange={(next) => void update(next)}
          onClose={() =>
            void update(
              Object.freeze({
                ...activeSnapshot,
                ui: Object.freeze({ ...activeSnapshot.ui, section: lastMainSection }),
              }),
            )
          }
        />
        <FloatingSidebarButton onPress={onOpenSidebar} styles={styles} theme={theme} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Pressable
            accessibilityLabel="打开全局侧边栏"
            accessibilityRole="button"
            onPress={onOpenSidebar}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <SidebarToggleIcon color={theme.colors.text} expanded={false} />
          </Pressable>
          {section === "practice" || section === "settings" || section === "url-import" ? (
            <Pressable
              accessibilityLabel={
                section === "practice"
                  ? lastMainSection === "library"
                    ? "返回资料"
                    : "返回今天"
                  : section === "url-import"
                    ? lastMainSection === "library"
                      ? "返回资料"
                      : "返回今天"
                    : "返回学习"
              }
              accessibilityRole="button"
              onPress={() => navigate(lastMainSection)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <ChevronLeft color={theme.colors.text} size={25} />
            </Pressable>
          ) : null}
          <Text
            style={
              section === "practice" || section === "settings" || section === "url-import"
                ? styles.headerTitle
                : styles.brand
            }
          >
            {section === "practice"
              ? "逐句学习"
              : section === "settings"
                ? "学习设置"
                : section === "url-import"
                  ? "通过 URL 导入"
                  : "学习"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {section === "library" ? (
            <Pressable
              accessibilityLabel="搜索资料"
              accessibilityRole="button"
              onPress={() => setShowResourceSearch(true)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Search color={theme.colors.text} size={23} />
            </Pressable>
          ) : null}
          {section === "library" ? (
            <Pressable
              accessibilityLabel="导入资料"
              accessibilityRole="button"
              onPress={() => setShowImportSheet(true)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <PlusSquare color={theme.colors.text} size={23} />
            </Pressable>
          ) : null}
          {isLearningMainSection(section) ? (
            <Pressable
              accessibilityLabel="学习设置"
              accessibilityRole="button"
              onPress={openSettings}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Settings2 color={theme.colors.mutedText} size={22} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={() => setError(null)} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>关闭</Text>
        </Pressable>
      ) : null}
      {isLearningMainSection(section) ? (
        <View accessibilityRole="tablist" style={styles.sectionRail}>
          {LEARNING_MAIN_TABS.map((tab) => {
            const selected = section === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => navigate(tab.id)}
                style={({ pressed }) => [
                  styles.sectionPill,
                  selected && styles.sectionPillActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.sectionPillText, selected && styles.sectionPillTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
              onOpenLibrary={() => navigate("library")}
              onOpenResource={openResource}
            />
          ) : null}
          {section === "library" ? (
            <LibraryScreen
              services={services}
              snapshot={snapshot}
              onChange={(next) => void update(next)}
              onOpenPractice={openLibraryResource}
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
          {section === "url-import" ? (
            <UrlImportScreen
              snapshot={snapshot}
              onChange={(next) => void update(next)}
              theme={theme}
            />
          ) : null}
        </ScrollView>
      )}

      <LearningImportSheet
        visible={showImportSheet}
        theme={theme}
        onClose={() => setShowImportSheet(false)}
        onOpenCraft={openCraft}
        onOpenUrl={openUrlImport}
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

function FloatingSidebarButton({
  onPress,
  styles,
  theme,
}: Readonly<{
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityLabel="打开全局侧边栏"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.floatingMenu, pressed && styles.pressed]}
    >
      <SidebarToggleIcon color={theme.colors.text} expanded={false} size={23} />
    </Pressable>
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
      <View style={styles.settingsGroup}>
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
      </View>
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { backgroundColor: "#020817", flex: 1 },
    floatingMenu: {
      position: "absolute",
      top: 8,
      left: 8,
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: "rgba(11, 18, 32, 0.9)",
      zIndex: 10,
      elevation: 10,
    },
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
      alignSelf: "flex-start",
      flexDirection: "row",
      gap: 24,
      marginHorizontal: 18,
    },
    sectionPill: {
      alignItems: "center",
      borderBottomColor: "transparent",
      borderBottomWidth: 2,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 2,
    },
    sectionPillActive: {
      borderBottomColor: "#3C84FF",
    },
    sectionPillText: { color: "#7D8492", fontSize: 14, fontWeight: "600" },
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
    headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
    headerIdentity: { alignItems: "center", flexDirection: "row", gap: 2 },
    iconButton: {
      alignItems: "center",
      height: 42,
      justifyContent: "center",
      width: 40,
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
    settingsPage: { paddingHorizontal: 18, paddingTop: 12 },
    settingsGroup: {
      backgroundColor: theme.colors.surface,
      borderColor: "rgba(115, 139, 181, 0.2)",
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      paddingHorizontal: 14,
    },
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
    pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  });
}
