import type {
  LocalLearningGoal,
  PracticePoster,
  PronunciationAssessment,
  TranscriptionJob,
  TranslationCacheEntry,
  VocabularyCard,
} from "./enjoy-player-domain";
import type {
  EnglishLessonSession,
  LearningExpression,
  LessonCard,
  ReplayEvidence,
} from "./english-coach-domain";

export const LEARNING_SECTIONS = [
  "home",
  "craft",
  "url-import",
  "discover",
  "library",
  "practice",
  "vocabulary",
  "phrase-memory",
  "studio",
  "chat",
  "courses",
  "generate",
  "settings",
] as const;

export type LearningSection = (typeof LEARNING_SECTIONS)[number];
export type LearningMessageRole = "user" | "assistant" | "system";
export type AsyncState = "idle" | "pending" | "ready" | "failed" | "cancelled";
export type CourseProgressState = "locked" | "available" | "in_progress" | "completed";

export type LearningSentence = Readonly<{
  id: string;
  resourceId: string;
  order: number;
  text: string;
  translation: string | null;
  startMs: number | null;
  endMs: number | null;
  sourceAudioUri: string | null;
}>;

export type LearningResource = Readonly<{
  id: string;
  title: string;
  description: string;
  language: string;
  source: "generated" | "imported" | "manual" | "youtube" | "bilibili";
  provider?: "library" | "craft" | "discover" | "recording" | "manual";
  content: string;
  sentences: readonly LearningSentence[];
  mediaUri?: string;
  mediaKind?: "audio" | "video" | "youtube" | "bilibili" | "text";
  sourceUrl?: string;
  captionFingerprint?: string;
  durationMs?: number | null;
  thumbnailUri?: string | null;
  lastOpenedAt?: string | null;
  lastPositionMs?: number;
  createdAt: string;
  updatedAt: string;
}>;

export type LearningRecording = Readonly<{
  id: string;
  sentenceId: string;
  uri: string;
  durationMs: number;
  transcript: string | null;
  state: AsyncState;
  createdAt: string;
}>;

export type PracticeProgress = Readonly<{
  resourceId: string;
  sentenceId: string;
  listened: boolean;
  shadowed: boolean;
  lastPositionMs: number;
  selected: boolean;
  updatedAt: string;
}>;

export type ChatPartner = Readonly<{
  id: string;
  name: string;
  avatarSeed: string;
  description: string;
  personality: string;
  scenario: string;
  learningGoal: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  openingMessage: string;
  voiceId: string | null;
  correctionStyle: "gentle" | "direct" | "on_request";
  customInstructions: string;
  createdAt: string;
  updatedAt: string;
}>;

export type LearningMessage = Readonly<{
  id: string;
  conversationId: string;
  role: LearningMessageRole;
  content: string;
  state: "complete" | "streaming" | "incomplete";
  audioUri: string | null;
  createdAt: string;
}>;

export type LearningConversation = Readonly<{
  id: string;
  partnerId: string | null;
  title: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  messages: readonly LearningMessage[];
}>;

export type LearningCourseLesson = Readonly<{
  id: string;
  courseId: string;
  resourceId: string;
  order: number;
  title: string;
  locked: boolean;
}>;

export type LearningCourse = Readonly<{
  id: string;
  title: string;
  description: string;
  language: string;
  level: "beginner" | "intermediate" | "advanced";
  coverColor: string;
  createdAt: string;
  updatedAt: string;
  lessons: readonly LearningCourseLesson[];
}>;

export type CourseProgress = Readonly<{
  courseId: string;
  lessonId: string;
  state: CourseProgressState;
  completionPercent: number;
  lastOpenedAt: string | null;
  updatedAt: string;
}>;

