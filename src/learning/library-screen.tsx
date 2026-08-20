import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  ChevronRight,
  Download,
  FileText,
  Play,
  Languages,
  Subtitles,
  Upload,
  Video,
  Volume2,
  X,
} from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { AppServices } from "../app/app-services";
import type { AiProviderProfileId } from "../ai/provider-profile";
import type { Theme } from "../app/theme";
import { collectLearningResponse } from "./learning-ai";
import { fingerprintText, parseSrtOrVtt, splitLearningSentences } from "./enjoy-player-domain";
import { cleanMarkdownForLearning } from "./learning-enrichment";
import { transcribeOpenAiCompatibleMedia } from "./learning-stt";
import { isLocalAudioAsset, isLocalVideoAsset, persistLearningMedia } from "./learning-media-files";
import { bilibiliVideoReference } from "./bilibili-learning";
import type { LearningResource, LearningSnapshot } from "./learning-types";
import { syncResourcePhrases } from "./resource-phrase-sync";

type Composer = "closed" | "text" | "url";
type LibraryFilter = "all" | "audio" | "video" | "text";
type Props = Readonly<{
  services: AppServices;
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  onOpenPractice: (resource: LearningResource, snapshotForOpen?: LearningSnapshot) => void;
  theme: Theme;
}>;

