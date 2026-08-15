import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import {
  createInitialLearningSnapshot,
  normalizeLearningSnapshot,
  type LearningSnapshot,
} from "./learning-types";
import {
  migrateLegacyLearningSnapshot,
  type LearningSqlDatabase,
  type LearningSqlParameter,
} from "./data/migrations/learning-migration-runner";
import {
  readNormalizedLearningSnapshot,
  writeNormalizedLearningSnapshot,
} from "./data/migrations/learning-snapshot-projection";

const DATABASE_NAME = "inkstone-learning-v1.db";
const SNAPSHOT_KEY = "learning.snapshot.v1";

export type LearningStore = Readonly<{
  initialize(): Promise<void>;
  load(): Promise<LearningSnapshot>;
  save(snapshot: LearningSnapshot): Promise<void>;
}>;

let sharedDatabasePromise: Promise<SQLiteDatabase> | null = null;
let sharedWriteChain: Promise<void> = Promise.resolve();

async function learningDatabase(): Promise<SQLiteDatabase> {
  if (!sharedDatabasePromise) {
    const opening = openDatabaseAsync(DATABASE_NAME).then(async (opened) => {
      await opened.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS learning_kv (
          key TEXT PRIMARY KEY NOT NULL,
          value_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return opened;
    });
    sharedDatabasePromise = opening.catch((reason: unknown) => {
      // A failed native open cannot be reused. The next entry can safely retry.
      sharedDatabasePromise = null;
      throw reason;
    });
  }
  return sharedDatabasePromise;
}

function adaptLearningDatabase(database: SQLiteDatabase): LearningSqlDatabase {
  const adapted: LearningSqlDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, ...params) => database.runAsync(source, ...params),
    getFirstAsync: <T>(source: string, ...params: readonly LearningSqlParameter[]) =>
      database.getFirstAsync<T>(source, ...params),
    getAllAsync: <T>(source: string, ...params: readonly LearningSqlParameter[]) =>
      database.getAllAsync<T>(source, ...params),
    withTransactionAsync: (task: (transaction: LearningSqlDatabase) => Promise<void>) =>
      database.withTransactionAsync(() => task(adapted)),
  };
  return adapted;
}

async function migrateLegacySnapshot(database: SQLiteDatabase): Promise<void> {
  const snapshot = await readLegacySnapshot();
  const adapted = adaptLearningDatabase(database);
  await migrateLegacyLearningSnapshot(adapted, snapshot);
  const projected = await readNormalizedLearningSnapshot(adapted);
  if (!projected)
    await writeNormalizedLearningSnapshot(adapted, snapshot, new Date().toISOString());
}

async function readLegacySnapshot(): Promise<LearningSnapshot> {
  const opened = await learningDatabase();
  const row = await opened.getFirstAsync<Readonly<{ value_json: string }>>(
    "SELECT value_json FROM learning_kv WHERE key = ?",
    SNAPSHOT_KEY,
  );
  if (!row) return createInitialLearningSnapshot();
  try {
    return normalizeLearningSnapshot(JSON.parse(row.value_json) as unknown);
  } catch {
    return createInitialLearningSnapshot();
  }
}

export function createExpoLearningStore(): LearningStore {
  return Object.freeze({
    async initialize() {
      const opened = await learningDatabase();
      await migrateLegacySnapshot(opened);
    },
    async load() {
      const opened = await learningDatabase();
      const projected = await readNormalizedLearningSnapshot(adaptLearningDatabase(opened));
      return projected ?? readLegacySnapshot();
    },
    async save(snapshot) {
      sharedWriteChain = sharedWriteChain.then(async () => {
        const opened = await learningDatabase();
        await writeNormalizedLearningSnapshot(
          adaptLearningDatabase(opened),
          snapshot,
          new Date().toISOString(),
        );
      });
      return sharedWriteChain;
    },
  });
}
