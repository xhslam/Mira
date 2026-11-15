import { z } from "zod";
import type { SearchDatabase } from "../search/sqlite-search-index";
import { immutable } from "../agent/agent-types";

export const memoryEntrySchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    category: z.enum(["profile", "preferences", "topic"]),
    content: z.string().trim().min(1).max(8000),
    enabled: z.boolean(),
    source: z
      .object({
        conversationId: z.string().uuid(),
        messageId: z.string().uuid(),
        quote: z.string().max(8000),
      })
      .strict()
      .nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type MemoryEntry = Readonly<z.infer<typeof memoryEntrySchema>>;
export type MemoryStore = Readonly<{
  list(workspaceId: string): Promise<readonly MemoryEntry[]>;
  save(entry: MemoryEntry): Promise<void>;
  remove(workspaceId: string, id: string): Promise<void>;
  isEnabled(workspaceId: string): Promise<boolean>;
  setEnabled(workspaceId: string, enabled: boolean): Promise<void>;
}>;

/** Separate additive tables: existing chat and retired Agent state remain readable. */
export function createMemoryStore(db: SearchDatabase): MemoryStore {
  let ready: Promise<void> | undefined;
  const initialize = () =>
    (ready ??= db.execAsync(`
    CREATE TABLE IF NOT EXISTS ai_memories (workspace_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id, id));
    CREATE TABLE IF NOT EXISTS ai_memory_policy (workspace_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
  `));
  return Object.freeze({
    async list(workspaceId) {
      await initialize();
      const rows = await db.getAllAsync<{ data: string }>(
        "SELECT data FROM ai_memories WHERE workspace_id = ? ORDER BY id",
        workspaceId,
      );
      return immutable(
        rows.map((row) => {
          const entry = memoryEntrySchema.parse(JSON.parse(row.data));
          if (entry.workspaceId !== workspaceId) throw new Error("记忆工作区不匹配");
          return entry;
        }),
      );
    },
    async save(input) {
      const entry = memoryEntrySchema.parse(input);
      await initialize();
      await db.runAsync(
        "INSERT OR REPLACE INTO ai_memories (workspace_id, id, data) VALUES (?, ?, ?)",
        entry.workspaceId,
        entry.id,
        JSON.stringify(entry),
      );
    },
    async remove(workspaceId, id) {
      await initialize();
      await db.runAsync(
        "DELETE FROM ai_memories WHERE workspace_id = ? AND id = ?",
        workspaceId,
        id,
      );
    },
    async isEnabled(workspaceId) {
      await initialize();
      const row = await db.getFirstAsync<{ enabled: number }>(
        "SELECT enabled FROM ai_memory_policy WHERE workspace_id = ?",
        workspaceId,
      );
      return row?.enabled !== 0;
    },
    async setEnabled(workspaceId, enabled) {
      await initialize();
      await db.runAsync(
        "INSERT OR REPLACE INTO ai_memory_policy (workspace_id, enabled) VALUES (?, ?)",
        workspaceId,
        enabled ? 1 : 0,
      );
    },
  });
}
