import * as Crypto from "expo-crypto";
import { Search, Sparkles, Square, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { AiProposal } from "../ai/proposal";
import type { AiProviderProfile } from "../ai/provider-profile";
import {
  applyVmarkGenieResult,
  captureGenieTarget,
  renderVmarkGeniePrompt,
  VMARK_GENIES,
  VMARK_GENIE_ZH_CN,
  type VmarkGenie,
} from "../ai/vmark-genies";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import { describeAiSendFailure } from "./ai-error-message";
import { AiProposalSheet } from "./ai-proposal-sheet";
import { TextDiffView } from "./text-diff-view";
import { useTheme, type Theme } from "./theme";
import { resolveLocale } from "./i18n";

const QUICK_IDS = new Set(["polish", "condense", "fix-grammar", "rephrase"]);

export function AiQuickAssistant(
  props: Readonly<{
    controller: EditorWorkspaceController;
    visible: boolean;
    onClose: () => void;
  }>,
) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [profiles, setProfiles] = useState<readonly AiProviderProfile[]>(Object.freeze([]));
  const [profileId, setProfileId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState("");
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCustom, setConfirmCustom] = useState(false);
  const [useChineseLabels, setUseChineseLabels] = useState(false);
  const [promptHistory, setPromptHistory] = useState<readonly string[]>(Object.freeze([]));
  const abortRef = useRef<AbortController | null>(null);
  const lastGenieRef = useRef<VmarkGenie | null>(null);

  useEffect(() => {
    if (!props.visible) return;
    let active = true;
    void Promise.all([
      props.controller.services.aiProviderProfiles.list(),
      props.controller.services.settingsStore.load(),
      props.controller.services.aiStore.listPromptHistory(
        props.controller.services.activeWorkspace.grant.workspaceId,
      ),
    ]).then(([summaries, settings, history]) => {
      if (!active) return;
      const loaded = Object.freeze(summaries.map((item) => item.profile));
      setProfiles(loaded);
      const configured = settings.ok ? settings.value.ai.activeProviderProfileId : null;
      setUseChineseLabels(
        resolveLocale(settings.ok ? settings.value.localePreference : "system") === "zh-CN",
      );
      setPromptHistory(history);
      setProfileId(
        loaded.some((item) => item.id === configured) ? configured : (loaded[0]?.id ?? null),
      );
    });
    return () => {
      active = false;
    };
  }, [props.controller.services, props.visible]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1_000)), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? VMARK_GENIES.filter((item) =>
          `${item.name} ${item.description} ${item.category} ${VMARK_GENIE_ZH_CN[item.id]?.name ?? ""} ${VMARK_GENIE_ZH_CN[item.id]?.description ?? ""}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
      : VMARK_GENIES;
  }, [query]);

  async function run(genie: VmarkGenie, customPrompt?: string): Promise<void> {
    const activeProfileId = profileId as AiProviderProfile["id"] | null;
    if (!activeProfileId || running) return;
    lastGenieRef.current = genie;
    setRunning(true);
    setElapsed(0);
    setOutput("");
    setProposal(null);
    setError(null);
    setConfirmCustom(false);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const document = await props.controller.captureAiSnapshot();
      const target = captureGenieTarget(document.markdown, document.selection, genie.scope);
      const prompt = customPrompt
        ? `${customPrompt}\n\nReturn only the transformed text — no explanations.\n\n${target.content}`
        : renderVmarkGeniePrompt(genie, target.content);
      if (customPrompt) {
        await props.controller.services.aiStore.recordPrompt(
          props.controller.services.activeWorkspace.grant.workspaceId,
          customPrompt,
          new Date().toISOString(),
        );
        setPromptHistory((current) =>
          Object.freeze(
            [customPrompt, ...current.filter((item) => item !== customPrompt)].slice(0, 100),
          ),
        );
      }
      let generated = "";
      for await (const delta of props.controller.services.aiGenies.stream({
        providerProfileId: activeProfileId,
        prompt,
        signal: abort.signal,
      })) {
        generated += delta;
        setOutput(generated);
      }
      if (!generated) throw new Error("The model returned no text");
      const now = new Date().toISOString();
      const created = Object.freeze({
        id: Crypto.randomUUID() as AiProposal["id"],
        workspaceId: props.controller.services.activeWorkspace.grant.workspaceId,
        conversationId: null,
        operation: "replace" as const,
        targetPath: document.path,
        baseRevision: `editor:${document.documentId}:${document.revision}`,
        baseHash: document.baseHash,
        baseContent: document.markdown,
        proposedContent: applyVmarkGenieResult(document.markdown, target, genie.action, generated),
        state: "pending" as const,
        explanation: customPrompt ?? `${genie.name} · ${genie.scope}`,
        createdAt: now,
        updatedAt: now,
      });
      await props.controller.services.aiStore.upsertProposal(created);
      setProposal(created);
    } catch (runError) {
      if (!abort.signal.aborted) {
        setError(describeAiSendFailure(runError));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  async function applyProposal(candidate: string): Promise<void> {
    if (!proposal) return;
    setProposalBusy(true);
    let state: AiProposal["state"] = "apply_failed";
    try {
      const current = await props.controller.captureAiSnapshot();
      const revision = Number(proposal.baseRevision?.split(":").at(-1));
      if (current.path !== proposal.targetPath || current.markdown !== proposal.baseContent) {
        state = "stale";
      } else {
        const applied = await props.controller.applyAiReplacement({
          documentId: current.documentId,
          path: current.path,
          expectedRevision: revision,
          expectedMarkdown: proposal.baseContent,
          markdown: candidate,
        });
        state = applied === "applied" ? "applied" : applied === "stale" ? "stale" : "apply_failed";
      }
    } catch {
      state = "apply_failed";
    }
    await props.controller.services.aiStore.setProposalState(
      proposal.id,
      state,
      new Date().toISOString(),
    );
    setProposal(Object.freeze({ ...proposal, state }));
    setProposalBusy(false);
    setReviewing(false);
    if (state === "applied") props.onClose();
  }

  async function rejectProposal(): Promise<void> {
    if (!proposal) return;
    setProposalBusy(true);
    await props.controller.services.aiStore.setProposalState(
      proposal.id,
      "rejected",
      new Date().toISOString(),
    );
    setProposal(Object.freeze({ ...proposal, state: "rejected" }));
    setProposalBusy(false);
    setReviewing(false);
  }

  const activeDocument = props.controller.state?.activeDocument;
  const labelFor = (genie: VmarkGenie) =>
    useChineseLabels ? (VMARK_GENIE_ZH_CN[genie.id] ?? genie) : genie;
  const visibleHistory = promptHistory
    .filter(
      (item) =>
        !query.trim() || item.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .slice(0, 3);
  const visibleScope = activeDocument
    ? activeDocument.selection.anchor === activeDocument.selection.head
      ? "current block fallback"
      : "selection"
    : "unavailable";

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={props.onClose}
        transparent
        visible={props.visible}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View>
                <Text accessibilityRole="header" style={styles.title}>
                  AI Quick Assistant
                </Text>
                <Text style={styles.scope}>Scope: {visibleScope}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close AI Quick Assistant"
                onPress={props.onClose}
                style={styles.iconButton}
              >
                <X color={theme.colors.text} size={21} />
              </Pressable>
            </View>

            {profiles.length === 0 ? (
              <Text style={styles.error}>Connect an AI provider in the AI tab first.</Text>
            ) : null}
            <View style={styles.quickRow}>
              {VMARK_GENIES.filter((item) => QUICK_IDS.has(item.id)).map((item) => (
                <Pressable
                  disabled={running || !profileId}
                  key={item.id}
                  onPress={() => void run(item)}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickText}>{labelFor(item).name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.searchBox}>
              <Search color={theme.colors.mutedText} size={17} />
              <TextInput
                accessibilityLabel="Search AI actions or enter a custom prompt"
                onChangeText={(value) => {
                  setQuery(value);
                  setConfirmCustom(false);
                }}
                placeholder="Search 13 actions or write a prompt…"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.searchInput}
                value={query}
              />
            </View>
            {!running && !proposal && visibleHistory.length > 0 ? (
              <View style={styles.historyRow}>
                <Text style={styles.historyLabel}>Recent</Text>
                {visibleHistory.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      const base = VMARK_GENIES[0];
                      if (base) void run(base, item);
                    }}
                    style={styles.historyChip}
                  >
                    <Text numberOfLines={1} style={styles.historyText}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {running || output || error || proposal ? (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>
                  {running ? `GENERATING · ${elapsed}s` : proposal ? "SUGGESTION READY" : "PREVIEW"}
                </Text>
                {proposal ? (
                  <TextDiffView before={proposal.baseContent} after={proposal.proposedContent} />
                ) : (
                  <Text selectable style={styles.output}>
                    {output || error}
                  </Text>
                )}
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    disabled={running || !profileId}
                    onPress={() => void run(item)}
                    style={styles.actionRow}
                  >
                    <View style={styles.actionIcon}>
                      <Sparkles color={theme.colors.accent} size={16} />
                    </View>
                    <View style={styles.actionCopy}>
                      <Text style={styles.actionName}>{labelFor(item).name}</Text>
                      <Text style={styles.actionDescription}>
                        {labelFor(item).description} · {item.scope}
                      </Text>
                    </View>
                  </Pressable>
                )}
                style={styles.list}
              />
            )}

            <View style={styles.footer}>
              {running ? (
                <Pressable onPress={() => abortRef.current?.abort()} style={styles.secondary}>
                  <Square color={theme.colors.text} size={14} />
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
              ) : error && lastGenieRef.current ? (
                <Pressable
                  onPress={() => {
                    const last = lastGenieRef.current;
                    if (last) void run(last);
                  }}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Retry</Text>
                </Pressable>
              ) : query.trim() && filtered.length === 0 ? (
                <Pressable
                  onPress={() => {
                    if (confirmCustom) {
                      const base = VMARK_GENIES[0];
                      if (base) void run(base, query.trim());
                    } else setConfirmCustom(true);
                  }}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>
                    {confirmCustom ? "Confirm custom prompt" : "Use custom prompt"}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              {proposal?.state === "pending" ? (
                <Pressable onPress={() => setReviewing(true)} style={styles.primary}>
                  <Text style={styles.primaryText}>Review changes</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
      <AiProposalSheet
        busy={proposalBusy}
        onApply={(candidate) => void applyProposal(candidate)}
        onClose={() => setReviewing(false)}
        onReject={() => void rejectProposal()}
        proposal={reviewing ? proposal : null}
      />
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.42)" },
    sheet: {
      height: "86%",
      gap: 12,
      padding: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: theme.colors.background,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { color: theme.colors.text, fontSize: 20, fontWeight: "700" },
    scope: { marginTop: 3, color: theme.colors.mutedText, fontSize: 11 },
    iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    error: { color: theme.colors.error, fontSize: 12 },
    quickRow: { flexDirection: "row", gap: 7 },
    quickChip: {
      minHeight: 34,
      justifyContent: "center",
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft,
    },
    quickText: { color: theme.colors.accent, fontSize: 11, fontWeight: "600" },
    searchBox: {
      minHeight: 45,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    searchInput: { flex: 1, color: theme.colors.text, fontSize: 13 },
    historyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    historyLabel: { color: theme.colors.mutedText, fontSize: 10 },
    historyChip: {
      maxWidth: 120,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    historyText: { color: theme.colors.text, fontSize: 10 },
    list: { flex: 1 },
    actionRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    actionIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft,
    },
    actionCopy: { minWidth: 0, flex: 1 },
    actionName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    actionDescription: { marginTop: 2, color: theme.colors.mutedText, fontSize: 11 },
    preview: {
      flex: 1,
      gap: 7,
      overflow: "hidden",
      padding: 10,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    previewLabel: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.7,
    },
    output: { color: theme.colors.text, fontSize: 13, lineHeight: 20 },
    footer: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    secondary: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 12,
    },
    secondaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    primary: {
      minHeight: 46,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  });
}
