import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BookmarkPlus,
  Captions,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  Headphones,
  Mic,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Speech from "expo-speech";
import type { AppServices } from "../app/app-services";
import type { Theme } from "../app/theme";
import { createVocabularyCard, fingerprintText } from "./enjoy-player-domain";
import type {
  LearningResource,
  LearningSentence,
  LearningSnapshot,
  LearningTranscriptTrack,
} from "./learning-types";
import { lookupPhrase, lookupWord, type WordLookup } from "./word-lookup";
import { VideoPreview } from "./video-preview";
import { VideoLearningPlayer } from "./video-learning-player";
import { YoutubePreview } from "./youtube-preview";
import { addPracticeMinutes, persistLearningPosition, saveLearningItem } from "./learning-session";
import { useAudioPlayerSession } from "./presentation/player/use-audio-player-session";
import { TranscriptPanel } from "./presentation/transcript/transcript-panel";
import {
  buildSentenceAnalysisPrompt,
  parseStructuredSentenceAnalysis,
} from "./domain/analysis/sentence-analysis";
import { persistLearningMedia } from "./learning-media-files";
import { echoStatusCopy, initialEchoSession, reduceEchoSession } from "./domain/echo/echo-machine";
import { AssessmentCard } from "./assessment-card";
import { collectLearningResponse } from "./learning-ai";

type Props = Readonly<{
  services: AppServices;
  snapshot: LearningSnapshot;
  onChange: (snapshot: LearningSnapshot) => void;
  theme: Theme;
}>;

type WordSheetState = Readonly<{
  word: string;
  kind: "word" | "phrase";
  lookup: WordLookup | null;
  sentence: LearningSentence;
}>;

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function hasPlayableVideoResource(resource: LearningResource | null): boolean {
  return resource?.mediaKind === "video"
    ? Boolean(resource.mediaUri)
    : resource?.mediaKind === "youtube"
      ? Boolean(resource.sourceUrl)
      : false;
}

