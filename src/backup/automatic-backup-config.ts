import { z } from "zod";

import type { WorkspaceId } from "../domain/identifiers";
import type { VaultStorage } from "../workspace/vault-storage";
import type { AutomaticBackupPolicy } from "./automatic-backup";

export type AutomaticBackupConfig = Readonly<{
  version: 1;
  destinationUri: string;
  policy: AutomaticBackupPolicy;
  lastCompletedAt: string | null;
}>;

const schema = z
  .object({
    version: z.literal(1),
    destinationUri: z.string().min(1).max(8_192),
    policy: z
      .object({
        enabled: z.boolean(),
        intervalHours: z.number().positive(),
        retentionDays: z.number().positive(),
        maxBackups: z.number().int().positive(),
      })
      .strict(),
    lastCompletedAt: z.string().datetime().nullable(),
  })
  .strict();

export type AutomaticBackupConfigStore = Readonly<{
  load(): Promise<AutomaticBackupConfig | null>;
  save(config: AutomaticBackupConfig): Promise<void>;
  clear(): Promise<void>;
}>;

export function createAutomaticBackupConfigStore(
  storage: VaultStorage,
  workspaceId: WorkspaceId,
): AutomaticBackupConfigStore {
  const path = `workspace-state/${workspaceId}/automatic-backup.json`;
  return Object.freeze({
    async load() {
      const raw = await storage.read(path);
      if (raw === null) return null;
      try {
        return Object.freeze(schema.parse(JSON.parse(raw) as unknown));
      } catch {
        throw new Error("Automatic backup configuration is invalid");
      }
    },
    async save(config) {
      await storage.write(path, JSON.stringify(schema.parse(config)));
    },
    async clear() {
      await storage.remove(path);
    },
  });
}
