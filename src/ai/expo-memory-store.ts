import { openDatabaseAsync } from "expo-sqlite";
import { SQLITE_DATABASE_NAMES } from "../storage/sqlite-database-names";
import { adaptDatabase } from "./expo-ai-store";
import { createMemoryStore, type MemoryStore } from "./memory-store";

export function createExpoMemoryStore(): MemoryStore {
  let pending: Promise<MemoryStore> | undefined;
  const store = () =>
    (pending ??= openDatabaseAsync(SQLITE_DATABASE_NAMES.ai).then((db) =>
      createMemoryStore(adaptDatabase(db)),
    ));
  return {
    list: async (workspace) => (await store()).list(workspace),
    save: async (entry) => (await store()).save(entry),
    remove: async (workspace, id) => (await store()).remove(workspace, id),
    isEnabled: async (workspace) => (await store()).isEnabled(workspace),
    setEnabled: async (workspace, enabled) => (await store()).setEnabled(workspace, enabled),
  };
}