export function LibraryScreen({ services, snapshot, onChange, onOpenPractice, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [composer, setComposer] = useState<Composer>("closed");
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [working, setWorking] = useState<"url" | "subtitle" | "translation" | "download" | null>(
    null,
  );
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const filteredResources = snapshot.resources.filter(
    (resource) =>
      filter === "all" ||
      resource.mediaKind === filter ||
      (filter === "video" && resource.mediaKind === "youtube") ||
      resource.mediaKind === "bilibili",
  );
  const selected =
    filteredResources.find((item) => item.id === snapshot.ui.selectedResourceId) ??
    filteredResources[0] ??
    null;
  const handledIntent = useRef<LearningSnapshot["ui"]["importIntent"]>(null);
  useEffect(() => {
    const intent = snapshot.ui.importIntent;
    if (!intent) {
      handledIntent.current = null;
      return;
    }
    if (handledIntent.current === intent) return;
    handledIntent.current = intent;
    const task = setTimeout(() => {
      persist(
        Object.freeze({ ...snapshot, ui: Object.freeze({ ...snapshot.ui, importIntent: null }) }),
      );
      if (intent === "text") setComposer("text");
      else if (intent === "url") setComposer("url");
      else if (intent === "subtitle") void importSubtitleForSelected();
      else if (intent === "recording") void toggleAudioCapture();
      else if (intent === "photo") void importFromPhotoLibrary();
      else void importFromFileProvider();
    }, 0);
    return () => clearTimeout(task);
    // The intent is deliberately consumed once per navigation event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.ui.importIntent]);

  function persist(next: LearningSnapshot) {
    onChange(next);
  }

  function createResource(
    options: Readonly<{
      name: string;
      content: string;
      mediaUri?: string;
      mediaKind?: "audio" | "video" | "text";
      sourceUrl?: string;
    }>,
  ): LearningResource {
    const now = new Date().toISOString();
    const id = `resource-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const content = cleanMarkdownForLearning(options.content);
    const sentences = splitLearningSentences(content);
    return Object.freeze({
      id,
      title: options.name.trim() || "未命名语料",
      description: options.mediaUri ? "已导入的媒体语料" : "英语句子语料",
      language: "English",
      source: options.mediaUri || options.sourceUrl ? "imported" : "manual",
      content,
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
      ...(options.mediaUri ? { mediaUri: options.mediaUri } : {}),
      mediaKind: options.mediaKind ?? "text",
      ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
      captionFingerprint: fingerprintText(content),
      createdAt: now,
      updatedAt: now,
    });
  }

  function save(resource: LearningResource, success: string) {
    const phraseSync = syncResourcePhrases(snapshot.vocabulary, resource, new Date().toISOString());
    persist(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze([resource, ...snapshot.resources]),
        vocabulary: phraseSync.cards,
        ui: Object.freeze({
          ...snapshot.ui,
          selectedResourceId: resource.id,
          selectedSentenceId: resource.sentences[0]?.id ?? null,
        }),
      }),
    );
    setMessage(
      phraseSync.createdCount > 0
        ? `${success} · 已识别 ${phraseSync.createdCount} 个可复用短语`
        : success,
    );
  }

  function updateResource(resource: LearningResource, notice: string) {
    persist(
      Object.freeze({
        ...snapshot,
        resources: Object.freeze(
          snapshot.resources.map((item) => (item.id === resource.id ? resource : item)),
        ),
        ui: Object.freeze({
          ...snapshot.ui,
          selectedResourceId: resource.id,
          selectedSentenceId: resource.sentences[0]?.id ?? null,
        }),
      }),
    );
    setMessage(notice);
  }

  function saveDraft() {
    const resource = createResource({ name: title || "我的英语笔记", content: draft });
    if (!resource.sentences.length) {
      setMessage("请粘贴至少一个可识别的英语句子。");
      return;
    }
    save(resource, `已完成 Markdown 清洗并切分为 ${resource.sentences.length} 句。`);
    setTitle("");
    setDraft("");
    setComposer("closed");
  }

  async function importFromFileProvider() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/*", "audio/*", "video/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    try {
      const name = asset.name.replace(/\.[^.]+$/u, "");
      const isText =
        asset.mimeType?.startsWith("text/") ?? /\.(md|markdown|txt|srt|vtt)$/iu.test(asset.name);
      if (isText) {
        const resource = createResource({
          name,
          content: await new File(asset.uri).text(),
          mediaKind: "text",
        });
        if (!resource.sentences.length) throw new Error("文件中没有可识别的英语句子。 ");
        save(resource, `已从文件提供方导入并切分 ${resource.sentences.length} 句。`);
        return;
      }
      const isVideo = isLocalVideoAsset(asset.name, asset.mimeType);
      const isAudio = isLocalAudioAsset(asset.name, asset.mimeType);
      if (!isVideo && !isAudio)
        throw new Error(
          "仅支持导入文本、音频或视频文件。视频可选择 MP4、MOV、M4V、WebM、MKV、AVI 或 3GP 格式。",
        );
      save(
        createResource({
          name,
          content: "",
          mediaUri: await persistLearningMedia({
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType ?? null,
          }),
          mediaKind: isVideo ? "video" : "audio",
        }),
        "已从文件提供方保存媒体。可以继续添加字幕或使用 AI 字幕提取。",
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个文件。 ");
    }
  }

  async function importFromPhotoLibrary() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage("未获得相册访问权限，请在系统设置中授权后重试。");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const fileName = asset.fileName ?? "photo-video.mp4";
      if (!isLocalVideoAsset(fileName, asset.mimeType))
        throw new Error(
          "所选文件不是受支持的视频格式，请选择 MP4、MOV、M4V、WebM、MKV、AVI 或 3GP 视频。",
        );
      const name =
        asset.fileName?.replace(/\.[^.]+$/u, "") ||
        `相册视频-${new Date().toLocaleDateString("zh-CN")}`;
      save(
        createResource({
          name,
          content: "",
          mediaUri: await persistLearningMedia({
            uri: asset.uri,
            name: fileName,
            mimeType: asset.mimeType ?? null,
          }),
          mediaKind: "video",
        }),
        "相册视频已保存。可立即添加字幕或使用 AI 字幕提取。",
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个相册视频。");
    }
  }

  async function toggleAudioCapture() {
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("录音没有生成可用文件，请重试。 ");
        save(
          createResource({
            name: `录音语料 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
            content: "",
            mediaUri: await persistLearningMedia({ uri, name: "recording.m4a" }),
            mediaKind: "audio",
          }),
          "录音已保存。点击 AI 字幕即可转为逐句播放的语料。",
        );
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("未获得麦克风权限，请在系统设置中授权后重试。 ");
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMessage("正在录音。结束后会保存为音频语料，可继续用 AI 字幕转写。 ");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "录音暂时不可用。 ");
    }
  }

  function snapshotWithUpdatedResource(resource: LearningResource): LearningSnapshot {
    return Object.freeze({
      ...snapshot,
      resources: Object.freeze(
        snapshot.resources.map((item) => (item.id === resource.id ? resource : item)),
      ),
      ui: Object.freeze({
        ...snapshot.ui,
        selectedResourceId: resource.id,
        selectedSentenceId: resource.sentences[0]?.id ?? null,
      }),
    });
  }

  function createSubtitledResource(
    resource: LearningResource,
    cues: readonly Readonly<{
      index: number;
      startMs: number | null;
      endMs: number | null;
      text: string;
    }>[],
  ): LearningResource {
    const now = new Date().toISOString();
    const content = cues.map((cue) => cue.text).join("\n");
    return Object.freeze({
      ...resource,
      content,
      sentences: Object.freeze(
        cues.map((cue, index) =>
          Object.freeze({
            id: `${resource.id}-caption-${cue.index}`,
            resourceId: resource.id,
            order: index + 1,
            text: cue.text,
            translation: null,
            startMs: cue.startMs,
            endMs: cue.endMs,
            sourceAudioUri: null,
          }),
        ),
      ),
      captionFingerprint: fingerprintText(content),
      updatedAt: now,
    });
  }

  function applySubtitleCues(
    resource: LearningResource,
    cues: readonly Readonly<{
      index: number;
      startMs: number | null;
      endMs: number | null;
      text: string;
    }>[],
    notice: string,
  ): LearningResource {
    const next = createSubtitledResource(resource, cues);
    updateResource(next, `${notice} 共 ${cues.length} 句。`);
    return next;
  }

  async function requestSubtitleCues(resource: LearningResource) {
    if (!resource.mediaUri) throw new Error("请先选中一个音频或视频语料，再使用 AI 字幕。");
    let baseUrl = snapshot.settings.sttBaseUrl;
    let apiKey: string | undefined;
    if (!baseUrl || !snapshot.settings.sttApiKeyStored) {
      const providerId = snapshot.settings.selectedProviderProfileId;
      if (!providerId)
        throw new Error("请先在应用的 AI 设置中选择已连接的引擎，或单独配置转写服务。");
      const profile = await services.aiStore.getProviderProfile(providerId as AiProviderProfileId);
      const storedKey = profile ? await services.aiSecretStore.get(profile.id) : null;
      if (!profile || !storedKey) throw new Error("当前 AI 引擎没有可用的服务地址或密钥。");
      baseUrl = profile.baseUrl;
      apiKey = storedKey;
    }
    return transcribeOpenAiCompatibleMedia({
      baseUrl,
      mediaUri: resource.mediaUri,
      language: "en",
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async function transcribeSelectedMedia() {
    if (!selected) {
      setMessage("请先选中一个音频或视频语料，再使用 AI 字幕。");
      return;
    }
    try {
      setWorking("subtitle");
      const cues = await requestSubtitleCues(selected);
      applySubtitleCues(selected, cues, "AI 字幕已提取并与媒体时间轴绑定。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "AI 字幕提取暂时失败。");
    } finally {
      setWorking(null);
    }
  }
  async function importSubtitleForSelected() {
    if (!selected) {
      setMessage("请先在资料库选择一个视频或音频，再导入对应的 SRT/VTT 字幕。 ");
      return;
    }
    try {
      setWorking("subtitle");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/vtt", "application/x-subrip", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const extensionIsSubtitle = /\.(srt|vtt)$/iu.test(asset.name);
      const mimeIsSubtitle =
        asset.mimeType === "text/vtt" || asset.mimeType === "application/x-subrip";
      if (!extensionIsSubtitle && !mimeIsSubtitle) {
        throw new Error("请选择 SRT 或 VTT 字幕文件。 ");
      }
      const cues = parseSrtOrVtt(await new File(asset.uri).text());
      if (!cues.length) throw new Error("字幕文件中没有可用的时间轴句子。 ");
      applySubtitleCues(selected, cues, `已导入 ${asset.name} 并绑定本地时间轴。`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个字幕文件。 ");
    } finally {
      setWorking(null);
    }
  }

  function startSelectedLearning() {
    if (!selected) {
      setMessage("请先选择一个视频，再开始学习。 ");
      return;
    }
    if (selected.sentences.length > 0) {
      onOpenPractice(selected);
      return;
    }
    setMessage("请先导入匹配的 SRT/VTT 字幕；本地字幕绑定后即可开始逐句学习。 ");
  }

  async function importUrl() {
    const sourceUrl = url.trim();
    if (!/^https?:\/\//iu.test(sourceUrl)) {
      setMessage("请输入完整的 http 或 https 链接。 ");
      return;
    }
    try {
      setWorking("url");
      const reference = bilibiliVideoReference(sourceUrl);
      if (reference) {
        const id = `bilibili-${reference.kind}-${reference.id}`;
        if (snapshot.resources.some((resource) => resource.id === id)) {
          setMessage("这个哔哩哔哩视频已经保存在资料库中。 ");
          return;
        }
        const now = new Date().toISOString();
        const resource: LearningResource = Object.freeze({
          id,
          title:
            reference.kind === "episode"
              ? `哔哩哔哩番剧 ${reference.id}`
              : `哔哩哔哩视频 ${reference.id}`,
          description: "本地保存的哔哩哔哩公开视频引用；请另行导入匹配的 SRT/VTT 字幕。",
          language: "未设置",
          source: "bilibili",
          provider: "library",
          content: "",
          sentences: Object.freeze([]),
          mediaKind: "bilibili",
          sourceUrl,
          createdAt: now,
          updatedAt: now,
        });
        save(resource, "哔哩哔哩公开视频链接已保存。请选择该视频后导入匹配的 SRT/VTT 字幕。 ");
        setUrl("");
        setComposer("closed");
        return;
      }
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`网页读取失败（${response.status}）。`);
      const html = await response.text();
      const pageTitle =
        /<title[^>]*>([\s\S]*?)<\/title>/iu
          .exec(html)?.[1]
          ?.replace(/<[^>]+>/gu, "")
          .trim() || "网页语料";
      const text = html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/giu, " ")
        .replace(/<[^>]+>/gu, " ")
        .replace(/&nbsp;|&amp;|&quot;/giu, " ")
        .replace(/\s+/gu, " ");
      const resource = createResource({ name: pageTitle, content: text, sourceUrl });
      if (!resource.sentences.length) {
        throw new Error("链接没有返回可切分的正文；视频和播客请导入媒体或字幕。 ");
      }
      save(resource, `网页已导入并切分 ${resource.sentences.length} 句。`);
      setUrl("");
      setComposer("closed");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个链接。 ");
    } finally {
      setWorking(null);
    }
  }

  async function translateSelectedResource() {
    if (!selected?.sentences.length) {
      setMessage("请先选中有句子的语料。 ");
      return;
    }
    try {
      setWorking("translation");
      const requestLines = selected.sentences
        .map((sentence) => `${sentence.order}. ${sentence.text}`)
        .join("\n");
      const raw = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          {
            role: "user",
            content: `Translate each English sentence into concise natural Simplified Chinese for learners. Keep the same order. Return only valid JSON: {"translations":["中文1","中文2"]}.\n\n${requestLines}`,
          },
        ]),
      });
      const translations = parseTranslations(raw, selected.sentences.length);
      const now = new Date().toISOString();
      const next: LearningResource = Object.freeze({
        ...selected,
        sentences: Object.freeze(
          selected.sentences.map((sentence, index) =>
            Object.freeze({
              ...sentence,
              translation: translations[index] ?? sentence.translation,
            }),
          ),
        ),
        updatedAt: now,
      });
      persist(
        Object.freeze({
          ...snapshot,
          resources: Object.freeze(
            snapshot.resources.map((item) => (item.id === next.id ? next : item)),
          ),
          translations: Object.freeze([
            ...snapshot.translations.filter(
              (item) => !selected.sentences.some((sentence) => sentence.id === item.sentenceId),
            ),
            ...next.sentences.flatMap((sentence) =>
              sentence.translation
                ? [
                    Object.freeze({
                      id: `translation-${sentence.id}`,
                      sentenceId: sentence.id,
                      sourceFingerprint: fingerprintText(sentence.text),
                      sourceText: sentence.text,
                      targetLanguage: snapshot.settings.translationTargetLanguage,
                      translation: sentence.translation,
                      contextNote: null,
                      updatedAt: now,
                    }),
                  ]
                : [],
            ),
          ]),
        }),
      );
      setMessage(`已完成 ${translations.filter(Boolean).length} 句 AI 字幕翻译。`);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "字幕翻译暂时失败。请先确认 AI 服务已配置。 ",
      );
    } finally {
      setWorking(null);
    }
  }

  async function downloadSelected() {
    if (!selected) return;
    try {
      setWorking("download");
      if (!(await Sharing.isAvailableAsync())) throw new Error("当前设备不支持系统分享或下载。 ");
      if (selected.mediaUri) {
        if (/^https?:\/\//iu.test(selected.mediaUri)) {
          const extension =
            /\.([a-z0-9]{2,5})(?:$|[?#])/iu.exec(selected.mediaUri)?.[1] ??
            (selected.mediaKind === "video" ? "mp4" : "mp3");
          const file = await File.downloadFileAsync(
            selected.mediaUri,
            new File(Paths.cache, `mira-${Date.now()}.${extension}`),
          );
          await Sharing.shareAsync(file.uri, { dialogTitle: "保存媒体语料" });
        } else {
          await Sharing.shareAsync(selected.mediaUri, { dialogTitle: "保存媒体语料" });
        }
      } else {
        const file = new File(Paths.cache, `${safeFileName(selected.title)}.md`);
        file.write(
          `# ${selected.title}\n\n${selected.sentences.map((sentence) => `${sentence.order}. ${sentence.text}${sentence.translation ? `\n   ${sentence.translation}` : ""}`).join("\n\n")}\n`,
        );
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/markdown",
          dialogTitle: "导出逐句笔记",
        });
      }
      setMessage("已打开系统保存面板。 ");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "下载暂时失败。 ");
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={styles.content}>
      {composer !== "closed" ? (
        <View style={styles.composer}>
          <View style={styles.composerTabs}>
            <ComposerTab
              label="粘贴文字"
              selected={composer === "text"}
              onPress={() => setComposer("text")}
              styles={styles}
            />
            <ComposerTab
              label="网页链接"
              selected={composer === "url"}
              onPress={() => setComposer("url")}
              styles={styles}
            />
          </View>
          {composer === "text" ? (
            <>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="标题（可选）"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
              />
              <TextInput
                multiline
                value={draft}
                onChangeText={setDraft}
                placeholder="粘贴 Markdown 或普通文本，不需要手动一行一句。"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.textarea}
                textAlignVertical="top"
              />
              <Pressable
                accessibilityRole="button"
                onPress={saveDraft}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>自动切句并保存</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                autoCapitalize="none"
                inputMode="url"
                value={url}
                onChangeText={setUrl}
                placeholder="粘贴网页、B站或播客链接"
                placeholderTextColor={theme.colors.mutedText}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                disabled={working === "url"}
                onPress={() => void importUrl()}
                style={({ pressed }) => [
                  styles.primary,
                  working === "url" && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {working === "url" ? (
                  <ActivityIndicator color={theme.colors.canvas} />
                ) : (
                  <Text style={styles.primaryText}>导入网页正文</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {message ? (
        <Pressable accessibilityRole="button" onPress={() => setMessage("")} style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
          <X color={theme.colors.mutedText} size={14} />
        </Pressable>
      ) : null}
      <View style={styles.filterRow}>
        {(["all", "audio", "video", "text"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => setFilter(item)}
            style={[styles.filterChip, filter === item && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item === "all"
                ? "全部"
                : item === "audio"
                  ? "音频"
                  : item === "video"
                    ? "视频"
                    : "文本"}
            </Text>
          </Pressable>
        ))}
      </View>
      {!snapshot.resources.length ? (
        <View style={styles.empty}>
          <Upload color={theme.colors.mutedText} size={24} />
          <Text style={styles.emptyTitle}>还没有语料</Text>
          <Text style={styles.copy}>先粘贴一段英语笔记，几秒钟就能开始逐句听。</Text>
        </View>
      ) : null}
      {selected ? (
        <>
          <Pressable
            accessibilityLabel={`开始学习 ${selected.title}`}
            accessibilityRole="button"
            onPress={() => void startSelectedLearning()}
            style={({ pressed }) => [styles.heroCard, pressed && styles.heroPressed]}
          >
            <ResourceHeroArtwork />
            <View style={styles.heroDocumentIcon}>
              {selected.mediaKind === "video" ||
              selected.mediaKind === "youtube" ||
              selected.mediaKind === "bilibili" ? (
                <Video color="#D6E2FF" size={20} strokeWidth={1.8} />
              ) : selected.mediaKind === "audio" ? (
                <Volume2 color="#D6E2FF" size={20} strokeWidth={1.8} />
              ) : (
                <FileText color="#D6E2FF" size={20} strokeWidth={1.8} />
              )}
            </View>
            <View style={styles.heroCopy}>
              <View style={styles.heroTitleRow}>
                <Text numberOfLines={1} style={styles.heroTitle}>
                  {selected.title}
                </Text>
                <View style={styles.heroCountPill}>
                  <Text style={styles.heroCountText}>
                    {Math.max(1, filteredResources.indexOf(selected) + 1)} /{" "}
                    {filteredResources.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroMeta}>
                {selected.sentences.length
                  ? `${selected.sentences.length} 句 · ${selected.sentences.some((sentence) => sentence.startMs !== null) ? "已绑定时间轴" : "可系统朗读"}`
                  : "等待字幕"}
              </Text>
              <View style={styles.heroDivider} />
              <Text numberOfLines={1} style={styles.heroDescription}>
                {selected.sentences.length
                  ? "继续完善这份学习材料"
                  : selected.mediaKind === "bilibili"
                    ? "请导入匹配的 SRT/VTT 字幕"
                    : "媒体尚未生成句子；可导入字幕或使用 AI 转写"}
              </Text>
            </View>
            <View style={styles.heroPlayButton}>
              <Play color="#3988FF" fill="#3988FF" size={17} />
            </View>
          </Pressable>
          <View style={styles.processingGrid}>
            <ProcessingAction
              icon={Subtitles}
              label={selected.mediaKind === "bilibili" ? "导入字幕" : "识别字幕"}
              detail={
                working === "subtitle"
                  ? "处理中…"
                  : selected.mediaKind === "bilibili"
                    ? "选择本地 SRT/VTT"
                    : "提取并切句"
              }
              onPress={() =>
                void (selected.mediaKind === "bilibili"
                  ? importSubtitleForSelected()
                  : transcribeSelectedMedia())
              }
              disabled={working !== null}
              featured
              styles={styles}
              theme={theme}
            />
            <ProcessingAction
              icon={Languages}
              label="逐句翻译"
              detail={working === "translation" ? "翻译中…" : "逐句中译"}
              onPress={() => void translateSelectedResource()}
              disabled={working !== null || !selected.sentences.length}
              styles={styles}
              theme={theme}
            />
            <ProcessingAction
              icon={Download}
              label="下载"
              detail={working === "download" ? "准备中…" : "媒体 / 笔记"}
              onPress={() => void downloadSelected()}
              disabled={working !== null}
              styles={styles}
              theme={theme}
            />
            <ProcessingAction
              icon={Play}
              label={selected.sentences.length ? "逐句学习" : "导入字幕后学习"}
              detail={
                working === "subtitle"
                  ? "正在导入字幕…"
                  : selected.sentences.length
                    ? "进入新版学习页"
                    : "先选择本地 SRT/VTT 字幕"
              }
              onPress={() => void startSelectedLearning()}
              disabled={working !== null}
              styles={styles}
              theme={theme}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

function parseTranslations(raw: string, expectedLength: number): readonly string[] {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const payload = JSON.parse(normalized) as unknown;
  const translationField =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).translations
      : payload;
  const values: readonly unknown[] = Array.isArray(translationField) ? translationField : [];
  const translations = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .slice(0, expectedLength);
  if (!translations.some(Boolean)) throw new Error("AI 没有返回可保存的翻译。 ");
  return Object.freeze(translations);
}

function safeFileName(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]/gu, "-")
      .trim()
      .slice(0, 60) || "mira-notes"
  );
}

function ComposerTab({
  label,
  selected,
  onPress,
  styles,
}: Readonly<{
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}>) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.composerTab,
        selected && styles.composerTabSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.composerTabText, selected && styles.composerTabTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ResourceHeroArtwork() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 760 440" width="100%">
        <Defs>
          <LinearGradient id="hero-bg" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#143A80" stopOpacity="0.98" />
            <Stop offset="0.38" stopColor="#071A3B" stopOpacity="0.76" />
            <Stop offset="1" stopColor="#020918" stopOpacity="0.98" />
          </LinearGradient>
          <LinearGradient id="wave" x1="0" x2="1" y1="0" y2="0.2">
            <Stop offset="0" stopColor="#0A4EC0" stopOpacity="0" />
            <Stop offset="0.55" stopColor="#176DFF" stopOpacity="0.74" />
            <Stop offset="1" stopColor="#63A0FF" stopOpacity="0.94" />
          </LinearGradient>
          <LinearGradient id="card" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#244C9A" stopOpacity="0.62" />
            <Stop offset="1" stopColor="#09152D" stopOpacity="0.36" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#hero-bg)" height="440" rx="34" width="760" />
        <Circle cx="560" cy="220" fill="#0D54D8" opacity="0.12" r="155" />
        <Rect
          fill="url(#card)"
          height="158"
          opacity="0.42"
          rx="17"
          stroke="#567DCE"
          strokeOpacity="0.32"
          transform="rotate(-11 614 156)"
          width="148"
          x="540"
          y="78"
        />
        <Rect
          fill="url(#card)"
          height="166"
          opacity="0.64"
          rx="18"
          stroke="#6287D4"
          strokeOpacity="0.4"
          width="154"
          x="575"
          y="88"
        />
        <Rect
          fill="#0C1D42"
          height="170"
          opacity="0.92"
          rx="18"
          stroke="#4A75CB"
          strokeOpacity="0.72"
          width="158"
          x="602"
          y="112"
        />
        <Rect fill="#5280D0" height="9" opacity="0.72" rx="5" width="43" x="626" y="148" />
        <Rect fill="#274B8E" height="9" opacity="0.64" rx="5" width="74" x="626" y="175" />
        <Rect fill="#193A75" height="9" opacity="0.52" rx="5" width="62" x="626" y="202" />
        <Path
          d="M320 265 C430 360 495 350 570 286 C642 225 696 216 790 242"
          fill="none"
          opacity="0.26"
          stroke="#0B55D7"
          strokeWidth="78"
        />
        <Path
          d="M322 250 C432 336 497 334 574 274 C646 217 704 207 790 232"
          fill="none"
          opacity="0.34"
          stroke="url(#wave)"
          strokeWidth="34"
        />
        <Path
          d="M320 243 C430 325 500 327 577 266 C650 208 706 202 790 224"
          fill="none"
          stroke="#3C8BFF"
          strokeOpacity="0.82"
          strokeWidth="2.2"
        />
        {Array.from({ length: 8 }, (_, index) => (
          <Path
            d={`M324 ${258 + index * 7} C438 ${338 + index * 5} 506 ${342 + index * 6} 582 ${278 + index * 4} C650 ${222 + index * 3} 710 ${216 + index * 2} 790 ${238 + index * 2}`}
            fill="none"
            key={index}
            opacity={0.42 - index * 0.035}
            stroke="#2677F5"
            strokeDasharray="2 7"
            strokeWidth="1.4"
          />
        ))}
        <Circle cx="493" cy="188" fill="#3789FF" opacity="0.88" r="1.8" />
        <Circle cx="538" cy="162" fill="#3789FF" opacity="0.58" r="1.2" />
        <Circle cx="445" cy="119" fill="#3789FF" opacity="0.42" r="1.3" />
      </Svg>
    </View>
  );
}

function ProcessingAction({
  icon: Icon,
  label,
  detail,
  onPress,
  disabled,
  featured = false,
  styles,
  theme,
}: Readonly<{
  icon: typeof FileText;
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
  featured?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，${detail}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.processingAction,
        featured && styles.processingActionFeatured,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon color="#3988FF" size={21} strokeWidth={1.9} />
      <View style={styles.processingCopyBlock}>
        <Text style={styles.processingLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.processingDetail}>
          {detail}
        </Text>
      </View>
      <View style={[styles.actionArrow, featured && styles.actionArrowFeatured]}>
        <ChevronRight
          color={featured ? "#FFFFFF" : theme.colors.text}
          size={17}
          strokeWidth={2.1}
        />
      </View>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: { gap: 11, paddingHorizontal: 18, paddingTop: 13 },
    copy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    composer: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 11,
      padding: 14,
    },
    composerTabs: { flexDirection: "row", gap: 8 },
    composerTab: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    composerTabSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    composerTabText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    composerTabTextSelected: { color: theme.colors.canvas },
    input: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      padding: 11,
    },
    textarea: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      minHeight: 145,
      padding: 11,
    },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      justifyContent: "center",
      minHeight: 45,
    },
    primaryText: { color: theme.colors.canvas, fontSize: 13, fontWeight: "700" },
    message: {
      alignItems: "center",
      backgroundColor: theme.colors.warningSurface,
      borderRadius: 10,
      flexDirection: "row",
      gap: 9,
      justifyContent: "space-between",
      padding: 11,
    },
    messageText: { color: theme.colors.warningText, flex: 1, fontSize: 12, lineHeight: 18 },
    filterRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
    filterChip: {
      alignItems: "center",
      backgroundColor: "rgba(18, 25, 40, 0.76)",
      borderColor: "rgba(130, 151, 188, 0.17)",
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: "#0867E8",
      borderColor: "#1B7BFF",
      shadowColor: "#1778FF",
      shadowOpacity: 0.3,
      shadowRadius: 10,
    },
    filterText: { color: "#8D94A3", fontSize: 12, fontWeight: "600" },
    filterTextActive: { color: "#FFFFFF" },
    deleteButton: {
      alignItems: "center",
      borderRadius: 999,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    libraryHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
    count: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "600" },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
      padding: 24,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    heroCard: {
      backgroundColor: "#061126",
      borderColor: "rgba(91, 126, 187, 0.34)",
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      height: 210,
      marginTop: 1,
      overflow: "hidden",
      padding: 17,
      position: "relative",
      shadowColor: "#0A57D6",
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
    },
    heroPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
    heroDocumentIcon: {
      alignItems: "center",
      backgroundColor: "rgba(3, 13, 34, 0.72)",
      borderColor: "rgba(154, 183, 237, 0.42)",
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    heroCopy: { bottom: 17, left: 17, position: "absolute", width: "60%" },
    heroTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    heroTitle: {
      color: "#F7F9FF",
      flexShrink: 1,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.5,
      lineHeight: 23,
    },
    heroCountPill: {
      alignItems: "center",
      backgroundColor: "rgba(10, 21, 43, 0.76)",
      borderColor: "rgba(109, 137, 188, 0.24)",
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: "center",
      minHeight: 24,
      paddingHorizontal: 9,
    },
    heroCountText: { color: "#AAB3C6", fontSize: 10, fontWeight: "600" },
    heroMeta: { color: "#9AA4B8", fontSize: 11, lineHeight: 16, marginTop: 4 },
    heroDivider: {
      borderTopColor: "rgba(152, 173, 209, 0.19)",
      borderTopWidth: StyleSheet.hairlineWidth,
      marginBottom: 9,
      marginTop: 13,
      width: "100%",
    },
    heroDescription: { color: "#8F99AD", fontSize: 12, lineHeight: 17 },
    heroPlayButton: {
      alignItems: "center",
      backgroundColor: "rgba(6, 16, 35, 0.8)",
      borderColor: "rgba(68, 127, 234, 0.62)",
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      bottom: 17,
      height: 40,
      justifyContent: "center",
      position: "absolute",
      right: 18,
      width: 40,
    },
    resourceList: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    resource: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      minHeight: 66,
      paddingVertical: 10,
    },
    resourceMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10 },
    resourceSelected: {
      backgroundColor: theme.colors.accentSoft,
    },
    resourceIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      height: 33,
      justifyContent: "center",
      width: 33,
    },
    resourceText: { flex: 1, gap: 3 },
    resourceTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    resourceMeta: { color: theme.colors.mutedText, fontSize: 11 },
    processingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    processingAction: {
      backgroundColor: "rgba(18, 24, 38, 0.92)",
      borderColor: "rgba(110, 130, 168, 0.18)",
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      flexBasis: "47%",
      flexGrow: 1,
      height: 82,
      justifyContent: "space-between",
      minWidth: "46%",
      overflow: "hidden",
      padding: 11,
      position: "relative",
    },
    processingActionFeatured: {
      backgroundColor: "#101C35",
      borderColor: "#2075F4",
      shadowColor: "#2A7CFF",
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
    },
    processingCopyBlock: { gap: 1, paddingRight: 29 },
    processingLabel: {
      color: "#F7F9FF",
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: -0.25,
      lineHeight: 17,
    },
    processingDetail: { color: "#858D9D", fontSize: 10, lineHeight: 14 },
    actionArrow: {
      alignItems: "center",
      backgroundColor: "rgba(40, 48, 65, 0.72)",
      borderRadius: 999,
      bottom: 11,
      height: 32,
      justifyContent: "center",
      position: "absolute",
      right: 11,
      width: 32,
    },
    actionArrowFeatured: { backgroundColor: "#2A7CF2" },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
