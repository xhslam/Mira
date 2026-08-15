export const LEARNING_DATABASE_VERSION = 1;

export const LEARNING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS learning_schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_media (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  provider TEXT,
  content TEXT NOT NULL,
  media_uri TEXT,
  media_kind TEXT,
  source_url TEXT,
  duration_ms INTEGER,
  thumbnail_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS transcript_tracks (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transcript_cues (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES transcript_tracks(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  cue_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  translation TEXT,
  start_ms INTEGER,
  end_ms INTEGER,
  source_audio_uri TEXT,
  UNIQUE(track_id, cue_order)
);
CREATE INDEX IF NOT EXISTS transcript_cues_track_order ON transcript_cues(track_id, cue_order);
CREATE INDEX IF NOT EXISTS transcript_cues_media_time ON transcript_cues(media_id, start_ms, end_ms);
CREATE TABLE IF NOT EXISTS active_transcript_tracks (
  media_id TEXT PRIMARY KEY NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES transcript_tracks(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playback_progress (
  media_id TEXT PRIMARY KEY NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  position_ms INTEGER NOT NULL,
  active_cue_id TEXT,
  playback_rate REAL NOT NULL DEFAULT 1,
  volume REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_activity (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  played_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_activity_media_time ON learning_activity(media_id, ended_at);
CREATE TABLE IF NOT EXISTS saved_terms (
  id TEXT PRIMARY KEY NOT NULL,
  normalized_text TEXT NOT NULL,
  display_text TEXT NOT NULL,
  language TEXT NOT NULL,
  definition TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(normalized_text, language)
);
CREATE TABLE IF NOT EXISTS term_encounters (
  id TEXT PRIMARY KEY NOT NULL,
  term_id TEXT NOT NULL REFERENCES saved_terms(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  cue_id TEXT REFERENCES transcript_cues(id) ON DELETE SET NULL,
  timestamp_ms INTEGER,
  original_sentence TEXT NOT NULL,
  previous_sentence TEXT,
  next_sentence TEXT,
  explanation TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(term_id, media_id, cue_id, timestamp_ms)
);
CREATE TABLE IF NOT EXISTS sentence_analyses (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  cue_id TEXT NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  model_key TEXT NOT NULL,
  analysis_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(media_id, cue_id, source_hash, model_key, analysis_version)
);
CREATE TABLE IF NOT EXISTS echo_recordings (
  id TEXT PRIMARY KEY NOT NULL,
  media_id TEXT NOT NULL REFERENCES learning_media(id) ON DELETE CASCADE,
  cue_id TEXT NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
  sentence_text TEXT NOT NULL,
  start_ms INTEGER,
  end_ms INTEGER,
  file_uri TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  transcript TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pronunciation_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  recording_id TEXT NOT NULL UNIQUE REFERENCES echo_recordings(id) ON DELETE CASCADE,
  provider TEXT,
  state TEXT NOT NULL,
  payload_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS craft_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  source_key TEXT NOT NULL,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, source_key)
);
CREATE TABLE IF NOT EXISTS feed_entries (
  id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, external_id)
);
CREATE TABLE IF NOT EXISTS learning_legacy_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_json TEXT NOT NULL,
  migrated_at TEXT NOT NULL,
  migration_version INTEGER NOT NULL
);
`;
