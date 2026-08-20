import { describe, expect, test, vi } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import {
  createAutomaticBackup,
  selectRetainedBackupNames,
} from "../../../src/backup/automatic-backup";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

describe("automatic backup", () => {
  test("removes only generated backups outside count or age retention", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const files = [
      {
        name: "workspace-backup-2026-08-01T00-00-00-000Z-123e4567-e89b-42d3-a456-426614174000.vmbak",
        modifiedAt: now.getTime(),
        size: 1,
      },
      {
        name: "workspace-backup-2026-06-01T00-00-00-000Z-223e4567-e89b-42d3-a456-426614174000.vmbak",
        modifiedAt: Date.parse("2026-06-01T00:00:00.000Z"),
        size: 1,
      },
      { name: "workspace-backup-personal.vmbak", modifiedAt: 0, size: 1 },
      { name: "family-photo.zip", modifiedAt: 0, size: 1 },
    ];
    expect(
      selectRetainedBackupNames(files, now, {
        enabled: true,
        intervalHours: 24,
        retentionDays: 30,
        maxBackups: 10,
      }),
    ).toEqual([
      "workspace-backup-2026-06-01T00-00-00-000Z-223e4567-e89b-42d3-a456-426614174000.vmbak",
    ]);
  });

  test("writes a due backup, records checksum metadata, and skips before the interval", async () => {
    const write = vi.fn(async (name: string) => `content://backups/${name}`);
    const recordBackup = vi.fn();
    const automatic = createAutomaticBackup({
      workspaceId: WORKSPACE_ID,
      service: {
        create: vi.fn(async () => ({ ok: true, value: new Uint8Array([1, 2, 3]) })),
      } as never,
      destination: {
        uri: "content://backups",
        write,
        list: vi.fn(async () => []),
        remove: vi.fn(),
      },
      store: { recordBackup } as never,
      policy: { enabled: true, intervalHours: 24, retentionDays: 30, maxBackups: 30 },
      createId: () => "323e4567-e89b-42d3-a456-426614174000",
      now: () => new Date("2026-08-01T00:00:00.000Z"),
      sha256: async () => "checksum",
    });

    expect(await automatic.runIfDue("2026-07-31T12:00:00.000Z")).toBe("not-due");
    expect(await automatic.runIfDue("2026-07-30T00:00:00.000Z")).toBe("completed");
    expect(write).toHaveBeenCalledOnce();
    expect(recordBackup).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: "checksum", size: 3 }),
    );
  });
});
