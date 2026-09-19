import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Languages,
  Play,
  Subtitles,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
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
import { deleteLearningResource } from "./learning-session";
import type { LearningResource, LearningSnapshot } from "./learning-types";
import { syncResourcePhrases } from "./resource-phrase-sync";

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
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [working, setWorking] = useState<"subtitle" | "translation" | "download" | null>(null);
  const filteredResources = snapshot.resources.filter(
    (resource) =>
      filter === "all" ||
      resource.mediaKind === filter ||
      (filter === "video" &&
        (resource.mediaKind === "youtube" || resource.mediaKind === "bilibili")),
  );
  const selected =
    snapshot.resources.find((item) => item.id === snapshot.ui.selectedResourceId) ?? null;
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
      if (intent === "text") setMessage("文字内容请使用“创建学习材料”。");
      else if (intent === "url") setMessage("请从“导入资料”进入独立的 URL 导入页面。");
      else if (intent === "subtitle") void importSubtitleForSelected();
      else if (intent === "recording") setMessage("录音入口已合并到“导入资料 → 创建学习材料”。");
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

  function selectResource(resource: LearningResource) {
    if (resource.id === expandedResourceId) {
      setExpandedResourceId(null);
      return;
    }
    setExpandedResourceId(resource.id);
    if (resource.id === snapshot.ui.selectedResourceId) return;
    persist(
      Object.freeze({
        ...snapshot,
        ui: Object.freeze({
          ...snapshot.ui,
          selectedResourceId: resource.id,
          selectedSentenceId: resource.sentences[0]?.id ?? null,
        }),
      }),
    );
  }

  function confirmDeleteResource(resource: LearningResource) {
    Alert.alert(
      "删除这项资料？",
      `“${resource.title}”及其学习进度、字幕和翻译将从资料库移除。设备中的原始文件不会被删除。`,
      [
        Object.freeze({ text: "取消", style: "cancel" as const }),
        Object.freeze({
          text: "删除",
          style: "destructive" as const,
          onPress: () => {
            persist(deleteLearningResource(snapshot, resource.id));
            setExpandedResourceId(null);
            setMessage(`已删除“${resource.title}”。`);
          },
        }),
      ],
    );
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

  async function transcribeSelectedMedia(resource: LearningResource | null = selected) {
    if (!resource) {
      setMessage("请先选中一个音频或视频语料，再使用 AI 字幕。");
      return;
    }
    try {
      setWorking("subtitle");
      const cues = await requestSubtitleCues(resource);
      applySubtitleCues(resource, cues, "AI 字幕已提取并与媒体时间轴绑定。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "AI 字幕提取暂时失败。");
    } finally {
      setWorking(null);
    }
  }
  async function importSubtitleForSelected(resource: LearningResource | null = selected) {
    if (!resource) {
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
      applySubtitleCues(resource, cues, `已导入 ${asset.name} 并绑定本地时间轴。`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法导入这个字幕文件。 ");
    } finally {
      setWorking(null);
    }
  }

  function startSelectedLearning(resource: LearningResource | null = selected) {
    if (!resource) {
      setMessage("请先选择一个视频，再开始学习。 ");
      return;
    }
    if (resource.sentences.length > 0) {
      onOpenPractice(resource);
      return;
    }
    setMessage("请先导入匹配的 SRT/VTT 字幕；本地字幕绑定后即可开始逐句学习。 ");
  }

  async function translateSelectedResource(resource: LearningResource | null = selected) {
    if (!resource?.sentences.length) {
      setMessage("请先选中有句子的语料。 ");
      return;
    }
    try {
      setWorking("translation");
      const requestLines = resource.sentences
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
      const translations = parseTranslations(raw, resource.sentences.length);
      const now = new Date().toISOString();
      const next: LearningResource = Object.freeze({
        ...resource,
        sentences: Object.freeze(
          resource.sentences.map((sentence, index) =>
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
              (item) => !resource.sentences.some((sentence) => sentence.id === item.sentenceId),
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

  async function downloadSelected(resource: LearningResource | null = selected) {
    if (!resource) return;
    try {
      setWorking("download");
      if (!(await Sharing.isAvailableAsync())) throw new Error("当前设备不支持系统分享或下载。 ");
      if (resource.mediaUri) {
        if (/^https?:\/\//iu.test(resource.mediaUri)) {
          const extension =
            /\.([a-z0-9]{2,5})(?:$|[?#])/iu.exec(resource.mediaUri)?.[1] ??
            (resource.mediaKind === "video" ? "mp4" : "mp3");
          const file = await File.downloadFileAsync(
            resource.mediaUri,
            new File(Paths.cache, `mira-${Date.now()}.${extension}`),
          );
          await Sharing.shareAsync(file.uri, { dialogTitle: "保存媒体语料" });
        } else {
          await Sharing.shareAsync(resource.mediaUri, { dialogTitle: "保存媒体语料" });
        }
      } else {
        const file = new File(Paths.cache, `${safeFileName(resource.title)}.md`);
        file.write(
          `# ${resource.title}\n\n${resource.sentences.map((sentence) => `${sentence.order}. ${sentence.text}${sentence.translation ? `\n   ${sentence.translation}` : ""}`).join("\n\n")}\n`,
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
            onPress={() => {
              setFilter(item);
              setExpandedResourceId(null);
            }}
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
      {!filteredResources.length ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconContainer}>
            <Upload color={theme.colors.primary} size={24} />
          </View>
          <Text style={styles.emptyTitle}>
            {snapshot.resources.length ? "没有这一类资料" : "还没有资料"}
          </Text>
          <Text style={styles.copy}>
            {snapshot.resources.length
              ? "切换类型，或从右上角导入新的学习材料。"
              : "从右上角导入文字、音频或视频。"}
          </Text>
        </View>
      ) : (
        <View style={styles.resourceList}>
          {filteredResources.map((resource) => {
            const resourceExpanded = resource.id === expandedResourceId;
            const isVideo =
              resource.mediaKind === "video" ||
              resource.mediaKind === "youtube" ||
              resource.mediaKind === "bilibili";
            const kind = resource.mediaKind === "audio" ? "音频" : isVideo ? "视频" : "文本";
            return (
              <View key={resource.id} style={styles.resourceItem}>
                <Pressable
                  accessibilityLabel={`${resource.title}，${kind}，${resource.sentences.length} 句，${resourceExpanded ? "收起资料操作" : "展开资料操作"}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: resourceExpanded }}
                  onPress={() => selectResource(resource)}
                  style={({ pressed }) => [
                    styles.resource,
                    resourceExpanded && styles.resourceSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.resourceArtwork}>
                    <LibraryResourceIcon resource={resource} theme={theme} />
                  </View>
                  <View style={styles.resourceText}>
                    <Text numberOfLines={1} style={styles.resourceTitle}>
                      {resource.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.resourceMeta}>
                      {kind} · {resource.sentences.length} 句 ·{" "}
                      {resource.sentences.length ? "可学习" : "等待字幕"}
                    </Text>
                  </View>
                  {resourceExpanded ? (
                    <ChevronDown color={theme.colors.primary} size={18} />
                  ) : (
                    <ChevronRight color={theme.colors.mutedText} size={18} />
                  )}
                </Pressable>
                {resourceExpanded ? (
                  <View style={styles.resourceActions}>
                    <View style={styles.processingGrid}>
                      <ProcessingAction
                        icon={Subtitles}
                        label={resource.mediaKind === "bilibili" ? "导入字幕" : "识别字幕"}
                        detail={
                          working === "subtitle"
                            ? "处理中…"
                            : resource.mediaKind === "bilibili"
                              ? "选择本地 SRT/VTT"
                              : "提取并切句"
                        }
                        onPress={() =>
                          void (resource.mediaKind === "bilibili"
                            ? importSubtitleForSelected(resource)
                            : transcribeSelectedMedia(resource))
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
                        onPress={() => void translateSelectedResource(resource)}
                        disabled={working !== null || !resource.sentences.length}
                        styles={styles}
                        theme={theme}
                      />
                      <ProcessingAction
                        icon={Download}
                        label="下载"
                        detail={working === "download" ? "准备中…" : "媒体 / 笔记"}
                        onPress={() => void downloadSelected(resource)}
                        disabled={working !== null}
                        styles={styles}
                        theme={theme}
                      />
                      <ProcessingAction
                        icon={Play}
                        label={resource.sentences.length ? "逐句学习" : "导入字幕后学习"}
                        detail={
                          working === "subtitle"
                            ? "正在导入字幕…"
                            : resource.sentences.length
                              ? "进入新版学习页"
                              : "先选择本地 SRT/VTT 字幕"
                        }
                        onPress={() => void startSelectedLearning(resource)}
                        disabled={working !== null}
                        styles={styles}
                        theme={theme}
                      />
                    </View>
                    <View style={styles.resourceActionFooter}>
                      <Pressable
                        accessibilityLabel={`删除资料 ${resource.title}`}
                        accessibilityRole="button"
                        disabled={working !== null}
                        onPress={() => confirmDeleteResource(resource)}
                        style={({ pressed }) => [
                          styles.deleteAction,
                          working !== null && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Trash2 color={theme.colors.danger} size={16} />
                        <Text style={styles.deleteActionText}>删除资料</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
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

function LibraryResourceIcon({
  resource,
  theme,
}: Readonly<{ resource: LearningResource; theme: Theme }>) {
  if (resource.mediaKind === "audio") {
    return <Volume2 color={theme.colors.text} size={21} strokeWidth={1.8} />;
  }
  if (
    resource.mediaKind === "video" ||
    resource.mediaKind === "youtube" ||
    resource.mediaKind === "bilibili"
  ) {
    return <Video color={theme.colors.text} size={21} strokeWidth={1.8} />;
  }
  return <FileText color={theme.colors.text} size={21} strokeWidth={1.8} />;
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
      <Icon color={theme.colors.text} size={21} strokeWidth={1.9} />
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
    content: {
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[3],
    },
    copy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    message: {
      alignItems: "center",
      backgroundColor: theme.colors.warningSurface,
      borderRadius: theme.radius.medium,
      flexDirection: "row",
      gap: theme.spacing[2],
      justifyContent: "space-between",
      padding: theme.spacing[3],
    },
    messageText: { color: theme.colors.warningText, flex: 1, fontSize: 12, lineHeight: 18 },
    filterRow: { flexDirection: "row", gap: theme.spacing[2], marginBottom: 2 },
    filterChip: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.borderSubtle,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: theme.radius.pill,
      justifyContent: "center",
      minHeight: 34,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    filterChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      ...theme.shadows.sm,
    },
    filterText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "500" },
    filterTextActive: { color: "#FFFFFF", fontWeight: "600" },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing[2],
      padding: theme.spacing[6],
      ...theme.shadows.sm,
    },
    emptyIconContainer: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    resourceList: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.large,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      ...theme.shadows.sm,
    },
    resourceItem: {
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resource: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing[3],
      minHeight: 76,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: 10,
    },
    resourceSelected: {
      backgroundColor: theme.colors.primarySoft,
    },
    resourceArtwork: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.medium,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderSubtle,
      height: 52,
      justifyContent: "center",
      width: 64,
    },
    resourceText: { flex: 1, gap: 3 },
    resourceTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    resourceMeta: { color: theme.colors.mutedText, fontSize: 11, lineHeight: 16 },
    resourceActions: {
      backgroundColor: theme.colors.surfaceMuted,
      borderTopColor: theme.colors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: theme.spacing[2],
      padding: theme.spacing[3],
    },
    processingGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
    processingAction: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      borderWidth: StyleSheet.hairlineWidth,
      flexBasis: "47%",
      flexGrow: 1,
      height: 82,
      justifyContent: "space-between",
      minWidth: "46%",
      overflow: "hidden",
      padding: 11,
      position: "relative",
      ...theme.shadows.sm,
    },
    processingActionFeatured: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
    processingCopyBlock: { gap: 1, paddingRight: 29 },
    processingLabel: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: -0.25,
      lineHeight: 17,
    },
    processingDetail: { color: theme.colors.mutedText, fontSize: 10, lineHeight: 14 },
    actionArrow: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.pill,
      bottom: 11,
      height: 30,
      justifyContent: "center",
      position: "absolute",
      right: 11,
      width: 30,
    },
    actionArrowFeatured: { backgroundColor: theme.colors.primary },
    resourceActionFooter: { alignItems: "flex-end" },
    deleteAction: {
      alignItems: "center",
      borderRadius: theme.radius.medium,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 9,
    },
    deleteActionText: { color: theme.colors.danger, fontSize: 12, fontWeight: "600" },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
