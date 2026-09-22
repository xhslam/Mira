import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AiModelDiscovery } from "../ai/ai-model-discovery";
import { AI_PROVIDER_CATALOG, providerCatalogEntry } from "../ai/provider-catalog";
import type { AiProviderProfileManager } from "../ai/provider-profile-manager";
import type { AiProviderProfile } from "../ai/provider-profile";
import type { AppServices } from "./app-services";
import type { SettingsStore } from "./settings-store";
import { useTheme, type Theme } from "./theme";

type Draft = Readonly<{
  id: string | null;
  name: string;
  adapter: AiProviderProfile["adapter"];
  baseUrl: string;
  model: string;
  apiKey: string;
}>;

function emptyDraft(): Draft {
  return Object.freeze({
    id: null,
    name: "",
    adapter: "openai-compatible-chat",
    baseUrl: "",
    model: "",
    apiKey: "",
  });
}

function connectionCopy(status: AiProviderProfile["connectionStatus"]): string {
  switch (status) {
    case "connected":
      return "连接正常";
    case "authentication-failed":
      return "密钥无效";
    case "model-unavailable":
      return "模型不可用";
    case "rate-limited":
      return "请求受限";
    case "network-failed":
      return "网络失败";
    case "invalid-response":
      return "响应异常";
    case "untested":
      return "尚未测试";
  }
}

function providerSaveError(error: unknown): string {
  if (!(error instanceof Error)) return "AI 服务未能保存，请检查填写内容。";
  if (error.message === "INSECURE_BASE_URL") return "API Base URL 必须使用安全的 HTTPS 地址。";
  if (error.message === "INVALID_PROFILE") return "配置格式不正确，请检查名称、服务地址和模型 ID。";
  return error.message;
}

