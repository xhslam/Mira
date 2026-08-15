import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ImageDown, Languages, Link2, Wand2 } from "lucide-react-native";
import type { AppServices } from "../app/app-services";
import type { Theme } from "../app/theme";
import { createPracticePosterSvg, fingerprintText } from "./enjoy-player-domain";
import { collectLearningResponse } from "./learning-ai";
import type { LearningResource, LearningSnapshot } from "./learning-types";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  services: AppServices;
  theme: Theme;
}>;

export function StudioScreen({ snapshot, onChange, services, theme }: Props) {
  const styles = useMemo(() => styleFor(theme), [theme]);
  const [manual, setManual] = useState("");
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const resource =
    snapshot.resources.find((item) => item.id === snapshot.ui.selectedResourceId) ??
    snapshot.resources[0] ??
    null;
  const sentence =
    resource?.sentences.find((item) => item.id === snapshot.ui.selectedSentenceId) ??
    resource?.sentences[0] ??
    null;
  const patchResource = (next: LearningResource) =>
    onChange(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze(
          snapshot.resources.map((item) => (item.id === next.id ? next : item)),
        ),
      }),
    );
  const saveManualTranslation = () => {
    if (!resource || !sentence || !manual.trim()) {
      setNotice("Select a caption line and enter a translation first.");
      return;
    }
    const now = new Date().toISOString();
    const updated = Object.freeze({
      ...resource,
      sentences: Object.freeze(
        resource.sentences.map((item) =>
          item.id === sentence.id ? Object.freeze({ ...item, translation: manual.trim() }) : item,
        ),
      ),
      updatedAt: now,
    });
    patchResource(updated);
    const entry = Object.freeze({
      id: `translation-${Date.now()}`,
      sentenceId: sentence.id,
      sourceFingerprint: fingerprintText(sentence.text),
      sourceText: sentence.text,
      targetLanguage: snapshot.settings.translationTargetLanguage,
      translation: manual.trim(),
      contextNote: null,
      updatedAt: now,
    });
    onChange(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze(
          snapshot.resources.map((item) => (item.id === updated.id ? updated : item)),
        ),
        translations: Object.freeze([
          entry,
          ...snapshot.translations.filter((item) => item.sentenceId !== sentence.id),
        ]),
      }),
    );
    setManual("");
    setNotice("Translation cached locally for this caption line.");
  };
  const askAiTranslation = async () => {
    if (!resource || !sentence) {
      setNotice("Select a caption line first.");
      return;
    }
    try {
      setWorking(true);
      const answer = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          {
            role: "system",
            content: `Translate into ${snapshot.settings.translationTargetLanguage}. Return only the translation and one short context note.`,
          },
          { role: "user", content: sentence.text },
        ]),
      });
      setManual(answer.trim());
      setNotice("AI translation prepared. Review it and save it to keep a local cache.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Translation request failed.");
    } finally {
      setWorking(false);
    }
  };
  const savePublicLink = () => {
    if (!/^https:\/\//iu.test(url.trim())) {
      setNotice(
        "Use a public HTTPS link. Playback and captions always follow the source platform's own rules.",
      );
      return;
    }
    const now = new Date().toISOString();
    const id = `public-${Date.now()}`;
    const item: LearningResource = Object.freeze({
      id,
      title: "Public video reference",
      description: url.trim(),
      language: "English",
      source: "youtube",
      content: "",
      sentences: Object.freeze([]),
      mediaKind: "youtube",
      sourceUrl: url.trim(),
      createdAt: now,
      updatedAt: now,
    });
    onChange(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze([item, ...snapshot.resources]),
        ui: Object.freeze({ ...snapshot.ui, selectedResourceId: id, selectedSentenceId: null }),
      }),
    );
    setUrl("");
    setNotice(
      "Public link saved as a reference. Add a legal SRT/VTT file in Library to practise its captions.",
    );
  };
  const sharePoster = async () => {
    if (!sentence) {
      setNotice("Select a completed practice line before exporting a poster.");
      return;
    }
    try {
      const score =
        snapshot.assessments.find((item) => item.sentenceId === sentence.id)?.overall ?? null;
      const file = new File(Paths.cache, `enjoy-practice-${Date.now()}.svg`);
      file.write(
        createPracticePosterSvg({
          title: resource?.title ?? "Practice",
          quote: sentence.text,
          score,
          date: new Date().toLocaleDateString(),
        }),
      );
      await Sharing.shareAsync(file.uri, {
        mimeType: "image/svg+xml",
        dialogTitle: "Share practice poster",
      });
      setNotice("Practice poster prepared for system sharing.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Poster could not be shared.");
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>LEARNING STUDIO</Text>
        <Text style={styles.title}>Translate, refine, share</Text>
        <Text style={styles.copy}>
          AI requests only use your selected local provider configuration. No learning data is
          uploaded unless you explicitly request it.
        </Text>
      </View>
      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contextual line translation</Text>
        <Text style={styles.source}>{sentence?.text ?? "Select a caption in Practice"}</Text>
        <TextInput
          multiline
          value={manual}
          onChangeText={setManual}
          placeholder="Write or review the translation"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
        />
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            disabled={working}
            onPress={() => void askAiTranslation()}
            style={styles.secondary}
          >
            <Wand2 color={theme.colors.text} size={17} />
            <Text style={styles.secondaryText}>{working ? "Working…" : "AI draft"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={saveManualTranslation}
            style={styles.primary}
          >
            <Languages color={theme.colors.canvas} size={17} />
            <Text style={styles.primaryText}>Save</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Public media reference</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://…"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          autoCapitalize="none"
          inputMode="url"
        />
        <Pressable accessibilityRole="button" onPress={savePublicLink} style={styles.secondary}>
          <Link2 color={theme.colors.text} size={17} />
          <Text style={styles.secondaryText}>Save HTTPS link</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Long media transcription</Text>
        <Text style={styles.copy}>
          For long audio and video, add an SRT/VTT file or paste a draft in Library. A
          user-configured AI provider can help rewrite and translate it in this Studio.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setNotice(
              "Long-form workflow ready: import the media in Library, then attach an SRT/VTT track or paste a transcript for review.",
            )
          }
          style={styles.secondary}
        >
          <Wand2 color={theme.colors.text} size={17} />
          <Text style={styles.secondaryText}>Open transcription workflow</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Practice poster</Text>
        <Text style={styles.copy}>
          Create a vertical SVG summary using the selected line and its latest local assessment
          score.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void sharePoster()}
          style={styles.primary}
        >
          <ImageDown color={theme.colors.canvas} size={17} />
          <Text style={styles.primaryText}>Create & share</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
function styleFor(theme: Theme) {
  return StyleSheet.create({
    content: { gap: 16, padding: 20, paddingBottom: 40 },
    hero: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 7,
      padding: 20,
    },
    kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: "600", letterSpacing: 1.1 },
    title: { color: theme.colors.text, fontSize: 25, fontWeight: "600" },
    copy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 20 },
    notice: { backgroundColor: theme.colors.warningSurface, borderRadius: 10, padding: 12 },
    noticeText: { color: theme.colors.warningText, fontSize: 13, lineHeight: 19 },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 10,
      padding: 16,
    },
    cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
    source: { color: theme.colors.text, fontSize: 17, fontWeight: "700", lineHeight: 24 },
    input: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      minHeight: 48,
      padding: 11,
      textAlignVertical: "top",
    },
    row: { flexDirection: "row", gap: 9 },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flex: 1,
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      padding: 12,
    },
    primaryText: { color: theme.colors.canvas, fontSize: 13, fontWeight: "600" },
    secondary: {
      alignItems: "center",
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flex: 1,
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      padding: 12,
    },
    secondaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  });
}
