import {
  createInitialLearningSnapshot,
  normalizeLearningSnapshot,
  type LearningResource,
  type LearningSentence,
  type LearningSnapshot,
  type LearningTranscriptTrack,
} from "../../learning-types";
import type { LearningSqlDatabase } from "./learning-migration-runner";
import { createLegacyMigrationPlan } from "./legacy-snapshot-migration";

type MediaRow = Readonly<{
  id: string;
  title: string;
  description: string;
  language: string;
  source: LearningResource["source"];
  provider: LearningResource["provider"] | null;
  content: string;
  mediaUri: string | null;
  mediaKind: LearningResource["mediaKind"] | null;
  sourceUrl: string | null;
  durationMs: number | null;
  thumbnailUri: string | null;
  createdAt: string;
  updatedAt: string;
}>;
type TrackRow = Readonly<{
  id: string;
  mediaId: string;
  label: string;
  language: string;
  source: LearningTranscriptTrack["source"];
  createdAt: string;
  updatedAt: string;
}>;
type CueRow = Readonly<{
  id: string;
  trackId: string;
  mediaId: string;
  order: number;
  text: string;
  translation: string | null;
  startMs: number | null;
  endMs: number | null;
  sourceAudioUri: string | null;
}>;

type CueProgressRow = Readonly<{
  mediaId: string;
  cueId: string;
  listened: number;
  shadowed: number;
  selected: number;
  lastPositionMs: number;
  updatedAt: string;
}>;

type PlaybackProgressRow = Readonly<{
  mediaId: string;
  positionMs: number;
  updatedAt: string;
}>;

type AuxiliarySnapshot = Omit<
  LearningSnapshot,
  "resources" | "recordings" | "practice" | "transcriptTracks" | "savedItems" | "analyses"
>;

const CORE_TABLES = [
  "term_encounters",
  "saved_terms",
  "pronunciation_assessments",
  "echo_recordings",
  "sentence_analyses",
  "cue_progress",
  "playback_progress",
  "learning_activity",
  "active_transcript_tracks",
  "transcript_cues",
  "transcript_tracks",
  "learning_media",
] as const;