export function AiProviderSheet({
  visible,
  onClose,
  manager,
  modelDiscovery,
  connectionTester,
  settingsStore,
  selectedProfileId,
  onChanged,
  onSelected,
  onSaved,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  manager: AiProviderProfileManager;
  modelDiscovery: AiModelDiscovery;
  connectionTester: AppServices["aiConnectionTester"];
  settingsStore: SettingsStore;
  selectedProfileId?: string | null;
  onChanged: () => void;
  onSelected?: (profile: AiProviderProfile) => void;
  onSaved?: (profile: AiProviderProfile) => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof manager.list>>>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [catalogId, setCatalogId] = useState("custom");
  const [discoveredModels, setDiscoveredModels] = useState<readonly string[]>(Object.freeze([]));
  const [busy, setBusy] = useState<"save" | "models" | "test" | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setProfiles(await manager.list());
  }

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void Promise.all([manager.list(), settingsStore.load()])
      .then(([loaded, settings]) => {
        if (!active) return;
        setError(null);
        setNotice(null);
        setScreen(loaded.length === 0 ? "form" : "list");
        setDraft(emptyDraft());
        setDiscoveredModels(Object.freeze([]));
        setShowApiKey(false);
        setProfiles(loaded);
        setActiveProfileId(
          selectedProfileId !== undefined
            ? selectedProfileId
            : settings.ok
              ? settings.value.ai.activeProviderProfileId
              : null,
        );
      })
      .catch(() => {
        if (active) setError("AI 服务配置暂时无法载入。");
      });
    return () => {
      active = false;
    };
  }, [manager, selectedProfileId, settingsStore, visible]);

  const selectedCatalog = providerCatalogEntry(catalogId);
  const modelOptions = useMemo(() => {
    const candidates = [...selectedCatalog.suggestedModels, ...discoveredModels];
    return Object.freeze([...new Set(candidates)].filter((model) => model !== draft.model));
  }, [discoveredModels, draft.model, selectedCatalog.suggestedModels]);

  function chooseCatalog(nextId: string): void {
    const entry = providerCatalogEntry(nextId);
    setCatalogId(entry.id);
    setDiscoveredModels(Object.freeze([]));
    setError(null);
    setNotice(null);
    setDraft((current) =>
      Object.freeze({
        ...current,
        name: entry.id === "custom" ? "" : entry.name,
        adapter: entry.adapter,
        baseUrl: entry.baseUrl,
        model: entry.defaultModel,
      }),
    );
  }

  function startAdd(): void {
    setDraft(emptyDraft());
    setCatalogId("custom");
    setDiscoveredModels(Object.freeze([]));
    setError(null);
    setNotice(null);
    setScreen("form");
  }

  function edit(profile: AiProviderProfile): void {
    const matching =
      AI_PROVIDER_CATALOG.find((item) => item.baseUrl === profile.baseUrl)?.id ?? "custom";
    setCatalogId(matching);
    setDraft(
      Object.freeze({
        id: profile.id,
        name: profile.name,
        adapter: profile.adapter,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKey: "",
      }),
    );
    setDiscoveredModels(Object.freeze([]));
    setError(null);
    setNotice(null);
    setScreen("form");
  }

  async function select(profile: AiProviderProfile): Promise<void> {
    setBusy("save");
    setError(null);
    try {
      await settingsStore.update((current) => ({
        ...current,
        ai: Object.freeze({ ...current.ai, activeProviderProfileId: profile.id }),
      }));
      setActiveProfileId(profile.id);
      onSelected?.(profile);
      onChanged();
      onClose();
    } catch {
      setError("无法启用这个 AI 服务，请重试。");
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await manager.save({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        adapter: draft.adapter,
        baseUrl: draft.baseUrl,
        model: draft.model,
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
      });
      await settingsStore.update((current) => ({
        ...current,
        ai: Object.freeze({ ...current.ai, activeProviderProfileId: saved.profile.id }),
      }));
      setActiveProfileId(saved.profile.id);
      onSaved?.(saved.profile);
      onSelected?.(saved.profile);
      onChanged();
      onClose();
    } catch (saveError) {
      setError(providerSaveError(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function discoverModels(): Promise<void> {
    setBusy("models");
    setError(null);
    setNotice(null);
    try {
      const models = await modelDiscovery.discover({
        baseUrl: draft.baseUrl,
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
        ...(draft.id ? { profileId: draft.id as AiProviderProfile["id"] } : {}),
      });
      setDiscoveredModels(models);
      if (!draft.model && models[0]) setDraft((current) => ({ ...current, model: models[0]! }));
      setNotice(`已从服务读取 ${models.length} 个模型；也可以继续手动输入。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取模型列表。");
    } finally {
      setBusy(null);
    }
  }

  async function test(profile: AiProviderProfile): Promise<void> {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const result = await connectionTester.test(profile.id);
      await reload();
      if (result.ok) setNotice(`${profile.name} · ${profile.model} 连接正常。`);
      else setError(`连接测试失败：${connectionCopy(result.status)}。`);
    } catch {
      setError("连接测试未完成，请检查网络和服务地址。");
    } finally {
      setBusy(null);
    }
  }

  function confirmRemove(profile: AiProviderProfile): void {
    Alert.alert("移除 AI 服务？", "这会同时删除本机安全存储中的 API Key；依赖它的任务将暂停。", [
      { text: "取消", style: "cancel" },
      {
        text: "移除",
        style: "destructive",
        onPress: () => {
          void manager
            .remove(profile.id)
            .then(async () => {
              await settingsStore.update((current) => ({
                ...current,
                ai: Object.freeze({
                  ...current.ai,
                  activeProviderProfileId:
                    current.ai.activeProviderProfileId === profile.id
                      ? null
                      : current.ai.activeProviderProfileId,
                }),
              }));
              if (activeProfileId === profile.id) setActiveProfileId(null);
              await reload();
              onChanged();
            })
            .catch(() => setError("这个 AI 服务暂时无法移除。"));
        },
      },
    ]);
  }

  const saveDisabled =
    busy !== null ||
    !draft.name.trim() ||
    !draft.baseUrl.trim() ||
    !draft.model.trim() ||
    (!draft.id && !draft.apiKey.trim());

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            {screen === "form" && profiles.length > 0 ? (
              <Pressable
                accessibilityLabel="返回 AI 服务列表"
                onPress={() => setScreen("list")}
                style={styles.iconButton}
              >
                <ChevronLeft color={theme.colors.text} size={22} />
              </Pressable>
            ) : (
              <View style={styles.headerSpacer} />
            )}
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                {screen === "form" ? (draft.id ? "编辑 AI 服务" : "添加 AI 服务") : "AI 服务"}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {screen === "form" ? "选择服务，也可填写任意兼容接口" : "模型与密钥由你控制"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="关闭 AI 服务设置"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X color={theme.colors.text} size={20} />
            </Pressable>
          </View>

          {screen === "list" ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.securityNote}>
                <KeyRound color={theme.colors.primary} size={18} />
                <Text style={styles.securityText}>
                  API Key 只保存在本机安全存储中；翻译、陪练和 AI 助手都会使用你启用的服务。
                </Text>
              </View>
              {profiles.map(({ profile, hasApiKey }) => {
                const active = profile.id === activeProfileId;
                return (
                  <View
                    key={profile.id}
                    style={[styles.profileCard, active && styles.profileCardActive]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void select(profile)}
                      style={styles.profileMain}
                    >
                      <View style={[styles.providerIcon, active && styles.providerIconActive]}>
                        {active ? (
                          <Check color={theme.colors.primary} size={18} />
                        ) : (
                          <Cloud color={theme.colors.mutedText} size={18} />
                        )}
                      </View>
                      <View style={styles.profileCopy}>
                        <View style={styles.profileTitleRow}>
                          <Text style={styles.profileName}>{profile.name}</Text>
                          {active ? <Text style={styles.activeBadge}>当前使用</Text> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.profileMeta}>
                          {profile.model}
                        </Text>
                        <Text
                          style={[
                            styles.profileStatus,
                            profile.connectionStatus === "connected" && styles.profileStatusGood,
                          ]}
                        >
                          {hasApiKey ? connectionCopy(profile.connectionStatus) : "需要 API Key"}
                        </Text>
                      </View>
                      <ChevronRight color={theme.colors.mutedText} size={18} />
                    </Pressable>
                    <View style={styles.profileActions}>
                      <Pressable
                        disabled={busy !== null}
                        onPress={() => edit(profile)}
                        style={styles.smallAction}
                      >
                        <Edit3 color={theme.colors.mutedText} size={15} />
                        <Text style={styles.smallActionText}>编辑</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy !== null || !hasApiKey}
                        onPress={() => void test(profile)}
                        style={styles.smallAction}
                      >
                        {busy === "test" ? (
                          <ActivityIndicator color={theme.colors.primary} size="small" />
                        ) : (
                          <RefreshCw color={theme.colors.mutedText} size={15} />
                        )}
                        <Text style={styles.smallActionText}>测试连接</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`移除 ${profile.name}`}
                        disabled={busy !== null}
                        onPress={() => confirmRemove(profile)}
                        style={styles.deleteAction}
                      >
                        <Trash2 color={theme.colors.danger} size={16} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {notice ? <Feedback tone="success" text={notice} styles={styles} /> : null}
              {error ? <Feedback tone="error" text={error} styles={styles} /> : null}
              <Pressable
                onPress={startAdd}
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              >
                <Plus color={theme.colors.primary} size={18} />
                <Text style={styles.addButtonText}>添加另一个 AI 服务</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={styles.sectionLabel}>服务提供方</Text>
                <Text style={styles.sectionHint}>
                  预设只负责填入地址；模型列表可以从你的服务实时读取。
                </Text>
              </View>
              <View style={styles.catalogGrid}>
                {AI_PROVIDER_CATALOG.map((entry) => {
                  const selected = catalogId === entry.id;
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => chooseCatalog(entry.id)}
                      style={({ pressed }) => [
                        styles.catalogItem,
                        selected && styles.catalogItemActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.catalogName, selected && styles.catalogNameActive]}>
                        {entry.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.catalogDetail}>
                        {entry.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.form}>
                <Field
                  label="显示名称"
                  value={draft.name}
                  onChange={(name) => setDraft({ ...draft, name })}
                  styles={styles}
                />
                <Field
                  autoCapitalize="none"
                  keyboardType="url"
                  label="API Base URL"
                  placeholder="https://api.example.com/v1"
                  value={draft.baseUrl}
                  onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
                  styles={styles}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {draft.id ? "API Key（留空保留原密钥）" : "API Key"}
                  </Text>
                  <View style={styles.secretField}>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(apiKey) => setDraft({ ...draft, apiKey })}
                      placeholder={draft.id ? "已安全保存" : "sk-..."}
                      placeholderTextColor={theme.colors.mutedText}
                      secureTextEntry={!showApiKey}
                      style={styles.secretInput}
                      value={draft.apiKey}
                    />
                    <Pressable
                      accessibilityLabel={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      onPress={() => setShowApiKey((value) => !value)}
                      style={styles.secretToggle}
                    >
                      {showApiKey ? (
                        <EyeOff color={theme.colors.mutedText} size={18} />
                      ) : (
                        <Eye color={theme.colors.mutedText} size={18} />
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.modelHeader}>
                  <View style={styles.modelHeaderCopy}>
                    <Text style={styles.label}>模型 ID</Text>
                    <Text style={styles.fieldHint}>可从服务获取，也可直接输入任意模型 ID。</Text>
                  </View>
                  <Pressable
                    disabled={
                      busy !== null || !draft.baseUrl.trim() || (!draft.apiKey.trim() && !draft.id)
                    }
                    onPress={() => void discoverModels()}
                    style={({ pressed }) => [styles.fetchModels, pressed && styles.pressed]}
                  >
                    {busy === "models" ? (
                      <ActivityIndicator color={theme.colors.primary} size="small" />
                    ) : (
                      <RefreshCw color={theme.colors.primary} size={15} />
                    )}
                    <Text style={styles.fetchModelsText}>获取模型</Text>
                  </Pressable>
                </View>
                <Field
                  autoCapitalize="none"
                  label=""
                  placeholder="例如 provider/model-name"
                  value={draft.model}
                  onChange={(model) => setDraft({ ...draft, model })}
                  styles={styles}
                />
                {modelOptions.length > 0 ? (
                  <View style={styles.modelOptions}>
                    {modelOptions.slice(0, 18).map((model) => (
                      <Pressable
                        key={model}
                        onPress={() => setDraft({ ...draft, model })}
                        style={styles.modelChip}
                      >
                        <Text numberOfLines={1} style={styles.modelChipText}>
                          {model}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View>
                  <Text style={styles.label}>API 协议</Text>
                  <View style={styles.segmented}>
                    {(["openai-compatible-chat", "openai-responses"] as const).map((adapter) => (
                      <Pressable
                        key={adapter}
                        onPress={() => setDraft((current) => ({ ...current, adapter }))}
                        style={[styles.segment, draft.adapter === adapter && styles.segmentActive]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            draft.adapter === adapter && styles.segmentTextActive,
                          ]}
                        >
                          {adapter === "openai-compatible-chat"
                            ? "Chat Completions"
                            : "Responses + Search"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.fieldHint}>
                    大多数第三方服务使用 Chat Completions；仅确认支持 Responses API 时选择后者。
                  </Text>
                </View>
              </View>

              {notice ? <Feedback tone="success" text={notice} styles={styles} /> : null}
              {error ? <Feedback tone="error" text={error} styles={styles} /> : null}
              <Pressable
                disabled={saveDisabled}
                onPress={() => void save()}
                style={({ pressed }) => [
                  styles.primary,
                  (pressed || saveDisabled) && styles.primaryPressed,
                ]}
              >
                {busy === "save" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 color="#FFFFFF" size={18} />
                    <Text style={styles.primaryText}>保存并启用</Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.completionHint}>
                保存成功后会自动返回，并立即作为当前 AI 引擎。
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Feedback({
  tone,
  text,
  styles,
}: Readonly<{
  tone: "success" | "error";
  text: string;
  styles: ReturnType<typeof createStyles>;
}>) {
  return (
    <View
      style={[styles.feedback, tone === "success" ? styles.feedbackSuccess : styles.feedbackError]}
    >
      <Text style={tone === "success" ? styles.feedbackSuccessText : styles.feedbackErrorText}>
        {text}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  styles,
  placeholder,
  autoCapitalize = "sentences",
  keyboardType = "default",
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "url";
}>) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChange}
        placeholder={placeholder}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.colors.overlay },
    sheet: {
      maxHeight: "94%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    headerSpacer: { width: 44 },
    headerCopy: { minWidth: 0, flex: 1, alignItems: "center" },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    subtitle: { marginTop: 3, color: theme.colors.mutedText, fontSize: 12 },
    iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    content: { gap: theme.spacing[3], padding: theme.spacing[4], paddingBottom: 40 },
    securityNote: {
      flexDirection: "row",
      gap: theme.spacing[3],
      padding: theme.spacing[3],
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.primarySoft,
    },
    securityText: { flex: 1, color: theme.colors.primaryText, fontSize: 12, lineHeight: 18 },
    profileCard: {
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
    },
    profileCardActive: { borderColor: theme.colors.primary, ...theme.shadows.sm },
    profileMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[3],
      padding: theme.spacing[3],
    },
    providerIcon: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
    },
    providerIconActive: { backgroundColor: theme.colors.primarySoft },
    profileCopy: { minWidth: 0, flex: 1 },
    profileTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    profileName: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    activeBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      color: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
      fontSize: 10,
      fontWeight: "700",
    },
    profileMeta: { marginTop: 3, color: theme.colors.text, fontSize: 12 },
    profileStatus: { marginTop: 3, color: theme.colors.mutedText, fontSize: 11 },
    profileStatusGood: { color: theme.colors.success },
    profileActions: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      paddingHorizontal: theme.spacing[3],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.borderSubtle,
    },
    smallAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
    smallActionText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    deleteAction: {
      minWidth: 40,
      minHeight: 40,
      marginLeft: "auto",
      alignItems: "center",
      justifyContent: "center",
    },
    addButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    addButtonText: { color: theme.colors.primary, fontSize: 14, fontWeight: "700" },
    sectionLabel: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    sectionHint: { marginTop: 4, color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
    catalogGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
    catalogItem: {
      width: "48%",
      minHeight: 64,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    catalogItemActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    catalogName: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    catalogNameActive: { color: theme.colors.primary },
    catalogDetail: { marginTop: 3, color: theme.colors.mutedText, fontSize: 10 },
    form: {
      gap: theme.spacing[3],
      padding: theme.spacing[4],
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    field: { gap: 6 },
    label: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
    fieldHint: { marginTop: 5, color: theme.colors.mutedText, fontSize: 11, lineHeight: 16 },
    input: {
      minHeight: 46,
      paddingHorizontal: theme.spacing[3],
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      color: theme.colors.text,
      backgroundColor: theme.colors.canvas,
    },
    secretField: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.canvas,
    },
    secretInput: {
      minWidth: 0,
      flex: 1,
      minHeight: 44,
      paddingHorizontal: theme.spacing[3],
      color: theme.colors.text,
    },
    secretToggle: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    modelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    modelHeaderCopy: { minWidth: 0, flex: 1 },
    fetchModels: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
    },
    fetchModelsText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
    modelOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    modelChip: {
      maxWidth: "100%",
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceMuted,
    },
    modelChipText: { color: theme.colors.text, fontSize: 11, fontWeight: "600" },
    segmented: {
      flexDirection: "row",
      marginTop: 7,
      padding: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceMuted,
    },
    segment: {
      minHeight: 38,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
    },
    segmentActive: { backgroundColor: theme.colors.canvas, ...theme.shadows.sm },
    segmentText: { color: theme.colors.mutedText, fontSize: 11, fontWeight: "600" },
    segmentTextActive: { color: theme.colors.primary, fontWeight: "700" },
    feedback: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.medium },
    feedbackSuccess: { backgroundColor: theme.colors.successSoft },
    feedbackError: { backgroundColor: theme.colors.dangerSoft },
    feedbackSuccessText: { color: theme.colors.success, fontSize: 12, lineHeight: 18 },
    feedbackErrorText: { color: theme.colors.error, fontSize: 12, lineHeight: 18 },
    primary: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    primaryPressed: { opacity: 0.55 },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
    completionHint: { color: theme.colors.mutedText, fontSize: 11, textAlign: "center" },
    pressed: { opacity: 0.7 },
  });
}
