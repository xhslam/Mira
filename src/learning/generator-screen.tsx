import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CheckCircle2, FilePlus2, Play } from "lucide-react-native";
import type { AppServices } from "../app/app-services";
import type { Theme } from "../app/theme";
import { collectLearningResponse, parseGeneratedResource } from "./learning-ai";
import type {
  GenerationDraft,
  LearningResource,
  LearningSnapshot,
  PracticeProgress,
} from "./learning-types";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof LEVELS)[number];

export function GeneratorScreen({
  snapshot,
  onChange,
  services,
  theme,
}: Readonly<{
  snapshot: LearningSnapshot;
  onChange: (snapshot: LearningSnapshot) => void;
  services: AppServices;
  theme: Theme;
}>) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [request, setRequest] = useState("");
  const [language, setLanguage] = useState("English");
  const [level, setLevel] = useState<Level>("beginner");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idSequence = useRef(0);
  function createId(prefix: string): string {
    idSequence.current += 1;
    return `${prefix}-${idSequence.current}`;
  }
  const draft = snapshot.generationDrafts[0] ?? null;
  const preview = draft?.state === "ready" && draft.outputJson ? safeParse(draft.outputJson) : null;

  async function generate() {
    if (!request.trim() || busy) return;
    const now = new Date().toISOString();
    const created: GenerationDraft = Object.freeze({
      id: createId("draft"),
      request: request.trim(),
      language,
      level,
      state: "pending",
      outputJson: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    let working = Object.freeze({
      ...snapshot,
      generationDrafts: Object.freeze([created, ...snapshot.generationDrafts]),
    });
    onChange(working);
    setBusy(true);
    setError(null);
    try {
      const response = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content:
              "Create a reusable language-learning resource. Return ONLY strict JSON with title, description, language, content, and sentences. sentences must be an array of objects with text and translation. Include 3 to 8 short, practice-friendly sentences. Do not wrap the JSON in Markdown.",
          }),
          Object.freeze({
            role: "user" as const,
            content: `Learner request: ${created.request}\nTarget language: ${created.language}\nLevel: ${created.level}`,
          }),
        ]),
      });
      parseGeneratedResource(response);
      const updated: GenerationDraft = Object.freeze({
        ...created,
        state: "ready",
        outputJson: response,
        updatedAt: new Date().toISOString(),
      });
      working = Object.freeze({
        ...working,
        generationDrafts: Object.freeze(
          working.generationDrafts.map((item) => (item.id === updated.id ? updated : item)),
        ),
      });
      onChange(working);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Resource generation failed.";
      setError(message);
      const failed: GenerationDraft = Object.freeze({
        ...created,
        state: "failed",
        error: message,
        updatedAt: new Date().toISOString(),
      });
      onChange(
        Object.freeze({
          ...working,
          generationDrafts: Object.freeze(
            working.generationDrafts.map((item) => (item.id === failed.id ? failed : item)),
          ),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function saveResource() {
    if (!draft?.outputJson || !preview) return;
    const now = new Date().toISOString();
    const resourceId = createId("resource");
    const resource: LearningResource = Object.freeze({
      id: resourceId,
      title: preview.title,
      description: preview.description,
      language: preview.language,
      source: "generated",
      content: preview.content,
      sentences: Object.freeze(
        preview.sentences.map((sentence, index) =>
          Object.freeze({
            id: `${resourceId}-sentence-${index + 1}`,
            resourceId,
            order: index + 1,
            text: sentence.text,
            translation: sentence.translation,
            startMs: null,
            endMs: null,
            sourceAudioUri: null,
          }),
        ),
      ),
      createdAt: now,
      updatedAt: now,
    });
    const practice: readonly PracticeProgress[] = Object.freeze([
      ...snapshot.practice,
      ...resource.sentences.map((sentence, index) =>
        Object.freeze({
          resourceId,
          sentenceId: sentence.id,
          listened: false,
          shadowed: false,
          lastPositionMs: 0,
          selected: index === 0,
          updatedAt: now,
        }),
      ),
    ]);
    onChange(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze([resource, ...snapshot.resources]),
        practice,
        ui: Object.freeze({
          ...snapshot.ui,
          selectedResourceId: resource.id,
          selectedSentenceId: resource.sentences[0]?.id ?? null,
          section: "practice",
        }),
      }),
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>RESOURCE GENERATOR</Text>
        <Text style={styles.title}>Create practice you can reuse</Text>
        <Text style={styles.copy}>
          Your request becomes validated sentence-level content before it is saved to the library.
        </Text>
      </View>
      <View style={styles.form}>
        <Text style={styles.label}>What do you want to practice?</Text>
        <TextInput
          multiline
          onChangeText={setRequest}
          placeholder="For example: a friendly dialogue about ordering coffee after work"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.textarea}
          value={request}
        />
        <Text style={styles.label}>Target language</Text>
        <TextInput onChangeText={setLanguage} style={styles.input} value={language} />
        <Text style={styles.label}>Level</Text>
        <View style={styles.levels}>
          {LEVELS.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => setLevel(item)}
              style={({ pressed }) => [
                styles.level,
                level === item && styles.levelSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.levelText, level === item && styles.levelTextSelected]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!request.trim() || busy}
          onPress={() => void generate()}
          style={({ pressed }) => [
            styles.generateButton,
            (!request.trim() || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.canvas} />
          ) : (
            <FilePlus2 color={theme.colors.canvas} size={18} />
          )}
          <Text style={styles.generateText}>
            {busy ? "Generating…" : "Generate structured resource"}
          </Text>
        </Pressable>
      </View>
      {draft?.state === "pending" ? (
        <View style={styles.processing}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.processingText}>
            Asking your configured AI engine for structured learning content…
          </Text>
        </View>
      ) : null}
      {preview ? (
        <View style={styles.preview}>
          <View style={styles.previewHeading}>
            <View>
              <Text style={styles.cardKicker}>VALIDATED PREVIEW</Text>
              <Text style={styles.previewTitle}>{preview.title}</Text>
            </View>
            <CheckCircle2 color={theme.colors.success} size={24} />
          </View>
          <Text style={styles.previewDescription}>{preview.description}</Text>
          <Text style={styles.previewContent}>{preview.content}</Text>
          <View style={styles.sentenceList}>
            {preview.sentences.map((sentence, index) => (
              <View key={`${sentence.text}-${index}`} style={styles.sentence}>
                <Text style={styles.sentenceIndex}>{index + 1}</Text>
                <View style={styles.sentenceText}>
                  <Text style={styles.sentenceEnglish}>{sentence.text}</Text>
                  <Text style={styles.sentenceTranslation}>
                    {sentence.translation ?? "No translation"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={saveResource}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <FilePlus2 color={theme.colors.canvas} size={18} />
            <Text style={styles.saveText}>Save and open in practice</Text>
            <Play color={theme.colors.canvas} size={16} />
          </Pressable>
        </View>
      ) : null}
      {draft?.state === "failed" ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Generation needs attention</Text>
          <Text style={styles.errorText}>{draft.error}</Text>
          <Text style={styles.errorHint}>
            Check the selected AI engine in Learning Settings, revise the request, and try again.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
function safeParse(raw: string) {
  try {
    return parseGeneratedResource(raw);
  } catch {
    return null;
  }
}
function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: { gap: 16, padding: 20, paddingBottom: 36 },
    hero: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 6,
      padding: 20,
    },
    kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
    title: { color: theme.colors.text, fontSize: 24, fontWeight: "600" },
    copy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    form: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 9,
      padding: 16,
    },
    label: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600", marginTop: 2 },
    textarea: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      minHeight: 105,
      padding: 12,
      textAlignVertical: "top",
    },
    input: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      padding: 11,
    },
    levels: { flexDirection: "row", gap: 8 },
    level: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    levelSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    levelText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    levelTextSelected: { color: theme.colors.canvas },
    generateButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 5,
      padding: 14,
    },
    generateText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "600" },
    processing: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 10,
      padding: 16,
    },
    processingText: { color: theme.colors.mutedText, flex: 1, fontSize: 13, lineHeight: 18 },
    preview: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.success,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 12,
      padding: 17,
    },
    previewHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    cardKicker: { color: theme.colors.success, fontSize: 11, fontWeight: "600", letterSpacing: 1 },
    previewTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "600", marginTop: 3 },
    previewDescription: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19 },
    previewContent: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
    sentenceList: { gap: 7 },
    sentence: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 9,
      padding: 10,
    },
    sentenceIndex: { color: theme.colors.accent, fontSize: 12, fontWeight: "700", width: 15 },
    sentenceText: { flex: 1 },
    sentenceEnglish: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    sentenceTranslation: { color: theme.colors.mutedText, fontSize: 12, marginTop: 3 },
    saveButton: {
      alignItems: "center",
      backgroundColor: theme.colors.success,
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      padding: 13,
    },
    saveText: { color: theme.colors.canvas, fontSize: 13, fontWeight: "600" },
    errorCard: {
      backgroundColor: theme.colors.warningSurface,
      borderRadius: 10,
      gap: 6,
      padding: 15,
    },
    errorTitle: { color: theme.colors.warningText, fontSize: 15, fontWeight: "600" },
    errorText: { color: theme.colors.error, fontSize: 13, lineHeight: 19 },
    errorHint: { color: theme.colors.warningText, fontSize: 12, lineHeight: 17 },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
