import type { LearningSnapshot } from "../../learning-types";
import { LEARNING_DATABASE_VERSION, LEARNING_SCHEMA_SQL } from "../database/learning-schema";
import { createLegacyMigrationPlan } from "./legacy-snapshot-migration";

export type LearningSqlParameter = string | number | null;

export interface LearningSqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: readonly LearningSqlParameter[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: readonly LearningSqlParameter[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: readonly LearningSqlParameter[]): Promise<readonly T[]>;
  withTransactionAsync(task: (transaction: LearningSqlDatabase) => Promise<void>): Promise<void>;
}

type CountRow = Readonly<{ count: number }>;

async function tableCount(database: LearningSqlDatabase, table: string): Promise<number> {
  const row = await database.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`);
  return row?.count ?? 0;
}

export async function migrateLegacyLearningSnapshot(
  database: LearningSqlDatabase,
  snapshot: LearningSnapshot,
  now: () => Date = () => new Date(),
): Promise<Readonly<{ migrated: boolean; backupId: number | null }>> {
  await database.execAsync("PRAGMA foreign_keys = ON;");
  await database.execAsync(LEARNING_SCHEMA_SQL);
  const previous = await database.getFirstAsync<Readonly<{ version: number }>>(
    "SELECT version FROM learning_schema_migrations WHERE version = ?",
    LEARNING_DATABASE_VERSION,
  );
  if (previous) return Object.freeze({ migrated: false, backupId: null });

  const plan = createLegacyMigrationPlan(snapshot);
  const migratedAt = now().toISOString();
  await database.withTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "INSERT INTO learning_legacy_backups (snapshot_json, migrated_at, migration_version) VALUES (?, ?, ?)",
      plan.backupJson,
      migratedAt,
      LEARNING_DATABASE_VERSION,
    );
    for (const write of plan.writes) await transaction.runAsync(write.sql, ...write.params);

    const mediaCount = await tableCount(transaction, "learning_media");
    const trackCount = await tableCount(transaction, "transcript_tracks");
    const cueCount = await tableCount(transaction, "transcript_cues");
    const recordingCount = await tableCount(transaction, "echo_recordings");
    const termCount = await tableCount(transaction, "saved_terms");
    if (
      mediaCount < plan.expected.media ||
      trackCount < plan.expected.tracks ||
      cueCount < plan.expected.cues ||
      recordingCount < plan.expected.recordings ||
      termCount < plan.expected.savedTerms
    ) {
      throw new Error("学习数据迁移校验失败：写入数量不完整，已回滚到旧快照。");
    }
    await transaction.runAsync(
      "INSERT INTO learning_schema_migrations (version, applied_at) VALUES (?, ?)",
      LEARNING_DATABASE_VERSION,
      migratedAt,
    );
  });
  return Object.freeze({ migrated: true, backupId: null });
}
