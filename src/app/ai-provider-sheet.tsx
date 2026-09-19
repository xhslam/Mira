import { Check, ChevronRight, KeyRound, Trash2, X } from "lucide-react-native";
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

const EMPTY_DRAFT: Draft = Object.freeze({
  id: null,
  name: "DeepSeek",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
});

const PROVIDER_PRESETS: readonly Readonly<{
  label: string;
  name: string;
  adapter: AiProviderProfile["adapter"];
  baseUrl: string;
  model: string;
}>[] = Object.freeze([
  Object.freeze({
    label: "DeepSeek V4 Flash",
    name: "DeepSeek",
    adapter: "openai-compatible-chat",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  }),
  Object.freeze({
    label: "DeepSeek V4 Pro",
    name: "DeepSeek",
    adapter: "openai-compatible-chat",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
  }),
  Object.freeze({
    label: "OpenAI",
    name: "OpenAI",
    adapter: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
  }),
]);

export function AiProviderSheet({
  visible,
  onClose,
  manager,
  connectionTester,
  settingsStore,
  onChanged,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  manager: AiProviderProfileManager;
  connectionTester: AppServices["aiConnectionTester"];
  settingsStore: SettingsStore;
  onChanged: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof manager.list>>>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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
        if (active) setError("Provider profiles could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [manager, visible]);

  function edit(profile: AiProviderProfile): void {
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
        ai: Object.freeze({ ...current.ai, activeProviderProfileId: saved.profile.id }),
      }));
      setDraft(EMPTY_DRAFT);
      await reload();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The provider could not be saved.");
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
      if (!result.ok) setError(`Connection failed: ${result.status}`);
    } catch {
      setError("The provider connection could not be tested.");
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(profile: AiProviderProfile): void {
    Alert.alert(
      "Remove provider?",
      "Its API key will be deleted from secure storage and dependent tasks will pause.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
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
              .catch(() => setError("The provider could not be removed."));
          },
        },
      ],
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text accessibilityRole="header" style={styles.title}>
                AI providers
              </Text>
              <Text style={styles.subtitle}>Keys stay in this device&apos;s secure storage.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close provider settings"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X color={theme.colors.text} size={20} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {profiles.map(({ profile, hasApiKey }) => (
              <View key={profile.id} style={styles.profileCard}>
                <Pressable onPress={() => edit(profile)} style={styles.profileMain}>
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
                      {profile.model} · {hasApiKey ? "Key stored" : "Key required"}
                    </Text>
                  </View>
                  <ChevronRight color={theme.colors.mutedText} size={18} />
                </Pressable>
                <View style={styles.profileActions}>
                  <Pressable disabled={busy || !hasApiKey} onPress={() => void test(profile)}>
                    <Text style={styles.textAction}>Test connection</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => confirmRemove(profile)}>
                    <Trash2 color={theme.colors.danger} size={17} />
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={styles.form}>
              <Text style={styles.formTitle}>{draft.id ? "Edit provider" : "Add provider"}</Text>
              <View style={styles.presets}>
                {PROVIDER_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.label}
                    onPress={() =>
                      setDraft((current) =>
                        Object.freeze({
                          ...current,
                          name: preset.name,
                          adapter: preset.adapter,
                          baseUrl: preset.baseUrl,
                          model: preset.model,
                        }),
                      )
                    }
                    style={styles.preset}
                  >
                    <Text style={styles.presetText}>{preset.label}</Text>
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
                      {adapter === "openai-compatible-chat" ? "Compatible" : "Responses + Search"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Name"
                value={draft.name}
                onChange={(name) => setDraft({ ...draft, name })}
                styles={styles}
              />
              <Field
                autoCapitalize="none"
                label="Base URL (HTTPS)"
                value={draft.baseUrl}
                onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
                styles={styles}
              />
              <Field
                autoCapitalize="none"
                label="Model"
                placeholder="Provider model identifier"
                value={draft.model}
                onChange={(model) => setDraft({ ...draft, model })}
                styles={styles}
              />
              <Field
                autoCapitalize="none"
                label={draft.id ? "Replace API key (optional)" : "API key"}
                secure
                value={draft.apiKey}
                onChange={(apiKey) => setDraft({ ...draft, apiKey })}
                styles={styles}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
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
                  <Text style={styles.primaryText}>Save provider</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
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
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    title: { color: theme.colors.text, fontSize: 21, fontWeight: "700" },
    subtitle: { marginTop: 3, color: theme.colors.mutedText, fontSize: 12 },
    iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    content: { gap: theme.spacing[3], padding: theme.spacing[4], paddingBottom: 40 },
    presets: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
    preset: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primarySoft,
    },
    presetText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: "700" },
    profileCard: {
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    profileMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[3],
      padding: theme.spacing[3],
    },
    providerIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
    },
    profileCopy: { minWidth: 0, flex: 1 },
    profileName: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
    profileMeta: { marginTop: 2, color: theme.colors.mutedText, fontSize: 12 },
    profileActions: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing[3],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.borderSubtle,
    },
    textAction: { color: theme.colors.primary, fontSize: 13, fontWeight: "600" },
    form: {
      gap: theme.spacing[3],
      marginTop: theme.spacing[1],
      padding: theme.spacing[4],
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      backgroundColor: theme.colors.surface,
    },
    formTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
    segmented: {
      flexDirection: "row",
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
    segmentText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    segmentTextActive: { color: theme.colors.primary, fontWeight: "700" },
    field: { gap: 6 },
    label: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    input: {
      minHeight: 44,
      paddingHorizontal: theme.spacing[3],
      borderWidth: 1,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      color: theme.colors.text,
      backgroundColor: theme.colors.canvas,
    },
    error: { color: theme.colors.error, fontSize: 13, lineHeight: 18 },
    primary: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    primaryPressed: { opacity: 0.65 },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  });
}
