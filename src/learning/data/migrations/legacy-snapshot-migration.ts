import type {
  LearningRecording,
  LearningResource,
  LearningSnapshot,
  LearningTranscriptTrack,
} from "../../learning-types";

export type SqlWrite = Readonly<{ sql: string; params: readonly (string | number | null)[] }>;

export type LegacyMigrationPlan = Readonly<{
  backupJson: string;
  writes: readonly SqlWrite[];
  expected: Readonly<{
    media: number;
    tracks: number;
    cues: number;
    recordings: number;
    savedTerms: number;
  }>;
}>;

function legacyTrack(resource: LearningResource): LearningTranscriptTrack {
  return Object.freeze({
    id: `legacy-track-${resource.id}`,
    resourceId: resource.id,
    label: "主字幕",
    language: resource.language,
    source: "manual",
    isPrimary: true,
    sentences: resource.sentences,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  });
}

function mediaWrite(resource: LearningResource): SqlWrite {
  return Object.freeze({
    sql: `INSERT OR REPLACE INTO learning_media (
      id, title, description, language, source, provider, content, media_uri, media_kind,
      source_url, duration_ms, thumbnail_uri, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    params: [
      resource.id,
      resource.title,
      resource.description,
      resource.language,
      resource.source,
      resource.provider ?? null,
      resource.content,
      resource.mediaUri ?? null,
      resource.mediaKind ?? null,
      resource.sourceUrl ?? null,
      resource.durationMs ?? null,
      resource.thumbnailUri ?? null,
      resource.createdAt,
      resource.updatedAt,
    ],
  });
}

function recordingWrite(
  recording: LearningRecording,
  mediaId: string,
  resource: LearningResource,
): SqlWrite {
  const sentence = resource.sentences.find((item) => item.id === recording.sentenceId);
  return Object.freeze({
    sql: `INSERT OR REPLACE INTO echo_recordings (
      id, media_id, cue_id, sentence_text, start_ms, end_ms, file_uri, duration_ms, transcript, state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      recording.id,
      mediaId,
      recording.sentenceId,
      sentence?.text ?? "",
      sentence?.startMs ?? null,
      sentence?.endMs ?? null,
      recording.uri,
      recording.durationMs,
      recording.transcript,
      recording.state,
      recording.createdAt,
    ],
  });
}

export function createLegacyMigrationPlan(snapshot: LearningSnapshot): LegacyMigrationPlan {
  const writes: SqlWrite[] = [];
  const tracksByResource = new Map<string, readonly LearningTranscriptTrack[]>();
  snapshot.transcriptTracks.forEach((track) => {
    const current = tracksByResource.get(track.resourceId) ?? [];
    tracksByResource.set(track.resourceId, [...current, track]);
  });
  const mediaBySentenceId = new Map<string, LearningResource>();
  let trackCount = 0;
  let cueCount = 0;

  snapshot.resources.forEach((resource) => {
    writes.push(mediaWrite(resource));
    resource.sentences.forEach((sentence) => mediaBySentenceId.set(sentence.id, resource));
    const tracks = tracksByResource.get(resource.id) ?? [legacyTrack(resource)];
    tracks.forEach((track) => {
      trackCount += 1;
      writes.push(
        Object.freeze({
          sql: `INSERT OR REPLACE INTO transcript_tracks (id, media_id, label, language, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            track.id,
            resource.id,
            track.label,
            track.language,
            track.source,
            track.createdAt,
            track.updatedAt,
          ],
        }),
      );
      track.sentences.forEach((sentence) => {
        cueCount += 1;
        writes.push(
          Object.freeze({
            sql: `INSERT OR REPLACE INTO transcript_cues (
              id, track_id, media_id, cue_order, text, translation, start_ms, end_ms, source_audio_uri
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
              sentence.id,
              track.id,
              resource.id,
              sentence.order,
              sentence.text,
              sentence.translation,
              sentence.startMs,
              sentence.endMs,
              sentence.sourceAudioUri,
            ],
          }),
        );
      });
      if (track.isPrimary) {
        writes.push(
          Object.freeze({
            sql: `INSERT OR REPLACE INTO active_transcript_tracks (media_id, track_id, updated_at) VALUES (?, ?, ?)`,
            params: [resource.id, track.id, track.updatedAt],
          }),
        );
      }
    });
  });

  snapshot.practice.forEach((progress) => {
    writes.push(
      Object.freeze({
        sql: `INSERT OR REPLACE INTO playback_progress (
          media_id, position_ms, active_cue_id, playback_rate, volume, updated_at
        ) VALUES (?, ?, ?, 1, 1, ?)`,
        params: [
          progress.resourceId,
          progress.lastPositionMs,
          progress.sentenceId,
          progress.updatedAt,
        ],
      }),
    );
  });

  snapshot.savedItems.forEach((saved) => {
    const normalizedText = saved.term.trim().toLocaleLowerCase();
    const termId = `term-${saved.kind}-${normalizedText}`;
    writes.push(
      Object.freeze({
        sql: `INSERT OR IGNORE INTO saved_terms (
          id, normalized_text, display_text, language, definition, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [
          termId,
          normalizedText,
          saved.term,
          "en",
          saved.translation,
          saved.createdAt,
          saved.createdAt,
        ],
      }),
    );
    writes.push(
      Object.freeze({
        sql: `INSERT OR IGNORE INTO term_encounters (
          id, term_id, media_id, cue_id, timestamp_ms, original_sentence, previous_sentence, next_sentence, explanation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        params: [
          `encounter-${saved.id}`,
          termId,
          saved.mediaId,
          saved.cueId,
          saved.timestampMs,
          saved.originalSentence,
          saved.explanation,
          saved.createdAt,
        ],
      }),
    );
  });

  snapshot.recordings.forEach((recording) => {
    const resource = mediaBySentenceId.get(recording.sentenceId);
    if (resource) writes.push(recordingWrite(recording, resource.id, resource));
  });

  snapshot.analyses.forEach((analysis) => {
    writes.push(
      Object.freeze({
        sql: `INSERT OR REPLACE INTO sentence_analyses (
          id, media_id, cue_id, source_hash, model_key, analysis_version, payload_json, state, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          analysis.id,
          analysis.resourceId,
          analysis.sentenceId,
          analysis.sourceHash,
          "legacy",
          analysis.version,
          JSON.stringify({
            sentencePatterns: analysis.sentencePatterns,
            keyPhrases: analysis.keyPhrases,
            grammarPoints: analysis.grammarPoints,
            contextualExplanation: analysis.contextualExplanation,
          }),
          analysis.state,
          analysis.error,
          analysis.updatedAt,
          analysis.updatedAt,
        ],
      }),
    );
  });

  return Object.freeze({
    backupJson: JSON.stringify(snapshot),
    writes: Object.freeze(writes),
    expected: Object.freeze({
      media: snapshot.resources.length,
      tracks: trackCount,
      cues: cueCount,
      recordings: snapshot.recordings.filter((recording) =>
        mediaBySentenceId.has(recording.sentenceId),
      ).length,
      savedTerms: new Set(snapshot.savedItems.map((saved) => saved.term.trim().toLocaleLowerCase()))
        .size,
    }),
  });
}