export type GeneratedSpeech = Readonly<{
  id: string;
  textHash: string;
  text: string;
  voiceId: string;
  locale: string;
  rate: number;
  uri: string | null;
  durationMs: number | null;
  state: AsyncState;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type GenerationDraft = Readonly<{
  id: string;
  request: string;
  language: string;
  level: "beginner" | "intermediate" | "advanced";
  state: AsyncState;
  outputJson: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type LearningTranscriptTrack = Readonly<{
  id: string;
  resourceId: string;
  label: string;
  language: string;
  source: "imported" | "ai" | "manual" | "translation";
  isPrimary: boolean;
  sentences: readonly LearningSentence[];
  createdAt: string;
  updatedAt: string;
}>;
export type LearningSavedItem = Readonly<{
  id: string;
  kind: "word" | "phrase" | "sentence";
  term: string;
  translation: string | null;
  explanation: string | null;
  mediaId: string;
  mediaTitle: string;
  cueId: string;
  timestampMs: number | null;
  originalSentence: string;
  createdAt: string;
}>;
export type LearningMemoryCategory = "preference" | "goal" | "weakness" | "learning" | "other";

export type LearningMemory = Readonly<{
  id: string;
  text: string;
  category: LearningMemoryCategory | null;
  tags: readonly string[];
  notes?: string;
  sourceType: "user" | "assistant" | "system";
  sourceId?: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type LearningSentenceAnalysis = Readonly<{
  id: string;
  resourceId: string;
  sentenceId: string;
  sourceHash: string;
  version: string;
  state: AsyncState;
  sentencePatterns: readonly string[];
  keyPhrases: readonly Readonly<{
    phrase: string;
    translation: string;
    explanation: string;
    category: string | null;
  }>[];
  grammarPoints: readonly string[];
  contextualExplanation: string | null;
  error: string | null;
  updatedAt: string;
}>;
export type DiscoverSubscription = Readonly<{
  id: string;
  provider: "youtube" | "bilibili";
  sourceId: string;
  sourceUrl: string;
  title: string;
  avatarUrl: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
  lastError: string | null;
}>;
export type DiscoverFeedEntry = Readonly<{
  id: string;
  subscriptionId: string;
  provider: "youtube" | "bilibili";
  externalId: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;
export type LearningImportIntent =
  "local" | "photo" | "text" | "url" | "recording" | "subtitle" | null;

export type LearningSettings = Readonly<{
  selectedProviderProfileId: string | null;
  ttsBaseUrl: string;
  ttsApiKeyStored: boolean;
  ttsVoiceId: string;
  ttsLocale: string;
  ttsRate: number;
  sttBaseUrl: string;
  sttApiKeyStored: boolean;
  autoSpeakResponses: boolean;
  showTranslationsByDefault: boolean;
  translationTargetLanguage: string;
  echoLoopCount: number;
}>;

export type LearningUiState = Readonly<{
  section: LearningSection;
  selectedResourceId: string | null;
  selectedSentenceId: string | null;
  activeTranscriptTrackId: string | null;
  selectedConversationId: string | null;
  selectedCourseId: string | null;
  selectedLessonId: string | null;
  importIntent: LearningImportIntent;
}>;

export type LearningSnapshot = Readonly<{
  version: 5;
  resources: readonly LearningResource[];
  recordings: readonly LearningRecording[];
  practice: readonly PracticeProgress[];
  vocabulary: readonly VocabularyCard[];
  assessments: readonly PronunciationAssessment[];
  translations: readonly TranslationCacheEntry[];
  transcriptionJobs: readonly TranscriptionJob[];
  posters: readonly PracticePoster[];
  goal: LocalLearningGoal;
  partners: readonly ChatPartner[];
  conversations: readonly LearningConversation[];
  courses: readonly LearningCourse[];
  courseProgress: readonly CourseProgress[];
  generatedSpeech: readonly GeneratedSpeech[];
  generationDrafts: readonly GenerationDraft[];
  transcriptTracks: readonly LearningTranscriptTrack[];
  savedItems: readonly LearningSavedItem[];
  memories: readonly LearningMemory[];
  analyses: readonly LearningSentenceAnalysis[];
  subscriptions: readonly DiscoverSubscription[];
  discoverEntries: readonly DiscoverFeedEntry[];
  englishLessonSessions: readonly EnglishLessonSession[];
  learningExpressions: readonly LearningExpression[];
  lessonCards: readonly LessonCard[];
  replayEvidence: readonly ReplayEvidence[];
  settings: LearningSettings;
  ui: LearningUiState;
}>;

export function createInitialLearningSnapshot(): LearningSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  return Object.freeze({
    version: 5,
    resources: Object.freeze([]),
    recordings: Object.freeze([]),
    practice: Object.freeze([]),
    vocabulary: Object.freeze([]),
    assessments: Object.freeze([]),
    translations: Object.freeze([]),
    transcriptionJobs: Object.freeze([]),
    posters: Object.freeze([]),
    goal: Object.freeze({
      dailyMinutes: 15,
      practiceMinutesToday: 0,
      lastActivityDate: today,
      streakDays: 0,
    }),
    partners: Object.freeze([]),
    conversations: Object.freeze([]),
    courses: Object.freeze([]),
    courseProgress: Object.freeze([]),
    generatedSpeech: Object.freeze([]),
    generationDrafts: Object.freeze([]),
    transcriptTracks: Object.freeze([]),
    savedItems: Object.freeze([]),
    memories: Object.freeze([]),
    analyses: Object.freeze([]),
    subscriptions: Object.freeze([]),
    discoverEntries: Object.freeze([]),
    englishLessonSessions: Object.freeze([]),
    learningExpressions: Object.freeze([]),
    lessonCards: Object.freeze([]),
    replayEvidence: Object.freeze([]),
    settings: Object.freeze({
      selectedProviderProfileId: null,
      ttsBaseUrl: "",
      ttsApiKeyStored: false,
      ttsVoiceId: "alloy",
      ttsLocale: "en-US",
      ttsRate: 1,
      sttBaseUrl: "",
      sttApiKeyStored: false,
      autoSpeakResponses: false,
      showTranslationsByDefault: true,
      translationTargetLanguage: "zh-CN",
      echoLoopCount: 3,
    }),
    ui: Object.freeze({
      section: "home",
      selectedResourceId: null,
      selectedSentenceId: null,
      activeTranscriptTrackId: null,
      selectedConversationId: null,
      selectedCourseId: null,
      selectedLessonId: null,
      importIntent: null,
    }),
  });
}

export function normalizeLearningSnapshot(value: unknown): LearningSnapshot {
  if (!value || typeof value !== "object") return createInitialLearningSnapshot();
  const candidate = value as Partial<Omit<LearningSnapshot, "version">> &
    Readonly<{ version?: number }>;
  if (
    candidate.version !== 1 &&
    candidate.version !== 2 &&
    candidate.version !== 3 &&
    candidate.version !== 4 &&
    candidate.version !== 5
  )
    return createInitialLearningSnapshot();
  const initial = createInitialLearningSnapshot();
  return Object.freeze({
    ...initial,
    ...candidate,
    version: 5,
    resources: Object.freeze(candidate.resources ?? []),
    recordings: Object.freeze(candidate.recordings ?? []),
    practice: Object.freeze(candidate.practice ?? []),
    vocabulary: Object.freeze(candidate.vocabulary ?? []),
    assessments: Object.freeze(candidate.assessments ?? []),
    translations: Object.freeze(candidate.translations ?? []),
    transcriptionJobs: Object.freeze(candidate.transcriptionJobs ?? []),
    posters: Object.freeze(candidate.posters ?? []),
    goal: Object.freeze({ ...initial.goal, ...candidate.goal }),
    partners: Object.freeze(candidate.partners ?? []),
    conversations: Object.freeze(candidate.conversations ?? []),
    courses: Object.freeze(candidate.courses ?? []),
    courseProgress: Object.freeze(candidate.courseProgress ?? []),
    generatedSpeech: Object.freeze(candidate.generatedSpeech ?? []),
    generationDrafts: Object.freeze(candidate.generationDrafts ?? []),
    transcriptTracks: Object.freeze(candidate.transcriptTracks ?? []),
    savedItems: Object.freeze(candidate.savedItems ?? []),
    memories: Object.freeze(candidate.memories ?? []),
    analyses: Object.freeze(candidate.analyses ?? []),
    subscriptions: Object.freeze(candidate.subscriptions ?? []),
    discoverEntries: Object.freeze(candidate.discoverEntries ?? []),
    englishLessonSessions: Object.freeze(candidate.englishLessonSessions ?? []),
    learningExpressions: Object.freeze(candidate.learningExpressions ?? []),
    lessonCards: Object.freeze(candidate.lessonCards ?? []),
    replayEvidence: Object.freeze(candidate.replayEvidence ?? []),
    settings: Object.freeze({ ...initial.settings, ...candidate.settings }),
    ui: Object.freeze({ ...initial.ui, ...candidate.ui }),
  });
}
