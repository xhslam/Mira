export type CaptionCue = Readonly<{
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}>;

export type VocabularyRating = "again" | "known" | "easy";

export type VocabularyCard = Readonly<{
  id: string;
  term: string;
  definition: string;
  context: string;
  translation: string | null;
  sourceResourceId: string | null;
  repetitions: number;
  intervalDays: number;
  ease: number;
  dueAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
}>;

export type PronunciationAssessment = Readonly<{
  id: string;
  recordingId: string;
  sentenceId: string;
  overall: number;
  accuracy: number;
  completeness: number;
  fluency: number;
  prosody: number;
  transcript: string;
  wordScores: readonly Readonly<{ word: string; score: number }>[];
  contour: readonly number[];
  createdAt: string;
}>;

export type TranslationCacheEntry = Readonly<{
  id: string;
  sentenceId: string;
  sourceFingerprint: string;
  sourceText: string;
  targetLanguage: string;
  translation: string;
  contextNote: string | null;
  updatedAt: string;
}>;

export type TranscriptionJob = Readonly<{
  id: string;
  resourceId: string;
  state: "queued" | "processing" | "ready" | "failed";
  sourceUri: string;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PracticePoster = Readonly<{
  id: string;
  sentenceId: string;
  title: string;
  quote: string;
  score: number | null;
  uri: string;
  createdAt: string;
}>;

export type LocalLearningGoal = Readonly<{
  dailyMinutes: number;
  practiceMinutesToday: number;
  lastActivityDate: string;
  streakDays: number;
}>;

const TIME_PATTERN = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/u;

export function parseSrtOrVtt(input: string): readonly CaptionCue[] {
  const normalized = input
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .trim();
  if (!normalized) return Object.freeze([]);
  const blocks = normalized.replace(/^WEBVTT[^\n]*(?:\n|$)/iu, "").split(/\n\s*\n/gu);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex] ?? "";
    const [startRaw = "", endRaw = ""] = timing
      .split("-->")
      .map((part) => part.trim().split(/\s+/u)[0] ?? "");
    const startMs = parseCaptionTime(startRaw);
    const endMs = parseCaptionTime(endRaw);
    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    if (startMs === null || endMs === null || endMs <= startMs || !text) continue;
    cues.push(Object.freeze({ index: cues.length + 1, startMs, endMs, text }));
  }
  return Object.freeze(cues);
}

function parseCaptionTime(value: string): number | null {
  const match = TIME_PATTERN.exec(value.replace(".", ","));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number((match[4] ?? "").padEnd(3, "0"));
  if ([hours, minutes, seconds, milliseconds].some((item) => !Number.isFinite(item))) return null;
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000 + milliseconds;
}

