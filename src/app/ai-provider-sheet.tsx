import { CircleAction } from "./mira-controls";
import {
  Check,
  ChevronRight,
  KeyRound,
  Trash2,
  ChevronDown,
  ChevronLeft,
  Plus,
} from "lucide-react-native";
import { useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import type { AiProviderProfileManager } from "../ai/provider-profile-manager";
import type { AiProviderProfile } from "../ai/provider-profile";
import { AI_PROVIDER_CATALOG } from "../ai/provider-catalog";
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

const EMPTY_DRAFT: Draft = Object.freeze({
  id: null,
  name: "DeepSeek",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
});

export function AiProviderSheet({
  visible,
  onClose,
  manager,
  connectionTester,
  modelDiscovery,
  settingsStore,
  onChanged,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  manager: AiProviderProfileManager;
  connectionTester: AppServices["aiConnectionTester"];
  modelDiscovery: AppServices["aiModelDiscovery"];
  settingsStore: SettingsStore;
  onChanged: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof manager.list>>>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [models, setModels] = useState<readonly string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setProfiles(await manager.list());
  }

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void manager
      .list()
      .then((loaded) => {
        if (active) setProfiles(loaded);
      })
      .catch(() => {
        if (active) setError("无法读取模型服务");
      });
    return () => {
      active = false;
    };
  }, [manager, visible]);

  function closeForm(): void {
    setModels([]);
    setShowForm(false);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  function requestClose(): void {
    if (busy) return;
    closeForm();
    if (!showForm) onClose();
  }

  function edit(profile: AiProviderProfile): void {
    setModels([]);
    setShowForm(true);
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
    setError(null);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
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
        ai: Object.freeze({
          ...current.ai,
          activeProviderProfileId: current.ai.activeProviderProfileId ?? saved.profile.id,
        }),
      }));
      await reload();
      closeForm();
      onChanged();
    } catch {
      setError("无法保存模型服务，请检查地址、模型 ID 和密钥。");
    } finally {
      setBusy(false);
    }
  }

  async function discoverModels(): Promise<void> {
    setBusy(true);
    setError(null);
    setModels([]);
    try {
      const saved = profiles.find(({ profile }) => profile.id === draft.id)?.profile;
      const models = await modelDiscovery.discover({
        baseUrl: draft.baseUrl,
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}),
        ...(saved && saved.baseUrl === draft.baseUrl.trim() ? { profileId: saved.id } : {}),
      });
      setModels(models);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取模型列表。");
    } finally {
      setBusy(false);
    }
  }

  async function test(profile: AiProviderProfile): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await connectionTester.test(profile.id);
      await reload();
      if (!result.ok) setError(`连接失败 · ${result.status}`);
    } catch {
      setError("无法测试连接");
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(profile: AiProviderProfile): void {
    Alert.alert("移除模型服务？", "将删除本机保存的密钥，并暂停使用此服务的自动任务。", [
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
              await reload();
              onChanged();
            })
            .catch(() => setError("无法移除模型服务"));
        },
      },
    ]);
  }

  return (
    <Modal animationType="slide" onRequestClose={requestClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.sheet}>
          <View style={styles.header}>
            <CircleAction
              label={showForm ? "返回模型服务" : "关闭模型服务"}
              onPress={requestClose}
              muted
            >
              {showForm ? (
                <ChevronLeft color={theme.colors.text} size={20} />
              ) : (
                <ChevronDown color={theme.colors.text} size={20} />
              )}
            </CircleAction>
            <Text accessibilityRole="header" style={styles.title}>
              {showForm ? (draft.id ? "编辑模型服务" : "添加模型服务") : "模型服务"}
            </Text>
            {!showForm ? (
              <CircleAction
                label="添加模型服务"
                onPress={() => {
                  setError(null);
                  setShowForm(true);
                }}
                muted
              >
                <Plus color={theme.colors.text} size={20} />
              </CircleAction>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!showForm ? (
              <>
                {profiles.length === 0 ? (
                  <View style={styles.empty}>
                    <KeyRound color={theme.colors.mutedText} size={24} />
                    <Text style={styles.emptyTitle}>还没有模型服务</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setError(null);
                        setShowForm(true);
                      }}
                      style={styles.primary}
                    >
                      <Text style={styles.primaryText}>添加模型服务</Text>
                    </Pressable>
                  </View>
                ) : null}
                {profiles.map(({ profile, hasApiKey }) => (
                  <View key={profile.id} style={styles.profileCard}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => edit(profile)}
                      style={styles.profileMain}
                    >
                      <View style={styles.providerIcon}>
                        {profile.connectionStatus === "connected" ? (
                          <Check color={theme.colors.success} size={18} />
                        ) : (
                          <KeyRound color={theme.colors.mutedText} size={18} />
                        )}
                      </View>
                      <View style={styles.profileCopy}>
                        <Text style={styles.profileName}>{profile.name}</Text>
                        <Text numberOfLines={1} style={styles.profileMeta}>
                          {profile.model} · {hasApiKey ? "已保存密钥" : "缺少密钥"}
                        </Text>
                      </View>
                      <ChevronRight color={theme.colors.mutedText} size={18} />
                    </Pressable>
                    <View style={styles.profileActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || !hasApiKey}
                        onPress={() => void test(profile)}
                      >
                        <Text style={styles.textAction}>测试连接</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`移除 ${profile.name}`}
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => confirmRemove(profile)}
                      >
                        <Trash2 color={theme.colors.danger} size={17} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.form}>
                <View style={styles.presets}>
                  {AI_PROVIDER_CATALOG.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() =>
                        setDraft((current) =>
                          Object.freeze({
                            ...current,
                            name: preset.name,
                            adapter: preset.adapter,
                            baseUrl: preset.baseUrl,
                            model: preset.defaultModel,
                            apiKey: current.baseUrl === preset.baseUrl ? current.apiKey : "",
                          }),
                        )
                      }
                      style={styles.preset}
                    >
                      <Text style={styles.presetText}>{preset.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.segmented}>
                  {(["openai-compatible-chat", "openai-responses"] as const).map((adapter) => (
                    <Pressable
                      key={adapter}
                      onPress={() =>
                        setDraft((current) =>
                          Object.freeze({
                            ...current,
                            adapter,
                            ...(adapter === "openai-responses" && !current.id
                              ? { name: "OpenAI", baseUrl: "https://api.openai.com/v1" }
                              : {}),
                          }),
                        )
                      }
                      style={[styles.segment, draft.adapter === adapter && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          draft.adapter === adapter && styles.segmentTextActive,
                        ]}
                      >
                        {adapter === "openai-compatible-chat" ? "兼容接口" : "Responses 接口"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Field
                  label="服务名称"
                  value={draft.name}
                  onChange={(name) => setDraft({ ...draft, name })}
                  styles={styles}
                />
                <Field
                  autoCapitalize="none"
                  label="服务地址（HTTPS）"
                  value={draft.baseUrl}
                  onChange={(baseUrl) => {
                    setModels([]);
                    setDraft({ ...draft, baseUrl });
                  }}
                  styles={styles}
                />
                <Field
                  autoCapitalize="none"
                  label="模型 ID"
                  placeholder="可从服务获取，也可直接输入任意模型 ID"
                  value={draft.model}
                  onChange={(model) => setDraft({ ...draft, model })}
                  styles={styles}
                />
                <Field
                  autoCapitalize="none"
                  label={draft.id ? "更新 API 密钥（可选）" : "API 密钥"}
                  secure
                  value={draft.apiKey}
                  onChange={(apiKey) => setDraft({ ...draft, apiKey })}
                  styles={styles}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !draft.baseUrl.trim()}
                  onPress={() => void discoverModels()}
                  style={styles.preset}
                >
                  <Text style={styles.presetText}>{busy ? "请稍候…" : "从服务获取模型"}</Text>
                </Pressable>
                {models.length ? (
                  <View style={styles.presets}>
                    {models.slice(0, 20).map((model) => (
                      <Pressable
                        key={model}
                        accessibilityRole="button"
                        accessibilityState={{ selected: draft.model === model }}
                        onPress={() => setDraft((current) => ({ ...current, model }))}
                        style={[styles.preset, draft.model === model && styles.segmentActive]}
                      >
                        <Text numberOfLines={1} style={styles.presetText}>
                          {model}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Pressable
                  disabled={
                    busy ||
                    !draft.name.trim() ||
                    !draft.model.trim() ||
                    (!draft.id && !draft.apiKey.trim())
                  }
                  onPress={() => void save()}
                  style={({ pressed }) => [
                    styles.primary,
                    (pressed || busy) && styles.primaryPressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>保存模型服务</Text>
                  )}
                </Pressable>
              </View>
            )}
            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  styles,
  secure = false,
  placeholder,
  autoCapitalize = "sentences",
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  styles: ReturnType<typeof createStyles>;
  secure?: boolean;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences";
}>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onChangeText={onChange}
        placeholder={placeholder}
        secureTextEntry={secure}
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
      maxHeight: "92%",
      minHeight: "45%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    title: { flex: 1, color: theme.colors.text, fontSize: 21, fontWeight: "700" },
    empty: { alignItems: "center", gap: 16, paddingVertical: 16 },
    emptyTitle: { color: theme.colors.mutedText, fontSize: 15 },
    content: { gap: 12, padding: 18, paddingBottom: 40 },
    presets: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    preset: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.accentSoft,
    },
    presetText: { color: theme.colors.accent, fontSize: 11, fontWeight: "700" },
    profileCard: {
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    profileMain: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
    providerIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
    },
    profileCopy: { minWidth: 0, flex: 1 },
    profileName: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    profileMeta: { marginTop: 2, color: theme.colors.mutedText, fontSize: 12 },
    profileActions: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    textAction: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
    form: {
      gap: 13,
      marginTop: 4,
      padding: 16,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
    },
    segmented: {
      flexDirection: "row",
      padding: 3,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
    },
    segment: {
      minHeight: 38,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
    },
    segmentActive: { backgroundColor: theme.colors.canvas },
    segmentText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    segmentTextActive: { color: theme.colors.accent },
    field: { gap: 6 },
    label: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    input: {
      minHeight: 46,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: theme.radius.medium,
      color: theme.colors.text,
      backgroundColor: theme.colors.canvas,
    },
    error: { color: theme.colors.error, fontSize: 13, lineHeight: 18 },
    primary: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.accent,
    },
    primaryPressed: { opacity: 0.65 },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  });
}