export async function ensureLearningProjectionSchema(database: LearningSqlDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS cue_progress (
      media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
      cue_id TEXT NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
      listened INTEGER NOT NULL DEFAULT 0,
      shadowed INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      last_position_ms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (media_id, cue_id)
    );
    CREATE TABLE IF NOT EXISTS learning_auxiliary_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function auxiliarySnapshot(snapshot: LearningSnapshot): AuxiliarySnapshot {
  const { resources, recordings, practice, transcriptTracks, savedItems, analyses, ...auxiliary } =
    snapshot;
  return Object.freeze(auxiliary);
}

function parseAuxiliary(value: string): AuxiliarySnapshot {
  try {
    return JSON.parse(value) as AuxiliarySnapshot;
  } catch {
    return auxiliarySnapshot(createInitialLearningSnapshot());
  }
}

function sentencesFromRows(rows: readonly CueRow[]): readonly LearningSentence[] {
  return Object.freeze(
    rows.map((cue) =>
      Object.freeze({
        id: cue.id,
        resourceId: cue.mediaId,
        order: cue.order,
        text: cue.text,
        translation: cue.translation,
        startMs: cue.startMs,
        endMs: cue.endMs,
        sourceAudioUri: cue.sourceAudioUri,
      }),
    ),
  );
}

export async function writeNormalizedLearningSnapshot(
  database: LearningSqlDatabase,
  snapshot: LearningSnapshot,
  updatedAt: string,
): Promise<void> {
  await ensureLearningProjectionSchema(database);
  const plan = createLegacyMigrationPlan(snapshot);
  await database.withTransactionAsync(async (transaction) => {
    for (const table of CORE_TABLES) await transaction.runAsync(`DELETE FROM ${table}`);
    for (const write of plan.writes) await transaction.runAsync(write.sql, ...write.params);
    for (const progress of snapshot.practice) {
      await transaction.runAsync(
        `INSERT OR REPLACE INTO cue_progress (
          media_id, cue_id, listened, shadowed, selected, last_position_ms, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        progress.resourceId,
        progress.sentenceId,
        progress.listened ? 1 : 0,
        progress.shadowed ? 1 : 0,
        progress.selected ? 1 : 0,
        progress.lastPositionMs,
        progress.updatedAt,
      );
    }
    for (const resource of snapshot.resources) {
      await transaction.runAsync(
        `INSERT OR REPLACE INTO playback_progress (
          media_id, position_ms, active_cue_id, playback_rate, volume, updated_at
        ) VALUES (?, ?, ?, 1, 1, ?)`,
        resource.id,
        resource.lastPositionMs ?? 0,
        snapshot.ui.selectedResourceId === resource.id ? snapshot.ui.selectedSentenceId : null,
        resource.updatedAt,
      );
    }
    const selectedResourceId = snapshot.ui.selectedResourceId;
    const selectedTrackId = snapshot.ui.activeTranscriptTrackId;
    if (selectedResourceId && selectedTrackId) {
      await transaction.runAsync(
        `INSERT OR REPLACE INTO active_transcript_tracks (media_id, track_id, updated_at) VALUES (?, ?, ?)`,
        selectedResourceId,
        selectedTrackId,
        updatedAt,
      );
    }
    await transaction.runAsync(
      `INSERT INTO learning_auxiliary_state (id, payload_json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      JSON.stringify(auxiliarySnapshot(snapshot)),
      updatedAt,
    );
  });
}

export async function readNormalizedLearningSnapshot(
  database: LearningSqlDatabase,
): Promise<LearningSnapshot | null> {
  await ensureLearningProjectionSchema(database);
  const auxiliary = await database.getFirstAsync<Readonly<{ payload_json: string }>>(
    "SELECT payload_json FROM learning_auxiliary_state WHERE id = 1",
  );
  if (!auxiliary) return null;
  const [
    mediaRows,
    trackRows,
    cueRows,
    playbackRows,
    progressRows,
    recordingRows,
    savedRows,
    analysisRows,
    activeRows,
  ] = await Promise.all([
    database.getAllAsync<MediaRow>(
      `SELECT id, title, description, language, source, provider, content, media_uri AS mediaUri,
       media_kind AS mediaKind, source_url AS sourceUrl, duration_ms AS durationMs, thumbnail_uri AS thumbnailUri,
       created_at AS createdAt, updated_at AS updatedAt FROM learning_media WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
    ),
    database.getAllAsync<TrackRow>(
      `SELECT id, media_id AS mediaId, label, language, source, created_at AS createdAt, updated_at AS updatedAt FROM transcript_tracks`,
    ),
    database.getAllAsync<CueRow>(
      `SELECT id, track_id AS trackId, media_id AS mediaId, cue_order AS "order", text, translation,
       start_ms AS startMs, end_ms AS endMs, source_audio_uri AS sourceAudioUri FROM transcript_cues ORDER BY cue_order`,
    ),
    database.getAllAsync<PlaybackProgressRow>(
      `SELECT media_id AS mediaId, position_ms AS positionMs, updated_at AS updatedAt
       FROM playback_progress`,
    ),
    database.getAllAsync<CueProgressRow>(
      `SELECT media_id AS mediaId, cue_id AS cueId, listened, shadowed, selected, last_position_ms AS lastPositionMs,
       updated_at AS updatedAt FROM cue_progress`,
    ),
    database.getAllAsync<
      Readonly<{
        id: string;
        cue_id: string;
        file_uri: string;
        duration_ms: number;
        transcript: string | null;
        state: "idle" | "loading" | "ready" | "error";
        created_at: string;
      }>
    >(
      `SELECT id, cue_id, file_uri, duration_ms, transcript, state, created_at FROM echo_recordings ORDER BY created_at DESC`,
    ),
    database.getAllAsync<
      Readonly<{
        id: string;
        media_id: string;
        cue_id: string;
        timestamp_ms: number | null;
        original_sentence: string;
        display_text: string;
        definition: string | null;
        explanation: string | null;
        created_at: string;
      }>
    >(
      `SELECT encounter.id, encounter.media_id, encounter.cue_id, encounter.timestamp_ms, encounter.original_sentence,
       term.display_text, term.definition, encounter.explanation, encounter.created_at
       FROM term_encounters encounter JOIN saved_terms term ON term.id = encounter.term_id ORDER BY encounter.created_at DESC`,
    ),
    database.getAllAsync<
      Readonly<{
        id: string;
        media_id: string;
        cue_id: string;
        source_hash: string;
        analysis_version: string;
        state: "idle" | "loading" | "ready" | "error";
        payload_json: string;
        error: string | null;
        updated_at: string;
      }>
    >(
      `SELECT id, media_id, cue_id, source_hash, analysis_version, state, payload_json, error, updated_at FROM sentence_analyses`,
    ),
    database.getAllAsync<Readonly<{ media_id: string; track_id: string }>>(
      "SELECT media_id, track_id FROM active_transcript_tracks",
    ),
  ]);
  const activeTrackByMedia = new Map(activeRows.map((row) => [row.media_id, row.track_id]));
  const cuesByTrack = new Map<string, CueRow[]>();
  cueRows.forEach((cue) =>
    cuesByTrack.set(cue.trackId, [...(cuesByTrack.get(cue.trackId) ?? []), cue]),
  );
  const tracks = Object.freeze(
    trackRows.map((track) =>
      Object.freeze({
        id: track.id,
        resourceId: track.mediaId,
        label: track.label,
        language: track.language,
        source: track.source,
        isPrimary: activeTrackByMedia.get(track.mediaId) === track.id,
        sentences: sentencesFromRows(cuesByTrack.get(track.id) ?? []),
        createdAt: track.createdAt,
        updatedAt: track.updatedAt,
      }),
    ),
  );
  const tracksByMedia = new Map<string, readonly LearningTranscriptTrack[]>();
  tracks.forEach((track) =>
    tracksByMedia.set(track.resourceId, [...(tracksByMedia.get(track.resourceId) ?? []), track]),
  );
  const playbackByMedia = new Map<string, PlaybackProgressRow>();
  playbackRows.forEach((row) => playbackByMedia.set(row.mediaId, row));

  const resources = Object.freeze(
    mediaRows.map((media) => {
      const resourceTracks = tracksByMedia.get(media.id) ?? [];
      const selected = resourceTracks.find((track) => track.isPrimary) ?? resourceTracks[0];
      const playback = playbackByMedia.get(media.id);
      return Object.freeze({
        ...media,
        ...(playback ? { lastPositionMs: playback.positionMs } : {}),
        sentences: selected?.sentences ?? Object.freeze([]),
      });
    }),
  );
  const analyses = Object.freeze(
    analysisRows.map((row) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return Object.freeze({
        id: row.id,
        resourceId: row.media_id,
        sentenceId: row.cue_id,
        sourceHash: row.source_hash,
        version: row.analysis_version,
        state: row.state,
        sentencePatterns: Array.isArray(payload.sentencePatterns)
          ? payload.sentencePatterns.filter((item): item is string => typeof item === "string")
          : [],
        keyPhrases: Array.isArray(payload.keyPhrases)
          ? (payload.keyPhrases as LearningSnapshot["analyses"][number]["keyPhrases"])
          : [],
        grammarPoints: Array.isArray(payload.grammarPoints)
          ? payload.grammarPoints.filter((item): item is string => typeof item === "string")
          : [],
        contextualExplanation:
          typeof payload.contextualExplanation === "string" ? payload.contextualExplanation : null,
        error: row.error,
        updatedAt: row.updated_at,
      });
    }),
  );
  return normalizeLearningSnapshot({
    ...parseAuxiliary(auxiliary.payload_json),
    version: 3,
    resources,
    transcriptTracks: tracks,
    practice: Object.freeze(
      progressRows.map((row) =>
        Object.freeze({
          resourceId: row.mediaId,
          sentenceId: row.cueId,
          listened: Boolean(row.listened),
          shadowed: Boolean(row.shadowed),
          selected: Boolean(row.selected),
          lastPositionMs: row.lastPositionMs,
          updatedAt: row.updatedAt,
        }),
      ),
    ),
    recordings: Object.freeze(
      recordingRows.map((row) =>
        Object.freeze({
          id: row.id,
          sentenceId: row.cue_id,
          uri: row.file_uri,
          durationMs: row.duration_ms,
          transcript: row.transcript,
          state: row.state,
          createdAt: row.created_at,
        }),
      ),
    ),
    savedItems: Object.freeze(
      savedRows.map((row) =>
        Object.freeze({
          id: row.id,
          kind: "word" as const,
          term: row.display_text,
          translation: row.definition,
          explanation: row.explanation,
          mediaId: row.media_id,
          mediaTitle: resources.find((resource) => resource.id === row.media_id)?.title ?? "",
          cueId: row.cue_id,
          timestampMs: row.timestamp_ms,
          originalSentence: row.original_sentence,
          createdAt: row.created_at,
        }),
      ),
    ),
    analyses,
  });
}