export function fingerprintText(value: string): string {
  let hash = 2166136261;
  for (const character of value.trim().replace(/\s+/gu, " ").toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export function tokenizeWords(value: string): readonly string[] {
  return Object.freeze(
    value
      .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0) ?? [],
  );
}

/**
 * Turns pasted prose or Markdown notes into sentence-sized learning units.
 * Markdown structure is removed conservatively while sentence punctuation and
 * common English abbreviations are preserved.
 */
export function splitLearningSentences(value: string): readonly string[] {
  const normalized = value
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\s{0,3}#{1,6}\s+.*$/gmu, "")
    .replace(/^\s{0,3}(?:>\s*|[-*+]\s+|\d+[.)]\s+)/gmu, "")
    .replace(/[*_~`]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .trim();
  if (!normalized) return Object.freeze([]);

  const protectedText = normalized
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\./giu, "$1\uE000")
    .replace(/\b(e\.g|i\.e|etc)\./giu, (match) => match.replace(/\./gu, "\uE000"))
    .replace(/([.!?。！？]["'”’)]*)\s+/gu, "$1\n");
  return Object.freeze(
    protectedText
      .split(/\n+/gu)
      .map((sentence) =>
        sentence
          .replace(/\uE000/gu, ".")
          .replace(/\s+/gu, " ")
          .trim(),
      )
      .filter(Boolean),
  );
}

export function createVocabularyCard(
  options: Readonly<{
    id: string;
    term: string;
    definition: string;
    context: string;
    translation?: string | null;
    sourceResourceId?: string | null;
    now: string;
  }>,
): VocabularyCard {
  return Object.freeze({
    id: options.id,
    term: options.term.trim(),
    definition: options.definition.trim() || "Add your own definition.",
    context: options.context.trim(),
    translation: options.translation?.trim() || null,
    sourceResourceId: options.sourceResourceId ?? null,
    repetitions: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: options.now,
    lastReviewedAt: null,
    createdAt: options.now,
  });
}

export function reviewVocabularyCard(
  card: VocabularyCard,
  rating: VocabularyRating,
  now: Date,
): VocabularyCard {
  const previousEase = card.ease;
  const nextEase = clamp(
    previousEase + (rating === "easy" ? 0.15 : rating === "known" ? 0 : -0.2),
    1.3,
    3.0,
  );
  const repetitions = rating === "again" ? 0 : card.repetitions + 1;
  const intervalDays =
    rating === "again"
      ? 0
      : card.repetitions === 0
        ? 1
        : card.repetitions === 1
          ? 3
          : Math.max(4, Math.round(card.intervalDays * nextEase));
  const due = new Date(now.getTime());
  due.setDate(due.getDate() + (rating === "again" ? 0 : intervalDays));
  return Object.freeze({
    ...card,
    repetitions,
    intervalDays,
    ease: nextEase,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
  });
}

export function assessPronunciationLocally(
  options: Readonly<{
    id: string;
    recordingId: string;
    sentenceId: string;
    expected: string;
    transcript: string;
    durationMs: number;
    expectedDurationMs?: number | null;
    now: string;
  }>,
): PronunciationAssessment {
  const expectedWords = tokenizeWords(options.expected);
  const actualWords = tokenizeWords(options.transcript);
  const expectedNormalized = expectedWords.map((word) => word.toLowerCase());
  const actualNormalized = actualWords.map((word) => word.toLowerCase());
  const matches = expectedNormalized.map((word, index) => word === actualNormalized[index]);
  const matched = matches.filter(Boolean).length;
  const completeness = scoreRatio(actualWords.length, expectedWords.length);
  const accuracy = expectedWords.length ? Math.round((matched / expectedWords.length) * 100) : 0;
  const expectedDuration = options.expectedDurationMs ?? Math.max(900, expectedWords.length * 520);
  const timingRatio =
    Math.min(options.durationMs, expectedDuration) /
    Math.max(options.durationMs, expectedDuration, 1);
  const fluency = Math.round(45 + timingRatio * 55);
  const prosody = Math.round(
    52 +
      Math.min(
        40,
        Math.max(0, 20 - Math.abs(expectedWords.length * 580 - options.durationMs) / 100),
      ),
  );
  const overall = Math.round(
    accuracy * 0.42 + completeness * 0.24 + fluency * 0.2 + prosody * 0.14,
  );
  const wordScores = Object.freeze(
    expectedWords.map((word, index) =>
      Object.freeze({
        word,
        score: matches[index] ? Math.max(78, accuracy) : Math.max(35, Math.round(accuracy * 0.55)),
      }),
    ),
  );
  const contour = Object.freeze(
    Array.from(
      { length: Math.max(16, expectedWords.length * 6) },
      (_, index) => 45 + Math.round(28 * Math.sin(index * 0.72) + (index % 5) * 3),
    ),
  );
  return Object.freeze({
    id: options.id,
    recordingId: options.recordingId,
    sentenceId: options.sentenceId,
    overall,
    accuracy,
    completeness,
    fluency,
    prosody,
    transcript: options.transcript,
    wordScores,
    contour,
    createdAt: options.now,
  });
}

function scoreRatio(actual: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.round((Math.min(actual, expected) / expected) * 100);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function toAnkiCsv(cards: readonly VocabularyCard[]): string {
  const escape = (value: string) => `"${value.replace(/"/gu, '""')}"`;
  return [
    "Front,Back,Context,Tags",
    ...cards.map((card) =>
      [
        card.term,
        [card.definition, card.translation].filter(Boolean).join("<br>"),
        card.context,
        "enjoy-player",
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
}

export function createPracticePosterSvg(
  options: Readonly<{
    title: string;
    quote: string;
    score: number | null;
    date: string;
  }>,
): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/gu,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ??
        character,
    );
  const score = options.score === null ? "Practice complete" : `${options.score}/100 pronunciation`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#122047"/><stop offset="1" stop-color="#7252c8"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="900" cy="220" r="240" fill="#86d7ff" opacity=".16"/><text x="90" y="180" fill="#bcd0ff" font-family="Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="8">ENJOY PRACTICE</text><text x="90" y="320" fill="white" font-family="Arial, sans-serif" font-size="72" font-weight="700">${escape(options.title).slice(0, 32)}</text><foreignObject x="90" y="480" width="900" height="640"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-weight:700;font-size:72px;line-height:1.25;color:#fff">“${escape(options.quote)}”</div></foreignObject><rect x="90" y="1370" rx="36" width="900" height="230" fill="#ffffff" opacity=".14"/><text x="140" y="1470" fill="#dce9ff" font-family="Arial, sans-serif" font-size="34">${escape(score)}</text><text x="140" y="1550" fill="white" font-family="Arial, sans-serif" font-size="54" font-weight="700">One line closer to fluency.</text><text x="90" y="1780" fill="#bcd0ff" font-family="Arial, sans-serif" font-size="34">${escape(options.date)}</text></svg>`;
}
