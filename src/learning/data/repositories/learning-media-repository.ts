import type {
  LearningSqlDatabase,
  LearningSqlParameter,
} from "../migrations/learning-migration-runner";

export type LearningMediaRecord = Readonly<{
  id: string;
  title: string;
  description: string;
  language: string;
  source: string;
  provider: string | null;
  content: string;
  mediaUri: string | null;
  mediaKind: string | null;
  sourceUrl: string | null;
  durationMs: number | null;
  thumbnailUri: string | null;
  createdAt: string;
  updatedAt: string;
  positionMs: number;
  lastLearnedAt: string | null;
  activeTrackId: string | null;
}>;

export type TranscriptTrackRecord = Readonly<{
  id: string;
  mediaId: string;
  label: string;
  language: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}>;

export type TranscriptCueRecord = Readonly<{
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

export interface LearningMediaFileRepository {
  remove(uri: string): Promise<void>;
}

export class LearningMediaRepository {
  public constructor(
    private readonly database: LearningSqlDatabase,
    private readonly files: LearningMediaFileRepository,
  ) {}

  public async listMedia(
    input: Readonly<{
      search: string;
      mediaKind: string | null;
      source: string | null;
      sort: "recentlyLearned" | "createdAt";
    }>,
  ): Promise<readonly LearningMediaRecord[]> {
    const clauses = ["deleted_at IS NULL"];
    const params: LearningSqlParameter[] = [];
    if (input.search.trim()) {
      clauses.push("(title LIKE ? OR content LIKE ?)");
      const query = `%${input.search.trim()}%`;
      params.push(query, query);
    }
    if (input.mediaKind) {
      clauses.push("media_kind = ?");
      params.push(input.mediaKind);
    }
    if (input.source) {
      clauses.push("source = ?");
      params.push(input.source);
    }
    const order =
      input.sort === "recentlyLearned"
        ? "activity.last_learned_at DESC, media.updated_at DESC"
        : "media.created_at DESC";
    return this.database.getAllAsync<LearningMediaRecord>(
      `SELECT media.id, media.title, media.description, media.language, media.source, media.provider,
              media.content, media.media_uri AS mediaUri, media.media_kind AS mediaKind, media.source_url AS sourceUrl,
              media.duration_ms AS durationMs, media.thumbnail_uri AS thumbnailUri, media.created_at AS createdAt,
              media.updated_at AS updatedAt, COALESCE(progress.position_ms, 0) AS positionMs,
              activity.last_learned_at AS lastLearnedAt, active.track_id AS activeTrackId
       FROM learning_media media
       LEFT JOIN playback_progress progress ON progress.media_id = media.id
       LEFT JOIN active_transcript_tracks active ON active.media_id = media.id
       LEFT JOIN (SELECT media_id, MAX(ended_at) AS last_learned_at FROM learning_activity GROUP BY media_id) activity
         ON activity.media_id = media.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY ${order}`,
      ...params,
    );
  }

  public async listTracks(mediaId: string): Promise<readonly TranscriptTrackRecord[]> {
    return this.database.getAllAsync<TranscriptTrackRecord>(
      "SELECT id, media_id AS mediaId, label, language, source, created_at AS createdAt, updated_at AS updatedAt FROM transcript_tracks WHERE media_id = ? ORDER BY created_at",
      mediaId,
    );
  }

  public async listCues(trackId: string): Promise<readonly TranscriptCueRecord[]> {
    return this.database.getAllAsync<TranscriptCueRecord>(
      `SELECT id, track_id AS trackId, media_id AS mediaId, cue_order AS \"order\", text, translation,
              start_ms AS startMs, end_ms AS endMs, source_audio_uri AS sourceAudioUri
       FROM transcript_cues WHERE track_id = ? ORDER BY cue_order`,
      trackId,
    );
  }

  public async setActiveTrack(mediaId: string, trackId: string, updatedAt: string): Promise<void> {
    const track = await this.database.getFirstAsync<Readonly<{ id: string }>>(
      "SELECT id FROM transcript_tracks WHERE id = ? AND media_id = ?",
      trackId,
      mediaId,
    );
    if (!track) throw new Error("所选字幕轨不属于当前媒体。");
    await this.database.runAsync(
      `INSERT INTO active_transcript_tracks (media_id, track_id, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(media_id) DO UPDATE SET track_id = excluded.track_id, updated_at = excluded.updated_at`,
      mediaId,
      trackId,
      updatedAt,
    );
  }

  public async savePlaybackProgress(
    input: Readonly<{
      mediaId: string;
      positionMs: number;
      activeCueId: string | null;
      playbackRate: number;
      volume: number;
      playedDeltaMs: number;
      occurredAt: string;
    }>,
  ): Promise<void> {
    await this.database.withTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO playback_progress (media_id, position_ms, active_cue_id, playback_rate, volume, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(media_id) DO UPDATE SET position_ms = excluded.position_ms, active_cue_id = excluded.active_cue_id,
           playback_rate = excluded.playback_rate, volume = excluded.volume, updated_at = excluded.updated_at`,
        input.mediaId,
        Math.max(0, Math.round(input.positionMs)),
        input.activeCueId,
        input.playbackRate,
        Math.max(0, Math.min(1, input.volume)),
        input.occurredAt,
      );
      if (input.playedDeltaMs > 0) {
        await transaction.runAsync(
          "INSERT INTO learning_activity (id, media_id, started_at, ended_at, played_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          `activity-${input.mediaId}-${input.occurredAt}`,
          input.mediaId,
          input.occurredAt,
          input.occurredAt,
          Math.round(input.playedDeltaMs),
          input.occurredAt,
        );
      }
    });
  }

  public async deleteMedia(mediaId: string, deletedAt: string): Promise<void> {
    const media = await this.database.getFirstAsync<
      Readonly<{ media_uri: string | null; thumbnail_uri: string | null }>
    >(
      "SELECT media_uri, thumbnail_uri FROM learning_media WHERE id = ? AND deleted_at IS NULL",
      mediaId,
    );
    if (!media) return;
    const recordings = await this.database.getAllAsync<Readonly<{ file_uri: string }>>(
      "SELECT file_uri FROM echo_recordings WHERE media_id = ?",
      mediaId,
    );
    await this.database.runAsync(
      "UPDATE learning_media SET deleted_at = ?, updated_at = ? WHERE id = ?",
      deletedAt,
      deletedAt,
      mediaId,
    );
    const files = [
      media.media_uri,
      media.thumbnail_uri,
      ...recordings.map((recording) => recording.file_uri),
    ].filter((uri): uri is string => Boolean(uri));
    await Promise.all(files.map((uri) => this.files.remove(uri)));
  }
}
