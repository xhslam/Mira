import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link2 } from "lucide-react-native";

import type { Theme } from "../app/theme";
import { bilibiliVideoReference } from "./bilibili-learning";
import { cleanMarkdownForLearning } from "./learning-enrichment";
import { fingerprintText, splitLearningSentences } from "./enjoy-player-domain";
import type { LearningResource, LearningSnapshot } from "./learning-types";
import { syncResourcePhrases } from "./resource-phrase-sync";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  theme: Theme;
}>;

export function UrlImportScreen({ snapshot, onChange, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function completeImport(resource: LearningResource) {
    const phraseSync = syncResourcePhrases(snapshot.vocabulary, resource, new Date().toISOString());
    onChange(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze([resource, ...snapshot.resources]),
        vocabulary: phraseSync.cards,
        ui: Object.freeze({
          ...snapshot.ui,
          section: "library",
          selectedResourceId: resource.id,
          selectedSentenceId: resource.sentences[0]?.id ?? null,
          importIntent: null,
        }),
      }),
    );
  }

  function createWebResource(name: string, content: string, sourceUrl: string): LearningResource {
    const now = new Date().toISOString();
    const id = `resource-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cleanedContent = cleanMarkdownForLearning(content);
    const sentences = splitLearningSentences(cleanedContent);
    return Object.freeze({
      id,
      title: name.trim() || "网页资料",
      description: "从网页链接导入的英语学习资料",
      language: "English",
      source: "imported",
      provider: "library",
      content: cleanedContent,
      sentences: Object.freeze(
        sentences.map((text, index) =>
          Object.freeze({
            id: `${id}-sentence-${index + 1}`,
            resourceId: id,
            order: index + 1,
            text,
            translation: null,
            startMs: null,
            endMs: null,
            sourceAudioUri: null,
          }),
        ),
      ),
      mediaKind: "text",
      sourceUrl,
      captionFingerprint: fingerprintText(cleanedContent),
      createdAt: now,
      updatedAt: now,
    });
  }

  async function importUrl() {
    const sourceUrl = url.trim();
    if (!/^https?:\/\//iu.test(sourceUrl)) {
      setMessage("请输入完整的 http 或 https 链接。");
      return;
    }

    setWorking(true);
    setMessage("");
    try {
      const reference = bilibiliVideoReference(sourceUrl);
      if (reference) {
        const id = `bilibili-${reference.kind}-${reference.id}`;
        if (snapshot.resources.some((resource) => resource.id === id)) {
          setMessage("这个哔哩哔哩视频已经保存在资料库中。");
          return;
        }
        const now = new Date().toISOString();
        completeImport(
          Object.freeze({
            id,
            title:
              reference.kind === "episode"
                ? `哔哩哔哩番剧 ${reference.id}`
                : `哔哩哔哩视频 ${reference.id}`,
            description: "已保存公开链接；请在资料页为它导入匹配的 SRT/VTT 字幕。",
            language: "未设置",
            source: "bilibili",
            provider: "library",
            content: "",
            sentences: Object.freeze([]),
            mediaKind: "bilibili",
            sourceUrl,
            createdAt: now,
            updatedAt: now,
          }),
        );
        return;
      }

      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`网页读取失败（${response.status}）。`);
      const html = await response.text();
      const pageTitle =
        /<title[^>]*>([\s\S]*?)<\/title>/iu
          .exec(html)?.[1]
          ?.replace(/<[^>]+>/gu, "")
          .trim() || "网页资料";
      const content = html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/giu, " ")
        .replace(/<[^>]+>/gu, " ")
        .replace(/&nbsp;|&amp;|&quot;/giu, " ")
        .replace(/\s+/gu, " ");
      const resource = createWebResource(pageTitle, content, sourceUrl);
      if (!resource.sentences.length) {
        throw new Error("链接没有返回可切分的正文；视频请导入媒体或字幕。");
      }
      completeImport(resource);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个链接。");
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.intro}>
        <View style={styles.icon}>
          <Link2 color={theme.colors.primary} size={22} strokeWidth={1.9} />
        </View>
        <Text style={styles.title}>从链接创建资料</Text>
        <Text style={styles.description}>
          粘贴网页或公开的哔哩哔哩链接。导入完成后，内容会出现在资料页。
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onChangeText={(value) => {
            setUrl(value);
            if (message) setMessage("");
          }}
          placeholder="https://example.com/article"
          placeholderTextColor={theme.colors.mutedText}
          returnKeyType="go"
          value={url}
          onSubmitEditing={() => void importUrl()}
          style={styles.input}
        />
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: working }}
          disabled={working}
          onPress={() => void importUrl()}
          style={({ pressed }) => [
            styles.primary,
            working && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {working ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>导入到资料</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.note}>仅支持 http 或 https 链接；受登录保护的网页可能无法读取正文。</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    page: {
      gap: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
    },
    intro: { gap: theme.spacing.sm },
    icon: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radius.md,
      height: 44,
      justifyContent: "center",
      marginBottom: 4,
      width: 44,
    },
    title: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: -0.4,
      lineHeight: 29,
    },
    description: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 21 },
    form: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
    },
    label: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    input: {
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 15,
      minHeight: 48,
      paddingHorizontal: theme.spacing.md,
    },
    message: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
      justifyContent: "center",
      minHeight: 48,
    },
    primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
    note: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18 },
  });
}
