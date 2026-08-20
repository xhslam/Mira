import { describe, expect, test } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { createAutomaticBackupConfigStore } from "../../../src/backup/automatic-backup-config";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

describe("automatic backup config", () => {
  test("persists a workspace-scoped validated destination and policy", async () => {
    let data: ReadonlyMap<string, string> = new Map();
    const storage = {
      read: async (path: string) => data.get(path) ?? null,
      write: async (path: string, contents: string) => {
        data = new Map([...data, [path, contents]]);
      },
      remove: async (path: string) => {
        data = new Map([...data].filter(([key]) => key !== path));
      },
      move: async () => undefined,
      exists: async () => false,
    } satisfies VaultStorage;
    const store = createAutomaticBackupConfigStore(storage, WORKSPACE_ID);
    await store.save({
      version: 1,
      destinationUri: "content://backups",
      policy: { enabled: true, intervalHours: 24, retentionDays: 30, maxBackups: 30 },
      lastCompletedAt: null,
    });

    expect(await store.load()).toMatchObject({
      destinationUri: "content://backups",
      policy: { enabled: true },
    });
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