export function PracticeScreen({ services, snapshot, onChange, theme }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const resource =
    snapshot.resources.find((item) => item.id === snapshot.ui.selectedResourceId) ??
    snapshot.resources[0] ??
    null;
  const resourceTracks = snapshot.transcriptTracks.filter(
    (item) => item.resourceId === resource?.id,
  );
  const activeTrack =
    resourceTracks.find((item) => item.id === snapshot.ui.activeTranscriptTrackId) ??
    resourceTracks.find((item) => item.isPrimary) ??
    null;
  const activeSentences = activeTrack?.sentences ?? resource?.sentences ?? [];
  const sentence =
    activeSentences.find((item) => item.id === snapshot.ui.selectedSentenceId) ??
    activeSentences[0] ??
    null;
  const player = useAudioPlayer(null);
  const [contextExplanation, setContextExplanation] = useState<string | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followPlaybackPositionRef = useRef<(positionMs: number) => void>(() => {});
  const isMountedRef = useRef(true);
  const playbackIdRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const repeatRef = useRef(repeat);
  const audioLoopRestartingRef = useRef(false);
  const videoLoopRestartingRef = useRef(false);
  const videoResourceIdRef = useRef<string | null>(null);
  const lastVideoProgressPositionRef = useRef<number | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const echoRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const echoRecorderState = useAudioRecorderState(echoRecorder, 250);
  const echoReplayPlayer = useAudioPlayer(null);
  const [echoSession, setEchoSession] = useState(initialEchoSession);
  const echoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoPositionMs, setVideoPositionMs] = useState<number | null>(null);
  const [videoCurrentPositionMs, setVideoCurrentPositionMs] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [wordSheet, setWordSheet] = useState<WordSheetState | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [trackSheetVisible, setTrackSheetVisible] = useState(false);
  const audioSession = useAudioPlayerSession({
    player,
    source:
      resource?.mediaKind === "audio" && resource.mediaUri
        ? Object.freeze({
            mediaId: resource.id,
            uri: resource.mediaUri,
            cues: activeSentences,
            restoredPositionMs: resource.lastPositionMs ?? 0,
          })
        : null,
    onProgress: async ({ mediaId, positionMs, playedDeltaMs }) => {
      const currentResource = snapshot.resources.find((item) => item.id === mediaId);
      const currentSentences =
        snapshot.transcriptTracks.find(
          (track) =>
            track.id === snapshot.ui.activeTranscriptTrackId && track.resourceId === mediaId,
        )?.sentences ??
        currentResource?.sentences ??
        [];
      const currentSentence =
        currentSentences.find(
          (item) =>
            item.startMs !== null &&
            item.startMs <= positionMs &&
            (item.endMs === null || positionMs < item.endMs),
        ) ??
        currentSentences.find((item) => item.id === snapshot.ui.selectedSentenceId) ??
        currentSentences[0];
      if (!currentResource || !currentSentence) return;
      const withPosition = persistLearningPosition(snapshot, {
        resource: currentResource,
        sentence: currentSentence,
        positionMs,
        listened: playedDeltaMs > 0,
      });
      persist(addPracticeMinutes(withPosition, playedDeltaMs));
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      playbackIdRef.current += 1;
      if (clipTimer.current) {
        clearTimeout(clipTimer.current);
        clipTimer.current = null;
      }
      if (echoTimerRef.current) {
        clearTimeout(echoTimerRef.current);
        echoTimerRef.current = null;
      }
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    if (resource === null || hasPlayableVideoResource(resource) === false) {
      videoResourceIdRef.current = null;
      return;
    }
    if (videoResourceIdRef.current === resource.id) return;
    videoResourceIdRef.current = resource.id;
    const restoredPositionMs = resource.lastPositionMs ?? 0;
    setVideoPositionMs(restoredPositionMs);
    setVideoCurrentPositionMs(restoredPositionMs);
    setVideoPlaying(false);
    videoLoopRestartingRef.current = false;
    lastVideoProgressPositionRef.current = null;
  }, [resource]);

  function persist(next: LearningSnapshot) {
    onChange(next);
  }

  function selectSentence(sentenceId: string, userInitiated = true) {
    if (!resource) return;
    const target = activeSentences.find((item) => item.id === sentenceId);
    if (userInitiated) {
      if (hasPlayableVideoResource(resource)) {
        setVideoPositionMs(target?.startMs ?? 0);
        setVideoPlaying(false);
      }
      stopPlayback();
    }
    const now = new Date().toISOString();
    persist(
      Object.freeze({
        ...snapshot,
        practice: Object.freeze(
          snapshot.practice.map((entry) =>
            Object.freeze({ ...entry, selected: entry.sentenceId === sentenceId, updatedAt: now }),
          ),
        ),
        ui: Object.freeze({
          ...snapshot.ui,
          selectedResourceId: resource.id,
          selectedSentenceId: sentenceId,
        }),
      }),
    );
  }

  function stopPlayback() {
    playbackIdRef.current += 1;
    if (clipTimer.current) {
      clearTimeout(clipTimer.current);
      clipTimer.current = null;
    }
    if (!isMountedRef.current) return;
    if (resource?.mediaKind === "audio" && resource.mediaUri) void audioSession.pause();
    Speech.stop();
    setIsSpeaking(false);
  }

  async function playSentence() {
    if (!resource || !sentence || !isMountedRef.current) return;
    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    setNotice(null);
    if (hasPlayableVideoResource(resource)) {
      if (videoPlaying) {
        setVideoPlaying(false);
      } else {
        const startMs = sentence.startMs ?? 0;
        setVideoPositionMs(startMs);
        setVideoCurrentPositionMs(startMs);
        setVideoPlaying(true);
      }
      return;
    }
    const canPlayMedia = Boolean(resource.mediaUri && resource.mediaKind === "audio");
    if (canPlayMedia) {
      if (audioSession.state.status === "playing") {
        await audioSession.pause();
      } else {
        await audioSession.selectCue(sentence);
        await audioSession.play();
      }
      return;
    }
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    Speech.speak(sentence.text, {
      ...(resource.language.toLowerCase().startsWith("en") ? { language: "en-US" } : {}),
      rate: 0.9,
      onDone: () => {
        if (!isMountedRef.current || playbackIdRef.current !== playbackId) return;
        setIsSpeaking(false);
        markListened(resource, sentence, sentence.endMs ?? sentence.startMs ?? 0);
      },
      onStopped: () => {
        if (isMountedRef.current && playbackIdRef.current === playbackId) setIsSpeaking(false);
      },
      onError: () => {
        if (!isMountedRef.current || playbackIdRef.current !== playbackId) return;
        setIsSpeaking(false);
        setNotice("系统朗读暂时不可用，请检查设备语音设置后重试。");
      },
    });
  }

  function markListened(
    activeResource: LearningResource,
    activeSentence: LearningSentence,
    positionMs: number,
  ) {
    persist(
      persistLearningPosition(snapshot, {
        resource: activeResource,
        sentence: activeSentence,
        positionMs,
        listened: true,
      }),
    );
  }

  async function openWord(word: string) {
    if (!sentence) return;
    setLookingUp(true);
    setWordSheet(Object.freeze({ word, kind: "word", lookup: null, sentence }));
    try {
      const lookup = await lookupWord(word);
      setWordSheet(Object.freeze({ word, kind: "word", lookup, sentence }));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "查词暂时不可用。");
      setWordSheet(null);
    } finally {
      setLookingUp(false);
    }
  }
  async function openPhrase(phrase: string) {
    if (sentence === null) return;
    setLookingUp(true);
    setWordSheet(Object.freeze({ word: phrase, kind: "phrase", lookup: null, sentence }));
    try {
      const lookup = await lookupPhrase(phrase);
      setWordSheet(Object.freeze({ word: phrase, kind: "phrase", lookup, sentence }));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "短语详情暂时不可用。 ");
      setWordSheet(null);
    } finally {
      setLookingUp(false);
    }
  }

  function updateEcho(event: Parameters<typeof reduceEchoSession>[1]) {
    setEchoSession((current) => reduceEchoSession(current, event));
  }

  function echoDurationMs() {
    if (!sentence) return 1_500;
    if (sentence.startMs !== null && sentence.endMs !== null) {
      return Math.max(500, sentence.endMs - sentence.startMs);
    }
    return 2_000;
  }

  async function playOriginalForEcho() {
    if (!resource || !sentence) return;
    updateEcho({ type: "begin", cueId: sentence.id });
    stopPlayback();
    const finish = () => {
      if (!isMountedRef.current) return;
      if (resource.mediaKind === "audio") {
        void audioSession.pause();
        void audioSession.selectCue(sentence);
      }
      if (hasPlayableVideoResource(resource)) {
        setVideoPlaying(false);
        setVideoPositionMs(sentence.startMs ?? 0);
      }
      updateEcho({ type: "originalFinished" });
    };
    if (resource.mediaKind === "audio" && resource.mediaUri) {
      await audioSession.selectCue(sentence);
      await audioSession.play();
      echoTimerRef.current = setTimeout(finish, echoDurationMs());
      return;
    }
    if (hasPlayableVideoResource(resource)) {
      setVideoPositionMs(sentence.startMs ?? 0);
      setVideoPlaying(true);
      echoTimerRef.current = setTimeout(finish, echoDurationMs());
      return;
    }
    Speech.speak(sentence.text, {
      ...(resource.language.toLowerCase().startsWith("en") ? { language: "en-US" } : {}),
      rate: 0.9,
      onDone: finish,
      onError: () => updateEcho({ type: "failed", message: "原音试听暂时不可用。" }),
    });
  }

  async function startEchoRecording() {
    if (!resource || !sentence) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("未获得麦克风权限。");
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await echoRecorder.prepareToRecordAsync();
      echoRecorder.record();
      updateEcho({ type: "recordStart" });
    } catch (reason) {
      updateEcho({
        type: "failed",
        message: reason instanceof Error ? reason.message : "跟读录音暂时不可用。",
      });
    }
  }

  async function stopEchoRecording() {
    if (!resource || !sentence) return;
    try {
      await echoRecorder.stop();
      const uri = echoRecorder.uri;
      if (!uri) throw new Error("未生成可用的跟读录音。");
      const now = new Date().toISOString();
      const recording = Object.freeze({
        id: `echo-${fingerprintText(`${sentence.id}|${now}`)}`,
        sentenceId: sentence.id,
        uri: await persistLearningMedia({ uri, name: "echo-recording.m4a" }),
        durationMs: echoRecorderState.durationMillis,
        transcript: null,
        state: "ready" as const,
        createdAt: now,
      });
      const withPosition = persistLearningPosition(snapshot, {
        resource,
        sentence,
        positionMs: sentence.startMs ?? 0,
        shadowed: true,
      });
      persist(
        Object.freeze({
          ...withPosition,
          recordings: Object.freeze([recording, ...withPosition.recordings]),
        }),
      );
      updateEcho({ type: "recordSaved", recordingId: recording.id });
      setNotice("跟读已保存。你可以回放自己的录音，或重录一次。");
    } catch (reason) {
      updateEcho({
        type: "failed",
        message: reason instanceof Error ? reason.message : "跟读录音暂时不可用。",
      });
    }
  }

  async function replayEchoRecording() {
    const recording = latestEchoRecording;
    if (!recording) return;
    try {
      updateEcho({ type: "replayStart" });
      echoReplayPlayer.replace(recording.uri);
      echoReplayPlayer.play();
      echoTimerRef.current = setTimeout(
        () => {
          if (!isMountedRef.current) return;
          // The replay naturally finishes at the recorded duration. Avoid a
          // second native pause bridge call that can race component unmount.
          updateEcho({ type: "replayFinished" });
        },
        Math.max(500, recording.durationMs),
      );
    } catch (reason) {
      updateEcho({
        type: "failed",
        message: reason instanceof Error ? reason.message : "录音回放暂时不可用。",
      });
    }
  }

  async function handleEchoAction() {
    if (echoSession.state === "recording") return stopEchoRecording();
    if (echoSession.state === "readyToRecord") return startEchoRecording();
    if (echoSession.state === "recorded" || echoSession.state === "completed")
      return replayEchoRecording();
    return playOriginalForEcho();
  }

  function retryEcho() {
    updateEcho({ type: "retry" });
  }

  function deleteLatestEchoRecording() {
    if (!latestEchoRecording) return;
    persist(
      Object.freeze({
        ...snapshot,
        recordings: Object.freeze(
          snapshot.recordings.filter((item) => item.id !== latestEchoRecording.id),
        ),
      }),
    );
    updateEcho({ type: "dismiss" });
    setNotice("已删除这条跟读录音。");
  }

  async function loadSentenceAnalysis() {
    if (!resource || !sentence || analysisBusy) return;
    const sourceHash = fingerprintText(sentence.text);
    const cached = snapshot.analyses.find(
      (item) =>
        item.sentenceId === sentence.id && item.sourceHash === sourceHash && item.state === "ready",
    );
    if (cached) {
      setAnalysisVisible(true);
      return;
    }
    setAnalysisBusy(true);
    try {
      const content = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content:
              "You are a careful language-learning analyst. Follow the requested JSON schema exactly.",
          }),
          Object.freeze({
            role: "user" as const,
            content: buildSentenceAnalysisPrompt({
              sentence: sentence.text,
              translation: sentence.translation,
              previousSentence:
                activeSentences.find((item) => item.order === sentence.order - 1)?.text ?? null,
              nextSentence:
                activeSentences.find((item) => item.order === sentence.order + 1)?.text ?? null,
              targetLanguage: snapshot.settings.translationTargetLanguage,
            }),
          }),
        ]),
      });
      const parsed = parseStructuredSentenceAnalysis(content);
      if (!parsed.ok) throw new Error(`分析结果校验失败：${parsed.error}`);
      const analysis = Object.freeze({
        id: "analysis-" + sentence.id + "-" + sourceHash,
        resourceId: resource.id,
        sentenceId: sentence.id,
        sourceHash,
        version: "2",
        state: "ready" as const,
        sentencePatterns: Object.freeze(
          parsed.value.sentencePatterns.map((item) => `${item.title}：${item.explanation}`),
        ),
        keyPhrases: Object.freeze(
          parsed.value.keyPhrases.map((item) =>
            Object.freeze({
              phrase: item.phrase,
              translation: item.translation,
              explanation: item.cefr ? `${item.explanation}（${item.cefr}）` : item.explanation,
              category: item.category,
            }),
          ),
        ),
        grammarPoints: Object.freeze(
          parsed.value.grammarPoints.map((item) => `${item.title}：${item.explanation}`),
        ),
        contextualExplanation: parsed.value.contextualExplanation,
        error: null,
        updatedAt: new Date().toISOString(),
      });
      persist(
        Object.freeze({
          ...snapshot,
          analyses: Object.freeze([
            ...snapshot.analyses.filter((item) => item.sentenceId !== sentence.id),
            analysis,
          ]),
        }),
      );
      setAnalysisVisible(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "句子分析暂时不可用。");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function loadContextExplanation() {
    if (!wordSheet || !resource || contextBusy) return;
    setContextBusy(true);
    setContextExplanation(null);
    try {
      const response = await collectLearningResponse({
        services,
        providerProfileId: snapshot.settings.selectedProviderProfileId,
        messages: Object.freeze([
          Object.freeze({
            role: "system" as const,
            content:
              "Explain the selected word or phrase in this exact sentence for a Chinese learner. Explain the contextual sense, collocation, tone, and why this sense fits. Be concise and write Simplified Chinese.",
          }),
          Object.freeze({
            role: "user" as const,
            content: `Term: ${wordSheet.word}\nSentence: ${wordSheet.sentence.text}\nTranslation: ${wordSheet.sentence.translation ?? ""}`,
          }),
        ]),
      });
      setContextExplanation(response.trim());
    } catch (reason) {
      setContextExplanation(reason instanceof Error ? reason.message : "语境解释暂时不可用。 ");
    } finally {
      setContextBusy(false);
    }
  }

  function saveWord() {
    if (!wordSheet?.lookup || !resource) return;
    const alreadySaved = snapshot.vocabulary.some(
      (card) => card.term.toLowerCase() === wordSheet.word.toLowerCase(),
    );
    const card = createVocabularyCard({
      id: `phrase-${fingerprintText(wordSheet.word.toLowerCase())}`,
      term: wordSheet.word,
      definition: wordSheet.lookup.definitions[0]?.definition ?? "待补充释义",
      context: wordSheet.sentence.text,
      sourceResourceId: resource.id,
      now: new Date().toISOString(),
    });
    const withVocabulary = Object.freeze({
      ...snapshot,
      vocabulary: alreadySaved
        ? snapshot.vocabulary
        : Object.freeze([card, ...snapshot.vocabulary]),
    });
    persist(
      saveLearningItem(withVocabulary, {
        kind: wordSheet.kind,
        term: wordSheet.word,
        translation: wordSheet.lookup.definitions[0]?.definition ?? null,
        explanation: contextExplanation,
        mediaId: resource.id,
        mediaTitle: resource.title,
        cueId: wordSheet.sentence.id,
        timestampMs: wordSheet.sentence.startMs,
        originalSentence: wordSheet.sentence.text,
      }),
    );
    setNotice(`已收下“${wordSheet.word}”，它会带着这句语境进入复习。`);
    setWordSheet(null);
  }

  function selectTranscriptTrack(track: LearningTranscriptTrack) {
    if (!resource || track.sentences.length === 0) return;
    const nextSentence = track.sentences[0]!;
    stopPlayback();
    persist(
      Object.freeze({
        ...snapshot,
        ui: Object.freeze({
          ...snapshot.ui,
          activeTranscriptTrackId: track.id,
          selectedSentenceId: nextSentence.id,
        }),
      }),
    );
    setTrackSheetVisible(false);
    setNotice(`已切换至${track.label}。`);
  }

  function restartAudioSentenceLoop() {
    if (!sentence || audioLoopRestartingRef.current) return;
    audioLoopRestartingRef.current = true;
    void (async () => {
      try {
        await audioSession.pause();
        await audioSession.selectCue(sentence);
        if (isMountedRef.current && repeatRef.current) await audioSession.play();
      } finally {
        audioLoopRestartingRef.current = false;
      }
    })();
  }

  function restartVideoSentenceLoop(activeSentence: LearningSentence) {
    if (videoLoopRestartingRef.current) return;
    videoLoopRestartingRef.current = true;
    const startMs = activeSentence.startMs ?? 0;
    setVideoPlaying(false);
    setVideoPositionMs(startMs);
    setVideoCurrentPositionMs(startMs);
    clipTimer.current = setTimeout(() => {
      videoLoopRestartingRef.current = false;
      if (isMountedRef.current && repeatRef.current) setVideoPlaying(true);
    }, 80);
  }

  function persistVideoProgress(positionMs: number, activeSentence: LearningSentence) {
    if (resource === null) return;
    const lastPositionMs = lastVideoProgressPositionRef.current;
    if (lastPositionMs !== null && Math.abs(positionMs - lastPositionMs) < 2_000) return;
    lastVideoProgressPositionRef.current = positionMs;
    persist(
      persistLearningPosition(snapshot, {
        resource,
        sentence: activeSentence,
        positionMs,
        listened: positionMs > (activeSentence.startMs ?? 0),
      }),
    );
  }

  function seekPlaybackTo(positionMs: number) {
    if (resource === null) return;
    const boundedPositionMs = Math.max(0, Math.round(positionMs));
    if (resource.mediaKind === "audio" && resource.mediaUri) {
      void audioSession.seekTo(boundedPositionMs);
      return;
    }
    if (hasPlayableVideoResource(resource)) {
      setVideoPositionMs(boundedPositionMs);
      setVideoCurrentPositionMs(boundedPositionMs);
    }
  }

  function cyclePlaybackRate() {
    const currentRate =
      resource?.mediaKind === "audio" ? audioSession.state.playbackRate : videoPlaybackRate;
    const currentIndex = PLAYBACK_RATES.indexOf(currentRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] ?? 1;
    if (resource?.mediaKind === "audio" && resource.mediaUri) {
      void audioSession.setPlaybackRate(nextRate);
      return;
    }
    if (hasPlayableVideoResource(resource)) setVideoPlaybackRate(nextRate);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- callback intentionally closes over the current session snapshot.
  function followPlaybackPosition(positionMs: number) {
    if (resource === null) return;
    if (hasPlayableVideoResource(resource)) {
      setVideoCurrentPositionMs(positionMs);
      const selectedSentence = activeSentences.find(
        (item) => item.id === snapshot.ui.selectedSentenceId,
      );
      if (
        repeatRef.current &&
        selectedSentence?.endMs !== null &&
        selectedSentence?.endMs !== undefined &&
        positionMs >= selectedSentence.endMs
      ) {
        persistVideoProgress(positionMs, selectedSentence);
        markListened(resource, selectedSentence, selectedSentence.endMs);
        restartVideoSentenceLoop(selectedSentence);
        return;
      }
    }
    const matchingSentence = activeSentences.find(
      (item) =>
        item.startMs !== null &&
        positionMs >= item.startMs &&
        (item.endMs === null || positionMs < item.endMs),
    );
    if (matchingSentence && hasPlayableVideoResource(resource))
      persistVideoProgress(positionMs, matchingSentence);
    if (matchingSentence && matchingSentence.id !== snapshot.ui.selectedSentenceId) {
      selectSentence(matchingSentence.id, false);
    }
  }
  useEffect(() => {
    followPlaybackPositionRef.current = followPlaybackPosition;
  }, [followPlaybackPosition]);
  useEffect(() => {
    if (!resource || resource.mediaKind !== "audio" || audioSession.state.status !== "playing")
      return;
    followPlaybackPositionRef.current(audioSession.state.positionMs);
  }, [audioSession.state.positionMs, audioSession.state.status, resource]);
  useEffect(() => {
    if (
      repeat === false ||
      resource === null ||
      resource.mediaKind !== "audio" ||
      resource.mediaUri === undefined ||
      sentence === null ||
      sentence.endMs === null ||
      audioSession.state.status !== "playing" ||
      audioSession.state.positionMs < sentence.endMs
    )
      return;
    markListened(resource, sentence, sentence.endMs);
    restartAudioSentenceLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- looping helpers intentionally use the active cue closure.
  }, [audioSession.state.positionMs, audioSession.state.status, repeat, resource, sentence]);

  const transcriptTracks = resourceTracks;

  function selectTranscriptCue(target: Readonly<{ id: string }>) {
    const fullCue = activeSentences.find((item) => item.id === target.id);
    if (!fullCue) return;
    selectSentence(fullCue.id);
    if (resource?.mediaKind === "audio") void audioSession.selectCue(fullCue);
  }

  function selectAdjacent(offset: number) {
    if (!resource || !sentence) return;
    const target = activeSentences.find((item) => item.order === sentence.order + offset);
    if (target) selectSentence(target.id);
  }

  if (!resource || !sentence) {
    return (
      <View style={styles.empty}>
        <Headphones color={theme.colors.accent} size={34} />
        <Text style={styles.emptyTitle}>先放进一段你愿意反复听的内容。</Text>
        <Text style={styles.emptyCopy}>
          语料进入后会自动切成一句一句，之后所有听读、点词与复习都从这里开始。
        </Text>
      </View>
    );
  }

  const playedCount = snapshot.practice.filter(
    (item) => item.resourceId === resource.id && item.listened,
  ).length;
  const hasTimedMedia = Boolean(
    sentence.startMs !== null &&
    (hasPlayableVideoResource(resource) || (resource.mediaKind === "audio" && resource.mediaUri)),
  );
  const playing = audioSession.state.status === "playing" || videoPlaying || isSpeaking;
  const playbackPositionMs =
    resource.mediaKind === "audio" ? audioSession.state.positionMs : videoCurrentPositionMs;
  const playbackDurationMs =
    resource.mediaKind === "audio" ? audioSession.state.durationMs : (resource.durationMs ?? null);
  const playbackRate =
    resource.mediaKind === "audio" ? audioSession.state.playbackRate : videoPlaybackRate;
  if (hasPlayableVideoResource(resource)) {
    return (
      <VideoLearningPlayer
        resource={resource}
        sentences={activeSentences}
        selectedSentence={sentence}
        theme={theme}
        positionMs={playbackPositionMs}
        durationMs={playbackDurationMs}
        playing={playing}
        playbackRate={playbackRate}
        repeat={repeat}
        showTranslation={showTranslation}
        onSelectSentence={(sentenceId) => selectTranscriptCue({ id: sentenceId })}
        onTogglePlayback={() => void playSentence()}
        onPrevious={() => selectAdjacent(-1)}
        onNext={() => selectAdjacent(1)}
        onSeek={seekPlaybackTo}
        onCycleRate={cyclePlaybackRate}
        onToggleRepeat={() => setRepeat((value) => !value)}
        onToggleTranslation={() => setShowTranslation((value) => !value)}
        onOpenFocus={() => setImmersive(true)}
        onPositionMsChange={followPlaybackPosition}
      />
    );
  }
  const playbackProgress =
    playbackDurationMs === null || playbackDurationMs <= 0
      ? 0
      : Math.min(100, Math.max(0, (playbackPositionMs / playbackDurationMs) * 100));
  const currentAnalysis =
    snapshot.analyses.find(
      (item) =>
        item.sentenceId === sentence.id &&
        item.sourceHash === fingerprintText(sentence.text) &&
        item.state === "ready",
    ) ?? null;
  const echoRecordings = snapshot.recordings
    .filter((item) => item.sentenceId === sentence.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestEchoRecording = echoRecordings[0] ?? null;
  const echoElapsedSeconds = Math.floor(echoRecorderState.durationMillis / 1000);
  const echoElapsedLabel = `${String(Math.floor(echoElapsedSeconds / 60)).padStart(2, "0")}:${String(echoElapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
    >
      {hasPlayableVideoResource(resource) ? (
        <View style={styles.mediaPreview}>
          {resource.mediaKind === "youtube" && resource.sourceUrl ? (
            <YoutubePreview
              sourceUrl={resource.sourceUrl}
              positionMs={videoPositionMs}
              playing={videoPlaying}
              playbackRate={videoPlaybackRate}
              onPositionMsChange={followPlaybackPosition}
            />
          ) : resource.mediaUri ? (
            <VideoPreview
              uri={resource.mediaUri}
              positionMs={videoPositionMs}
              playing={videoPlaying}
              playbackRate={videoPlaybackRate}
              onPositionMsChange={followPlaybackPosition}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.mediaStage}>
        <View style={styles.stageTopline}>
          <Text style={styles.stageLabel}>{hasTimedMedia ? "同步字幕" : "逐句朗读"}</Text>
          <Text style={styles.stageTime}>
            {hasTimedMedia ? formatTime(sentence.startMs) : "设备语音"}
          </Text>
        </View>
        <Text style={styles.stageOrder}>{String(sentence.order).padStart(2, "0")}</Text>
        <InteractiveSentence
          text={sentence.text}
          styles={styles}
          onWordPress={(word) => void openWord(word)}
        />
        {showTranslation ? (
          <Text style={styles.translation}>
            {sentence.translation ?? "这句还没有译文。你可以在语料页按需生成翻译。"}
          </Text>
        ) : (
          <Text style={styles.translationHint}>
            点一下 CC 显示译文；点英文单词查看它在这句里的意思。
          </Text>
        )}
      </View>

      <View style={styles.transport}>
        <Pressable
          accessibilityLabel="上一句"
          accessibilityRole="button"
          disabled={sentence.order === 1}
          onPress={() => selectAdjacent(-1)}
          style={({ pressed }) => [
            styles.transportButton,
            sentence.order === 1 && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <ChevronLeft color={theme.colors.text} size={21} />
        </Pressable>
        <Pressable
          accessibilityLabel={playing ? "暂停" : "播放这一句"}
          accessibilityRole="button"
          onPress={() => void playSentence()}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          {playing ? (
            <Pause color={theme.colors.canvas} fill={theme.colors.canvas} size={26} />
          ) : (
            <Play color={theme.colors.canvas} fill={theme.colors.canvas} size={26} />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel="下一句"
          accessibilityRole="button"
          disabled={sentence.order === activeSentences.length}
          onPress={() => selectAdjacent(1)}
          style={({ pressed }) => [
            styles.transportButton,
            sentence.order === activeSentences.length && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <ChevronRight color={theme.colors.text} size={21} />
        </Pressable>
      </View>

      {hasTimedMedia ? (
        <View style={styles.playbackControls}>
          <Pressable
            accessibilityLabel="跳转播放进度"
            accessibilityRole="button"
            onLayout={(event) => setProgressTrackWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              if (progressTrackWidth === 0 || playbackDurationMs === null) return;
              void seekPlaybackTo(
                (event.nativeEvent.locationX / progressTrackWidth) * playbackDurationMs,
              );
            }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${playbackProgress}%` }]} />
          </Pressable>
          <View style={styles.playbackMeta}>
            <Text style={styles.playbackTime}>
              {formatTime(playbackPositionMs)} /{" "}
              {playbackDurationMs === null ? "—:—" : formatTime(playbackDurationMs)}
            </Text>
            <Pressable
              accessibilityLabel={`播放速度 ${playbackRate} 倍，点按切换`}
              accessibilityRole="button"
              onPress={cyclePlaybackRate}
              style={styles.rateChip}
            >
              <Text style={styles.rateText}>{playbackRate}×</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.utilityBar}>
        <ToolButton
          label="单句循环"
          selected={repeat}
          icon={Repeat2}
          onPress={() => setRepeat((value) => !value)}
          styles={styles}
          theme={theme}
        />
        <ToolButton
          label={showTranslation ? "隐藏译文" : "显示译文"}
          selected={showTranslation}
          icon={Captions}
          onPress={() => setShowTranslation((value) => !value)}
          styles={styles}
          theme={theme}
        />
        <ToolButton
          label="专注听力"
          icon={Focus}
          onPress={() => setImmersive(true)}
          styles={styles}
          theme={theme}
        />
        <ToolButton
          label={analysisBusy ? "分析中" : "句子分析"}
          selected={analysisVisible}
          icon={Focus}
          onPress={() => void loadSentenceAnalysis()}
          styles={styles}
          theme={theme}
        />
        <ToolButton
          label={
            echoSession.state === "recording"
              ? "结束录音"
              : echoSession.state === "readyToRecord"
                ? "开始录音"
                : echoSession.state === "recorded"
                  ? "回放跟读"
                  : "Echo 跟读"
          }
          selected={echoSession.state === "recording"}
          icon={Mic}
          onPress={() => void handleEchoAction()}
          styles={styles}
          theme={theme}
        />
      </View>
      {echoSession.state === "recording" ? (
        <View style={styles.echoLiveCard}>
          <View style={styles.echoPulse} />
          <View style={styles.echoLiveCopy}>
            <Text style={styles.echoLiveTitle}>正在收录你的跟读</Text>
            <Text style={styles.echoLiveMeta}>{echoElapsedLabel} · 再读一遍完整句子后点击结束</Text>
          </View>
          <Mic color={theme.colors.accent} size={19} />
        </View>
      ) : null}
      {latestEchoRecording ? (
        <>
          <AssessmentCard recording={latestEchoRecording} theme={theme} />
          <View style={styles.echoActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void replayEchoRecording()}
              style={styles.echoActionPill}
            >
              <Play color={theme.colors.accent} size={15} />
              <Text style={styles.echoActionText}>回放我的录音</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={retryEcho} style={styles.echoActionPill}>
              <RotateCcw color={theme.colors.accent} size={15} />
              <Text style={styles.echoActionText}>重录</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={deleteLatestEchoRecording}
              style={styles.echoActionPill}
            >
              <Trash2 color={theme.colors.accent} size={15} />
              <Text style={styles.echoActionText}>删除</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {echoSession.state !== "idle" ? (
        <Text style={styles.echoStatus}>{echoStatusCopy(echoSession)}</Text>
      ) : null}
      {echoRecordings.length > 0 ? (
        <View style={styles.echoHistory}>
          <View style={styles.echoHistoryHeader}>
            <Text style={styles.echoHistoryTitle}>本句跟读</Text>
            <Text style={styles.echoHistoryCount}>{echoRecordings.length} 次记录</Text>
          </View>
          {echoRecordings.slice(0, 3).map((recording, index) => (
            <View key={recording.id} style={styles.echoHistoryRow}>
              <View style={styles.echoHistoryIcon}>
                <Mic color={theme.colors.accent} size={14} />
              </View>
              <Text style={styles.echoHistoryText}>第 {echoRecordings.length - index} 次跟读</Text>
              <Text style={styles.echoHistoryMeta}>
                {Math.max(0, Math.round(recording.durationMs / 1000))} 秒 ·{" "}
                {recording.createdAt.slice(11, 16)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {analysisVisible && currentAnalysis ? (
        <View style={styles.analysisCard}>
          <Text style={styles.analysisTitle}>句子分析</Text>
          {currentAnalysis.sentencePatterns.length ? (
            <>
              <Text style={styles.analysisSection}>句型结构</Text>
              {currentAnalysis.sentencePatterns.map((item) => (
                <Text key={item} style={styles.analysisCopy}>
                  • {item}
                </Text>
              ))}
            </>
          ) : null}
          {currentAnalysis.keyPhrases.length ? (
            <>
              <Text style={styles.analysisSection}>重点短语</Text>
              {currentAnalysis.keyPhrases.map((item) => (
                <Pressable
                  key={item.phrase}
                  accessibilityRole="button"
                  onPress={() => void openPhrase(item.phrase)}
                  style={styles.analysisPhrase}
                >
                  <Text style={styles.analysisPhraseTitle}>
                    {item.phrase} · {item.translation}
                  </Text>
                  <Text style={styles.analysisCopy}>{item.explanation}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
          {currentAnalysis.grammarPoints.length ? (
            <>
              <Text style={styles.analysisSection}>语法要点</Text>
              {currentAnalysis.grammarPoints.map((item) => (
                <Text key={item} style={styles.analysisCopy}>
                  • {item}
                </Text>
              ))}
            </>
          ) : null}
          {currentAnalysis.contextualExplanation ? (
            <>
              <Text style={styles.analysisSection}>语境说明</Text>
              <Text style={styles.analysisCopy}>{currentAnalysis.contextualExplanation}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Pressable accessibilityRole="button" onPress={() => setNotice(null)} style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
          <X color={theme.colors.mutedText} size={16} />
        </Pressable>
      ) : null}

      <View style={styles.trajectoryHeader}>
        <View>
          <Text style={styles.trajectoryTitle}>字幕轨道</Text>
          <Text style={styles.trajectoryMeta}>已听 {playedCount} 句 · 点任一句跳转</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTrackSheetVisible(true)}
          style={styles.trackPill}
        >
          <Captions color={theme.colors.accent} size={14} />
          <Text numberOfLines={1} style={styles.trackPillText}>
            {activeTrack?.label ?? "主字幕"}
          </Text>
          <ChevronRight color={theme.colors.accent} size={14} />
        </Pressable>
      </View>
      <TranscriptPanel
        cues={activeSentences}
        activeCueId={sentence.id}
        followTranscript={audioSession.state.followTranscript}
        showOriginal
        showTranslation={showTranslation}
        onFollowChange={audioSession.setFollowTranscript}
        onCuePress={selectTranscriptCue}
        theme={theme}
      />
      <ImmersiveListening
        key={`${sentence.id}-${immersive ? "open" : "closed"}`}
        visible={immersive}
        playing={playing}
        sentence={sentence}
        onClose={() => setImmersive(false)}
        onNext={() => selectAdjacent(1)}
        onPlay={() => void playSentence()}
        onPrevious={() => selectAdjacent(-1)}
        onToggleRepeat={() => setRepeat((value) => !value)}
        repeat={repeat}
        styles={styles}
        theme={theme}
      />

      <Modal
        transparent
        animationType="fade"
        visible={trackSheetVisible}
        onRequestClose={() => setTrackSheetVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTrackSheetVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.wordSheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>字幕轨道</Text>
                <Text style={styles.word}>选择学习语言</Text>
              </View>
              <Pressable
                accessibilityLabel="关闭字幕轨道选择"
                accessibilityRole="button"
                onPress={() => setTrackSheetVisible(false)}
                style={styles.closeButton}
              >
                <X color={theme.colors.text} size={20} />
              </Pressable>
            </View>
            {transcriptTracks.length > 0 ? (
              <View style={styles.trackOptionList}>
                {transcriptTracks.map((track) => {
                  const selected = track.id === activeTrack?.id;
                  return (
                    <Pressable
                      key={track.id}
                      accessibilityRole="button"
                      onPress={() => selectTranscriptTrack(track)}
                      style={[styles.trackOption, selected && styles.trackOptionSelected]}
                    >
                      <Captions
                        color={selected ? theme.colors.canvas : theme.colors.accent}
                        size={17}
                      />
                      <View style={styles.trackOptionCopy}>
                        <Text
                          style={[
                            styles.trackOptionTitle,
                            selected && styles.trackOptionTitleSelected,
                          ]}
                        >
                          {track.label}
                        </Text>
                        <Text
                          style={[
                            styles.trackOptionMeta,
                            selected && styles.trackOptionMetaSelected,
                          ]}
                        >
                          {track.language} · {track.source}
                        </Text>
                      </View>
                      {selected ? <Text style={styles.trackActiveText}>当前</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.trackEmpty}>
                当前材料只有主字幕轨道。导入或生成新的字幕后可在这里切换。
              </Text>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        animationType="fade"
        visible={wordSheet !== null}
        onRequestClose={() => setWordSheet(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setWordSheet(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.wordSheet}>
            <View style={styles.sheetHeader}>
              <View>
                {wordSheet?.kind === "phrase" ? "这句里的短语" : "这句里的词"}
                <Text style={styles.word}>{wordSheet?.word}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setWordSheet(null)}
                style={styles.closeButton}
              >
                <X color={theme.colors.text} size={20} />
              </Pressable>
            </View>
            {lookingUp || !wordSheet?.lookup ? (
              <View style={styles.lookupLoading}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.lookupLoadingText}>正在查找这句里的意思</Text>
              </View>
            ) : (
              <>
                {wordSheet.lookup.phonetic ? (
                  <Text style={styles.phonetic}>{wordSheet.lookup.phonetic}</Text>
                ) : null}
                {wordSheet.lookup.definitions.slice(0, 3).map((definition, index) => (
                  <View key={`${definition.definition}-${index}`} style={styles.definitionRow}>
                    <Text style={styles.definitionNumber}>{index + 1}</Text>
                    <View style={styles.definitionBody}>
                      {definition.partOfSpeech ? (
                        <Text style={styles.partOfSpeech}>{definition.partOfSpeech}</Text>
                      ) : null}
                      <Text style={styles.definition}>{definition.definition}</Text>
                      {definition.example ? (
                        <Text style={styles.example}>{definition.example}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                <Text style={styles.contextLabel}>原句</Text>
                <Text style={styles.context}>{wordSheet.sentence.text}</Text>
                <Text style={styles.contextLabel}>语境解释</Text>
                {contextExplanation ? (
                  <Text style={styles.context}>{contextExplanation}</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={contextBusy}
                    onPress={() => void loadContextExplanation()}
                    style={styles.contextAction}
                  >
                    {contextBusy ? (
                      <ActivityIndicator color={theme.colors.accent} />
                    ) : (
                      <Text style={styles.contextActionText}>解释这个词在这句中的意思</Text>
                    )}
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={saveWord}
                  style={({ pressed }) => [styles.saveWordButton, pressed && styles.pressed]}
                >
                  <BookmarkPlus color={theme.colors.canvas} size={18} />
                  <Text style={styles.saveWordText}>收进记忆库</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onPress,
  selected = false,
  styles,
  theme,
}: Readonly<{
  icon: typeof Repeat2;
  label: string;
  onPress: () => void;
  selected?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolButton,
        selected && styles.toolButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      <Icon color={selected ? theme.colors.canvas : theme.colors.mutedText} size={16} />
      <Text numberOfLines={1} style={[styles.toolLabel, selected && styles.toolLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}
function ImmersiveListening({
  onClose,
  onNext,
  onPlay,
  onPrevious,
  onToggleRepeat,
  playing,
  repeat,
  sentence,
  styles,
  theme,
  visible,
}: Readonly<{
  onClose: () => void;
  onNext: () => void;
  onPlay: () => void;
  onPrevious: () => void;
  onToggleRepeat: () => void;
  playing: boolean;
  repeat: boolean;
  sentence: LearningSentence;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  visible: boolean;
}>) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Modal animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.immersiveOverlay}>
        <View style={styles.immersiveTop}>
          <Text style={styles.immersiveKicker}>
            专注听力 · {String(sentence.order).padStart(2, "0")}
          </Text>
          <Pressable
            accessibilityLabel="退出专注听力"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.immersiveClose}
          >
            <X color={theme.colors.text} size={20} />
          </Pressable>
        </View>
        <View style={styles.immersiveBody}>
          {revealed ? (
            <Text style={styles.immersiveSentence}>{sentence.text}</Text>
          ) : (
            <Pressable
              accessibilityLabel="按住或点击显示字幕"
              accessibilityRole="button"
              onPress={() => setRevealed(true)}
              style={styles.hiddenCaption}
            >
              <EyeOff color={theme.colors.mutedText} size={23} />
              <Text style={styles.hiddenCaptionText}>先听一遍，再显示字幕</Text>
            </Pressable>
          )}
          {revealed ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setRevealed(false)}
              style={styles.hideCaptionButton}
            >
              <Eye color={theme.colors.mutedText} size={15} />
              <Text style={styles.hideCaptionText}>再次隐藏</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.immersiveControls}>
          <Pressable
            accessibilityLabel="上一句"
            accessibilityRole="button"
            onPress={onPrevious}
            style={styles.immersiveMinorButton}
          >
            <ChevronLeft color={theme.colors.text} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel={playing ? "暂停" : "播放"}
            accessibilityRole="button"
            onPress={onPlay}
            style={styles.immersivePlayButton}
          >
            {playing ? (
              <Pause color={theme.colors.canvas} fill={theme.colors.canvas} size={30} />
            ) : (
              <Play color={theme.colors.canvas} fill={theme.colors.canvas} size={30} />
            )}
          </Pressable>
          <Pressable
            accessibilityLabel="下一句"
            accessibilityRole="button"
            onPress={onNext}
            style={styles.immersiveMinorButton}
          >
            <ChevronRight color={theme.colors.text} size={22} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onToggleRepeat}
          style={[styles.immersiveRepeat, repeat && styles.immersiveRepeatSelected]}
        >
          <Repeat2 color={repeat ? theme.colors.canvas : theme.colors.mutedText} size={16} />
          <Text style={[styles.immersiveRepeatText, repeat && styles.immersiveRepeatTextSelected]}>
            单句循环
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function InteractiveSentence({
  text,
  styles,
  onWordPress,
}: Readonly<{
  text: string;
  styles: ReturnType<typeof createStyles>;
  onWordPress: (word: string) => void;
}>) {
  const pieces = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)?|[^A-Za-z]+/gu) ?? [text];
  return (
    <View accessibilityLabel={text} style={styles.sentenceWords}>
      {pieces.map((piece, index) =>
        /^[A-Za-z]/u.test(piece) ? (
          <Pressable
            key={`${piece}-${index}`}
            accessibilityRole="button"
            onPress={() => onWordPress(piece)}
            style={({ pressed }) => [styles.wordToken, pressed && styles.wordTokenPressed]}
          >
            <Text style={styles.wordTokenText}>{piece}</Text>
          </Pressable>
        ) : (
          <Text key={`${piece}-${index}`} style={styles.punctuation}>
            {piece}
          </Text>
        ),
      )}
    </View>
  );
}

function formatTime(value: number | null) {
  const seconds = Math.max(0, Math.floor((value ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { flex: 1, minHeight: 0 },
    content: { flexGrow: 1, gap: 18, paddingBottom: 30, paddingTop: 4 },
    empty: { alignItems: "center", gap: 12, paddingHorizontal: 28, paddingTop: 90 },
    emptyTitle: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 25,
      lineHeight: 33,
      textAlign: "center",
    },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 21, textAlign: "center" },
    mediaPreview: { marginHorizontal: 20 },
    mediaStage: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 14,
      marginHorizontal: 20,
      minHeight: 266,
      padding: 20,
    },
    stageTopline: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    stageLabel: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.35,
    },
    stageTime: { color: theme.colors.mutedText, fontSize: 11, fontVariant: ["tabular-nums"] },
    stageOrder: {
      color: theme.colors.divider,
      fontFamily: "Georgia",
      fontSize: 52,
      letterSpacing: -3,
      lineHeight: 50,
    },
    sentenceWords: { flexDirection: "row", flexWrap: "wrap", marginTop: -4 },
    wordToken: { borderRadius: 10, paddingHorizontal: 1, paddingVertical: 1 },
    analysisCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      gap: 7,
      marginHorizontal: 20,
      padding: 14,
    },
    analysisTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    analysisSection: { color: theme.colors.text, fontSize: 12, fontWeight: "700", marginTop: 5 },
    analysisPhrase: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      gap: 3,
      padding: 10,
    },
    analysisPhraseTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    analysisCopy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    wordTokenPressed: { backgroundColor: theme.colors.accentSoft },
    wordTokenText: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 28,
      letterSpacing: -0.28,
      lineHeight: 39,
    },
    punctuation: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 28,
      letterSpacing: -0.28,
      lineHeight: 39,
    },
    translation: { color: theme.colors.mutedText, fontSize: 14, lineHeight: 21, marginTop: "auto" },
    translationHint: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
      marginTop: "auto",
    },
    transport: { alignItems: "center", flexDirection: "row", gap: 16, justifyContent: "center" },
    playbackControls: { gap: 8, marginHorizontal: 20 },
    progressTrack: {
      backgroundColor: theme.colors.divider,
      borderRadius: 999,
      height: 6,
      overflow: "hidden",
    },
    progressFill: { backgroundColor: theme.colors.accent, borderRadius: 999, height: "100%" },
    playbackMeta: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    playbackTime: { color: theme.colors.mutedText, fontSize: 12, fontVariant: ["tabular-nums"] },
    rateRow: { flexDirection: "row", gap: 5 },
    rateChip: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    rateChipActive: { backgroundColor: theme.colors.accent },
    rateText: { color: theme.colors.mutedText, fontSize: 11, fontWeight: "600" },
    rateTextActive: { color: theme.colors.canvas },
    transportButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 12,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    playButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 16,
      height: 62,
      justifyContent: "center",
      width: 62,
    },
    disabled: { opacity: 0.28 },
    utilityBar: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 20 },
    toolButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 39,
      paddingHorizontal: 7,
    },
    toolButtonSelected: { backgroundColor: theme.colors.accent },
    toolLabel: { color: theme.colors.mutedText, fontSize: 11, fontWeight: "700" },
    toolLabelSelected: { color: theme.colors.canvas },
    notice: {
      alignItems: "center",
      backgroundColor: theme.colors.warningSurface,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginHorizontal: 20,
      padding: 12,
    },
    noticeText: { color: theme.colors.warningText, flex: 1, fontSize: 12, lineHeight: 18 },
    trajectoryHeader: {
      alignItems: "flex-end",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      marginHorizontal: 20,
      paddingBottom: 12,
      paddingTop: 8,
    },
    trajectoryTitle: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      letterSpacing: -0.3,
    },
    trajectoryMeta: { color: theme.colors.mutedText, fontSize: 11, marginTop: 3 },
    trajectoryIndex: { color: theme.colors.accent, fontSize: 28 },
    trackPill: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      flexDirection: "row",
      gap: 5,
      maxWidth: 150,
      minHeight: 36,
      paddingHorizontal: 11,
    },
    trackPillText: { color: theme.colors.accent, flexShrink: 1, fontSize: 12, fontWeight: "600" },
    echoLiveCard: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 12,
      flexDirection: "row",
      gap: 11,
      minHeight: 64,
      paddingHorizontal: 16,
    },
    echoPulse: { backgroundColor: theme.colors.accent, borderRadius: 999, height: 10, width: 10 },
    echoLiveCopy: { flex: 1, gap: 3 },
    echoLiveTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    echoLiveMeta: { color: theme.colors.mutedText, fontSize: 11 },
    echoStatus: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
      marginHorizontal: 20,
    },
    echoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 20 },
    echoActionPill: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
    },
    echoActionText: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
    echoHistory: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 12,
      gap: 8,
      padding: 14,
    },
    echoHistoryHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    echoHistoryTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    echoHistoryCount: { color: theme.colors.mutedText, fontSize: 11 },
    echoHistoryRow: { alignItems: "center", flexDirection: "row", gap: 9, minHeight: 30 },
    echoHistoryIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.canvas,
      borderRadius: 999,
      height: 27,
      justifyContent: "center",
      width: 27,
    },
    echoHistoryText: { color: theme.colors.text, flex: 1, fontSize: 12, fontWeight: "700" },
    echoHistoryMeta: { color: theme.colors.mutedText, fontSize: 11 },
    trackOptionList: { gap: 9 },
    trackOption: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 11,
      minHeight: 62,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    trackOptionSelected: { backgroundColor: theme.colors.accent },
    trackOptionCopy: { flex: 1, gap: 3 },
    trackOptionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    trackOptionTitleSelected: { color: theme.colors.canvas },
    trackOptionMeta: { color: theme.colors.mutedText, fontSize: 11 },
    trackOptionMetaSelected: { color: theme.colors.canvas, opacity: 0.82 },
    trackActiveText: { color: theme.colors.canvas, fontSize: 11, fontWeight: "700" },
    trackEmpty: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 20,
      paddingVertical: 10,
    },
    sentenceList: { paddingBottom: 18 },
    sentenceRow: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      height: 80,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    sentenceRowSelected: { backgroundColor: theme.colors.surface },
    rowRail: { backgroundColor: theme.colors.divider, height: 34, width: 2 },
    rowRailSelected: { backgroundColor: theme.colors.accent, height: 44 },
    rowRailComplete: { backgroundColor: theme.colors.success },
    rowBody: { flex: 1, gap: 4 },
    rowSentence: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
    rowSentenceSelected: { color: theme.colors.text, fontWeight: "700" },
    rowTranslation: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 17 },
    rowIndex: { color: theme.colors.mutedText, fontSize: 11, fontVariant: ["tabular-nums"] },
    modalOverlay: { backgroundColor: "rgba(0, 0, 0, 0.68)", flex: 1, justifyContent: "flex-end" },
    wordSheet: {
      backgroundColor: theme.colors.canvas,
      borderColor: theme.colors.divider,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 14,
      padding: 22,
    },
    sheetHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    sheetKicker: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.25,
    },
    word: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 35,
      letterSpacing: -0.5,
      marginTop: 3,
    },
    contextAction: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      justifyContent: "center",
      marginTop: 6,
      minHeight: 40,
      paddingHorizontal: 14,
    },
    contextActionText: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
    closeButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    lookupLoading: { alignItems: "center", flexDirection: "row", gap: 9, paddingVertical: 22 },
    lookupLoadingText: { color: theme.colors.mutedText, fontSize: 13 },
    phonetic: { color: theme.colors.mutedText, fontSize: 14 },
    definitionRow: { flexDirection: "row", gap: 10 },
    definitionNumber: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "700",
      paddingTop: 2,
      width: 14,
    },
    definitionBody: { flex: 1, gap: 3 },
    partOfSpeech: {
      color: theme.colors.accent,
      fontSize: 12,
      fontStyle: "italic",
      fontWeight: "700",
    },
    definition: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
    example: { color: theme.colors.mutedText, fontSize: 12, fontStyle: "italic", lineHeight: 18 },
    contextLabel: {
      color: theme.colors.mutedText,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.1,
      marginTop: 2,
    },
    context: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 15,
      fontStyle: "italic",
      lineHeight: 21,
    },
    saveWordButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 4,
      padding: 14,
    },
    saveWordText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "700" },
    immersiveOverlay: {
      backgroundColor: theme.colors.background,
      flex: 1,
      paddingBottom: 34,
      paddingHorizontal: 24,
      paddingTop: 22,
    },
    immersiveTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    immersiveKicker: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.3,
    },
    immersiveClose: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    immersiveBody: { alignItems: "center", flex: 1, justifyContent: "center" },
    immersiveSentence: {
      color: theme.colors.text,
      fontFamily: "Georgia",
      fontSize: 31,
      letterSpacing: -0.4,
      lineHeight: 43,
      textAlign: "center",
    },
    hiddenCaption: { alignItems: "center", gap: 12, paddingHorizontal: 28, paddingVertical: 24 },
    hiddenCaptionText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    hideCaptionButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 20,
      padding: 8,
    },
    hideCaptionText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "700" },
    immersiveControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: 24,
      justifyContent: "center",
    },
    immersiveMinorButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 23,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    immersivePlayButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 34,
      height: 68,
      justifyContent: "center",
      width: 68,
    },
    immersiveRepeat: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 7,
      marginTop: 22,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    immersiveRepeatSelected: { backgroundColor: theme.colors.accent },
    immersiveRepeatText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    immersiveRepeatTextSelected: { color: theme.colors.canvas },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
