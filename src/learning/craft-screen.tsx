import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  Mic,
  Pause,
  Play,
  RefreshCcw,
  Save,
  Square,
  Volume2,
} from "lucide-react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { AppServices } from "../app/app-services";
import type { Theme } from "../app/theme";
import { addManualLearningResourceToLibrary, createManualLearningResource } from "./craft-resource";
import { splitLearningSentences } from "./enjoy-player-domain";
import { collectLearningResponse } from "./learning-ai";
import { transcribeOpenAiCompatibleMedia } from "./learning-stt";
import { synthesizeOpenAiCompatibleSpeech } from "./learning-tts";
import type { LearningResource, LearningSnapshot } from "./learning-types";

type CraftMode = "basic" | "advanced";
type StyleName = "自然" | "正式" | "口语" | "直译";

const SOURCE_LANGUAGE = "中文";
const TARGET_LANGUAGE = "英语";

type Props = Readonly<{
  services: AppServices;
  snapshot: LearningSnapshot;
  theme: Theme;
  onChange: (snapshot: LearningSnapshot) => void;
  onClose: () => void;
}>;

export function CraftScreen({ services, snapshot, theme, onChange, onClose }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<CraftMode>("basic");
  const [manualTitle, setManualTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [style, setStyle] = useState<StyleName>("自然");
  const [voice, setVoice] = useState(snapshot.settings.ttsVoiceId || "alloy");
  const [working, setWorking] = useState<"transcribe" | "rewrite" | "speech" | "save" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const previewPlayer = useAudioPlayer(previewUri);
  const previewStatus = useAudioPlayerStatus(previewPlayer);
  const idRef = useRef(0);

  function nextId(prefix: string) {
    idRef.current += 1;
    return `${prefix}-${Date.now()}-${idRef.current}`;
  }
  function confirmClose() {
    if (recorderState.isRecording) {
      Alert.alert("正在录音", "请先停止或取消录音，再离开 Craft。");
      return;
    }
    if (
      previewUri ||
      manualTitle.trim() ||
      manualText.trim() ||
      sourceText.trim() ||
      targetText.trim()
    ) {
      Alert.alert("放弃未保存的内容？", "未保存的文稿、录音、改写结果和试听音频将被丢弃。", [
        { text: "继续编辑", style: "cancel" },
        { text: "放弃", style: "destructive", onPress: onClose },
      ]);
      return;
    }
    onClose();
  }
  async function toggleRecording() {
    setNotice(null);
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error("录音没有生成可用文件，请重试。");
        setRecordingUri(uri);
        await transcribeRecording(uri);
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("未获得麦克风权限，请在系统设置中授权后重试。");
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "录音暂时不可用。");
    }
  }
  async function transcribeRecording(uri: string) {
    setWorking("transcribe");
    try {
      const cues = await transcribeOpenAiCompatibleMedia({
        baseUrl: snapshot.settings.sttBaseUrl,
        mediaUri: uri,
        language: "zh",
      });
      const text = cues
        .map((cue) => cue.text)
        .join(" ")
        .trim();
      if (!text) throw new Error("转写没有返回可编辑的文字，请改用文字输入。");
      setSourceText(text);
      setNotice("已转写为原文。请确认内容后生成学习表达。");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "转写失败，请使用文字输入后继续。");
    } finally {
      setWorking(null);
    }
  }
  async function rewrite() {
    if (!sourceText.trim()) {
      setNotice("先说出或输入你的想法，再生成学习表达。");
      return;
    }
    setWorking("rewrite");
    setNotice(null);
    try {
      const response = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content:
              "You rewrite a learner's thought into idiomatic target-language practice text. Return only the rewritten text. Preserve the intended meaning. Follow the requested style without commentary.",
          }),
          Object.freeze({
            role: "user" as const,
            content: `Source language: ${SOURCE_LANGUAGE}\nTarget language: ${TARGET_LANGUAGE}\nStyle: ${style}\nOriginal thought:\n${sourceText.trim()}`,
          }),
        ]),
      });
      setTargetText(response.trim());
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "改写失败，请检查学习设置中的 AI 引擎后重试。",
      );
    } finally {
      setWorking(null);
    }
  }
  async function generateSpeech() {
    if (!targetText.trim()) {
      setNotice("请先生成或输入学习语言文本。");
      return;
    }
    setWorking("speech");
    setNotice(null);
    try {
      const uri = await synthesizeOpenAiCompatibleSpeech({
        baseUrl: snapshot.settings.ttsBaseUrl,
        text: targetText.trim(),
        voice,
        rate: snapshot.settings.ttsRate,
      });
      setPreviewUri(uri);
      setNotice("试听音频已生成。确认后可保存到资料库。 ");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "合成失败，请检查学习设置中的 TTS 服务后重试。",
      );
    } finally {
      setWorking(null);
    }
  }
  function preview() {
    if (!previewUri) return;
    if (previewStatus.playing) previewPlayer.pause();
    else previewPlayer.play();
  }
  function saveAndPractice(resetAfterSave = false) {
    if (!previewUri || !targetText.trim()) {
      setNotice("请先生成试听音频，再保存为学习材料。");
      return;
    }
    setWorking("save");
    try {
      const id = nextId("craft");
      const now = new Date().toISOString();
      const sentences = splitLearningSentences(targetText).map((text, index) =>
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
      );
      if (!sentences.length) throw new Error("学习文本中没有可练习的句子，请补充内容后再保存。");
      const resource: LearningResource = Object.freeze({
        id,
        title: targetText.trim().slice(0, 44),
        description: `Craft · ${style} · ${SOURCE_LANGUAGE} → ${TARGET_LANGUAGE}`,
        language: "en-US",
        source: "generated",
        provider: "craft",
        content: targetText.trim(),
        sentences: Object.freeze(sentences),
        mediaUri: previewUri,
        mediaKind: "audio",
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      });
      const savedSnapshot = Object.freeze({
        ...snapshot,
        resources: Object.freeze([resource, ...snapshot.resources]),
        ui: Object.freeze({
          ...snapshot.ui,
          ...(resetAfterSave
            ? {}
            : {
                section: "practice" as const,
                selectedResourceId: id,
                selectedSentenceId: sentences[0]?.id ?? null,
              }),
        }),
      });
      onChange(savedSnapshot);
      if (resetAfterSave) {
        setSourceText("");
        setTargetText("");
        setPreviewUri(null);
        setRecordingUri(null);
        setNotice("已保存到资料库。可以继续说下一条。 ");
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "保存 Craft 材料失败，请重试。");
    } finally {
      setWorking(null);
    }
  }

  function saveManualResource() {
    setNotice(null);
    setWorking("save");
    try {
      const resource = createManualLearningResource({
        id: nextId("manual"),
        title: manualTitle,
        content: manualText,
        now: new Date().toISOString(),
      });
      onChange(addManualLearningResourceToLibrary(snapshot, resource));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "保存手动资料失败，请重试。");
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="返回学习首页"
          accessibilityRole="button"
          onPress={confirmClose}
          style={styles.roundIcon}
        >
          <ArrowLeft color={theme.colors.text} size={21} />
        </Pressable>
        <Text style={styles.title}>Craft</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.segment}>
        {(["basic", "advanced"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === item }}
            onPress={() => setMode(item)}
            style={[styles.segmentItem, mode === item && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentLabel, mode === item && styles.segmentLabelActive]}>
              {item === "basic" ? "基础" : "高级"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {mode === "basic" ? (
          <>
            <Text style={styles.kicker}>手动创建</Text>
            <Text style={styles.intro}>粘贴或输入文稿，保存后直接成为资料库中的文本资料。</Text>
            <Text style={styles.fieldLabel}>资料标题（可选）</Text>
            <TextInput
              value={manualTitle}
              onChangeText={setManualTitle}
              placeholder="留空时使用文稿首行"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.titleInput}
            />
            <Text style={styles.fieldLabel}>文稿内容</Text>
            <TextInput
              multiline
              value={manualText}
              onChangeText={setManualText}
              placeholder="在这里输入或粘贴要学习的文稿…"
              placeholderTextColor={theme.colors.mutedText}
              style={[styles.input, styles.manualInput]}
              textAlignVertical="top"
            />
            <Pressable
              accessibilityRole="button"
              disabled={working !== null || !manualText.trim()}
              onPress={saveManualResource}
              style={[styles.primary, (working !== null || !manualText.trim()) && styles.disabled]}
            >
              {working === "save" ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Save color="#FFFFFF" size={18} />
              )}
              <Text style={styles.primaryText}>保存到资料</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>录音与 AI 创作</Text>
            <Text style={styles.intro}>
              说出或输入想法，改写成自然英语，再生成可跟读的音频资料。
            </Text>
            <View style={styles.captureCard}>
              <Text style={styles.captureLabel}>
                {recorderState.isRecording ? "正在录音" : "说出你的想法"}
              </Text>
              <Text style={styles.captureHint}>
                {recorderState.isRecording
                  ? `${Math.floor(recorderState.durationMillis / 1000)} 秒 · 点击停止并转写`
                  : "点击录音，用你最自然的方式表达。"}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void toggleRecording()}
                style={[styles.micButton, recorderState.isRecording && styles.micButtonActive]}
              >
                {recorderState.isRecording ? (
                  <Square color="#FFFFFF" fill="#FFFFFF" size={23} />
                ) : (
                  <Mic color="#FFFFFF" size={28} />
                )}
              </Pressable>
              {recordingUri ? (
                <Text style={styles.recordingHint}>已保留本次录音；可继续修改转写原文。</Text>
              ) : null}
            </View>
            <Text style={styles.fieldLabel}>你的原话</Text>
            <TextInput
              multiline
              value={sourceText}
              onChangeText={setSourceText}
              placeholder="输入文字也可以开始…"
              placeholderTextColor={theme.colors.mutedText}
              style={styles.input}
              textAlignVertical="top"
            />
            <View style={styles.styleRow}>
              {(["自然", "正式", "口语", "直译"] as StyleName[]).map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  onPress={() => setStyle(item)}
                  style={[styles.styleChip, style === item && styles.styleChipActive]}
                >
                  <Text style={[styles.styleLabel, style === item && styles.styleLabelActive]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={working !== null}
              onPress={() => void rewrite()}
              style={[styles.primary, working !== null && styles.disabled]}
            >
              {working === "rewrite" || working === "transcribe" ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <RefreshCcw color="#FFFFFF" size={18} />
              )}
              <Text style={styles.primaryText}>
                {working === "transcribe"
                  ? "正在转写"
                  : working === "rewrite"
                    ? "正在生成"
                    : targetText
                      ? "重新生成"
                      : "生成学习表达"}
              </Text>
            </Pressable>
            {targetText ? (
              <>
                <Text style={styles.fieldLabel}>学习语言文本</Text>
                <TextInput
                  multiline
                  value={targetText}
                  onChangeText={setTargetText}
                  placeholder="生成后的文本可以继续编辑"
                  placeholderTextColor={theme.colors.mutedText}
                  style={styles.input}
                  textAlignVertical="top"
                />
                <Text style={styles.fieldLabel}>声音</Text>
                <View style={styles.styleRow}>
                  {["alloy", "nova", "shimmer"].map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      onPress={() => setVoice(item)}
                      style={[styles.styleChip, voice === item && styles.styleChipActive]}
                    >
                      <Text style={[styles.styleLabel, voice === item && styles.styleLabelActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={working !== null}
                  onPress={() => void generateSpeech()}
                  style={[styles.secondary, working !== null && styles.disabled]}
                >
                  {working === "speech" ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Volume2 color={theme.colors.primary} size={18} />
                  )}
                  <Text style={styles.secondaryText}>
                    {previewUri ? "重新合成试听" : "生成试听"}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {previewUri ? (
              <View style={styles.previewCard}>
                <Pressable accessibilityRole="button" onPress={preview} style={styles.roundIcon}>
                  {previewStatus.playing ? (
                    <Pause color={theme.colors.text} size={19} fill={theme.colors.text} />
                  ) : (
                    <Play color={theme.colors.text} size={19} fill={theme.colors.text} />
                  )}
                </Pressable>
                <View style={styles.previewCopy}>
                  <Text style={styles.previewTitle}>试听已就绪</Text>
                  <Text style={styles.previewDescription}>
                    保存后会成为资料库中的 Craft 音频材料。
                  </Text>
                </View>
              </View>
            ) : null}
            {previewUri ? (
              <View style={styles.saveRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={working !== null}
                  onPress={() => saveAndPractice(false)}
                  style={[styles.primary, styles.savePrimary, working !== null && styles.disabled]}
                >
                  <Save color="#FFFFFF" size={18} />
                  <Text style={styles.primaryText}>保存并练习</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={working !== null}
                  onPress={() => saveAndPractice(true)}
                  style={[
                    styles.secondary,
                    styles.saveSecondary,
                    working !== null && styles.disabled,
                  ]}
                >
                  <Text style={styles.secondaryText}>保存后继续说</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
    },
    headerSpacer: { height: 44, width: 44 },
    title: { color: theme.colors.text, fontSize: 18, fontWeight: "600" },
    roundIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    segment: {
      alignSelf: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      flexDirection: "row",
      marginTop: theme.spacing.md,
      padding: 4,
      width: 210,
    },
    segmentItem: {
      alignItems: "center",
      borderRadius: theme.radius.full,
      flex: 1,
      justifyContent: "center",
      minHeight: 36,
    },
    segmentItemActive: { backgroundColor: theme.colors.canvas },
    segmentLabel: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "600" },
    segmentLabelActive: { color: theme.colors.text },
    content: { gap: theme.spacing.md, padding: theme.spacing.lg, paddingBottom: 56 },
    kicker: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1,
      marginTop: theme.spacing.sm,
    },
    intro: { color: theme.colors.mutedText, fontSize: 15, lineHeight: 22 },
    captureCard: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.lg,
      gap: theme.spacing.sm,
      padding: theme.spacing.xl,
    },
    captureLabel: { color: theme.colors.text, fontSize: 20, fontWeight: "600" },
    captureHint: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    micButton: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.full,
      height: 80,
      justifyContent: "center",
      marginTop: theme.spacing.sm,
      width: 80,
    },
    micButtonActive: { backgroundColor: theme.colors.error },
    recordingHint: { color: theme.colors.primary, fontSize: 12, marginTop: 2 },
    fieldLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600",
      marginTop: theme.spacing.xs,
    },
    input: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 120,
      padding: theme.spacing.md,
    },
    manualInput: { minHeight: 240 },
    titleInput: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      color: theme.colors.text,
      fontSize: 15,
      minHeight: 48,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    styleRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    styleChip: {
      alignItems: "center",
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: theme.spacing.md,
    },
    styleChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    styleLabel: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    styleLabelActive: { color: "#FFFFFF" },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.full,
      flexDirection: "row",
      gap: theme.spacing.sm,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: theme.spacing.lg,
    },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
    secondary: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      flexDirection: "row",
      gap: theme.spacing.sm,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: theme.spacing.lg,
    },
    secondaryText: { color: theme.colors.primary, fontSize: 14, fontWeight: "600" },
    disabled: { opacity: 0.45 },
    previewCard: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    previewCopy: { flex: 1, gap: theme.spacing.xs },
    previewTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    previewDescription: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    notice: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20, textAlign: "center" },
    saveRow: { gap: theme.spacing.sm },
    savePrimary: { flex: 1 },
    saveSecondary: { flex: 1 },
  });
}
