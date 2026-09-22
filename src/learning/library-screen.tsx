import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Alert, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  Download,
  FileText,
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
import type { Theme } from "../app/theme";
import { useReducedMotion } from "../app/use-reduced-motion";
import { fingerprintText, parseSrtOrVtt, splitLearningSentences } from "./enjoy-player-domain";
import { cleanMarkdownForLearning } from "./learning-enrichment";
import { isLocalAudioAsset, isLocalVideoAsset, persistLearningMedia } from "./learning-media-files";
import { deleteLearningResource } from "./learning-session";
import type { LearningResource, LearningSnapshot } from "./learning-types";
import { syncResourcePhrases } from "./resource-phrase-sync";

type LibraryFilter = "all" | "audio" | "video" | "text";
type Props = Readonly<{
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  onOpenPractice: (resource: LearningResource, snapshotForOpen?: LearningSnapshot) => void;
  theme: Theme;
}>;

export function LibraryScreen({ snapshot, onChange, onOpenPractice, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [openResourceId, setOpenResourceId] = useState<string | null>(null);
  const [working, setWorking] = useState<"subtitle" | "download" | null>(null);
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
            setOpenResourceId(null);
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
        <Pressable
          accessibilityRole="button"
          onPress={() => setMessage("")}
          style={[
            styles.message,
            message.startsWith("已") && styles.messageSuccess,
            message.startsWith("正在") && styles.messageWorking,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              message.startsWith("已") && styles.messageSuccessText,
              message.startsWith("正在") && styles.messageWorkingText,
            ]}
          >
            {message}
          </Text>
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
              setOpenResourceId(null);
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
            const translatedCount = resource.sentences.filter((sentence) =>
              Boolean(sentence.translation),
            ).length;
            const isVideo =
              resource.mediaKind === "video" ||
              resource.mediaKind === "youtube" ||
              resource.mediaKind === "bilibili";
            const kind = resource.mediaKind === "audio" ? "音频" : isVideo ? "视频" : "文本";
            return (
              <SwipeableResourceRow
                disabled={working !== null}
                key={resource.id}
                kind={kind}
                onDelete={() => confirmDeleteResource(resource)}
                onDownload={() => void downloadSelected(resource)}
                onOpenChange={(open) => setOpenResourceId(open ? resource.id : null)}
                onOpenPractice={() => onOpenPractice(resource)}
                open={openResourceId === resource.id}
                reduceMotion={reduceMotion}
                resource={resource}
                styles={styles}
                theme={theme}
                translatedCount={translatedCount}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const SWIPE_ACTION_WIDTH = 152;

function SwipeableResourceRow({
  resource,
  kind,
  translatedCount,
  open,
  reduceMotion,
  disabled,
  onOpenChange,
  onOpenPractice,
  onDownload,
  onDelete,
  styles,
  theme,
}: Readonly<{
  resource: LearningResource;
  kind: string;
  translatedCount: number;
  open: boolean;
  reduceMotion: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPractice: () => void;
  onDownload: () => void;
  onDelete: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  const [translateX] = useState(() => new Animated.Value(open ? SWIPE_ACTION_WIDTH : 0));

  const settle = useCallback(
    (nextOpen: boolean, velocity = 0) => {
      if (reduceMotion) {
        translateX.setValue(nextOpen ? SWIPE_ACTION_WIDTH : 0);
        return;
      }
      Animated.spring(translateX, {
        toValue: nextOpen ? SWIPE_ACTION_WIDTH : 0,
        stiffness: 280,
        damping: 28,
        mass: 1,
        velocity,
        useNativeDriver: true,
      }).start();
    },
    [reduceMotion, translateX],
  );

  useEffect(() => {
    settle(open);
  }, [open, settle]);

  const panResponder = useMemo(() => {
    let gestureOrigin = open ? SWIPE_ACTION_WIDTH : 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !disabled &&
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2 &&
        (gesture.dx > 10 || open),
      onPanResponderGrant: () => {
        translateX.stopAnimation((value) => {
          gestureOrigin = value;
        });
      },
      onPanResponderMove: (_event, gesture) => {
        const raw = gestureOrigin + gesture.dx;
        const next =
          raw < 0
            ? Math.max(-12, raw * 0.16)
            : raw > SWIPE_ACTION_WIDTH
              ? SWIPE_ACTION_WIDTH + (raw - SWIPE_ACTION_WIDTH) * 0.16
              : raw;
        translateX.setValue(next);
      },
      onPanResponderRelease: (_event, gesture) => {
        const projected = gestureOrigin + gesture.dx + gesture.vx * 64;
        const nextOpen = projected >= SWIPE_ACTION_WIDTH * 0.48;
        onOpenChange(nextOpen);
        settle(nextOpen, gesture.vx);
      },
      onPanResponderTerminate: () => settle(open),
    });
  }, [disabled, onOpenChange, open, settle, translateX]);

  const translationLabel = translatedCount
    ? translatedCount === resource.sentences.length
      ? "译文完整"
      : `${translatedCount} 句已翻译`
    : resource.sentences.length
      ? "可学习"
      : "等待字幕";

  return (
    <View style={styles.resourceItem}>
      <View
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "yes" : "no-hide-descendants"}
        pointerEvents={open ? "auto" : "none"}
        style={styles.swipeActions}
      >
        <Pressable
          accessibilityLabel={`下载资料 ${resource.title}`}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => {
            onOpenChange(false);
            onDownload();
          }}
          style={({ pressed }) => [
            styles.swipeAction,
            styles.downloadAction,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Download color={theme.colors.primary} size={20} />
          <Text style={styles.downloadActionText}>下载</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`删除资料 ${resource.title}`}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => {
            onOpenChange(false);
            onDelete();
          }}
          style={({ pressed }) => [
            styles.swipeAction,
            styles.swipeDeleteAction,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Trash2 color="#FFFFFF" size={20} />
          <Text style={styles.swipeDeleteText}>删除</Text>
        </Pressable>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.resourceSwipeSurface, { transform: [{ translateX }] }]}
      >
        <Pressable
          accessibilityHint="点按进入逐句学习；向右滑动可下载或删除"
          accessibilityLabel={`${resource.title}，${kind}，${resource.sentences.length} 句，${translationLabel}`}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => {
            if (open) onOpenChange(false);
            else onOpenPractice();
          }}
          style={({ pressed }) => [
            styles.resource,
            disabled && styles.disabled,
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
              {kind} · {resource.sentences.length} 句 · {translationLabel}
            </Text>
          </View>
          <ChevronRight color={theme.colors.mutedText} size={18} />
        </Pressable>
      </Animated.View>
    </View>
  );
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
    messageSuccess: { backgroundColor: theme.colors.successSoft },
    messageSuccessText: { color: theme.colors.success },
    messageWorking: { backgroundColor: theme.colors.primarySoft },
    messageWorkingText: { color: theme.colors.primaryText },
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
      minHeight: 76,
      overflow: "hidden",
      position: "relative",
    },
    resourceSwipeSurface: { backgroundColor: theme.colors.surface },
    resource: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing[3],
      minHeight: 76,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: 10,
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
    swipeActions: {
      alignItems: "center",
      bottom: 0,
      flexDirection: "row",
      left: 0,
      position: "absolute",
      top: 0,
      width: SWIPE_ACTION_WIDTH,
    },
    swipeAction: {
      alignItems: "center",
      gap: 6,
      justifyContent: "center",
      minHeight: 76,
      width: SWIPE_ACTION_WIDTH / 2,
    },
    downloadAction: { backgroundColor: theme.colors.primarySoft },
    downloadActionText: { color: theme.colors.primary, fontSize: 11, fontWeight: "700" },
    swipeDeleteAction: { backgroundColor: theme.colors.danger },
    swipeDeleteText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
