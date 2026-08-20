import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { WorkspaceId } from "../domain/identifiers";
import type { Phase6Store } from "../phase6/phase6-store";
import type { BackupConflictPolicy, BackupPreflight, BackupService } from "./backup-service";

export type BackupFileError = Readonly<{
  code: "CANCELLED" | "UNAVAILABLE" | "INVALID_ARCHIVE" | "IO_FAILURE";
  message: string;
}>;

export type BackupFileResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: BackupFileError }>;

export type ExpoBackupFiles = Readonly<{
  exportAndShare(
    workspaceId: Parameters<BackupService["create"]>[0],
  ): Promise<BackupFileResult<Readonly<{ name: string; size: number }>>>;
  pickAndPreflight(): Promise<
    BackupFileResult<Readonly<{ archive: Uint8Array; preview: BackupPreflight }>>
  >;
  restorePicked(
    archive: Uint8Array,
    policy: BackupConflictPolicy,
    dryRun?: boolean,
  ): ReturnType<BackupService["restore"]>;
}>;

function failure(code: BackupFileError["code"], message: string): BackupFileResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function backupName(now: Date): string {
  return `workspace-backup-${now.toISOString().replace(/[:.]/g, "-")}.vmbak`;
}

export function createExpoBackupFiles(
  service: BackupService,
  options: Readonly<{
    now: () => Date;
    createId: () => string;
    store: Phase6Store;
    sha256: (contents: Uint8Array) => Promise<string>;
  }>,
): ExpoBackupFiles {
  return Object.freeze({
    async exportAndShare(workspaceId) {
      if (!(await Sharing.isAvailableAsync()))
        return failure("UNAVAILABLE", "System sharing is unavailable");
      const created = await service.create(workspaceId);
      if (!created.ok) return failure("IO_FAILURE", created.error.message);
      const createdAt = options.now();
      const backupId = options.createId();
      const name = backupName(createdAt);
      const file = new File(Paths.cache, name);
      try {
        file.create({ overwrite: false, intermediates: true });
        file.write(created.value);
        await Sharing.shareAsync(file.uri, {
          dialogTitle: "Export Inkstone backup",
          mimeType: "application/zip",
          UTI: "public.zip-archive",
        });
        try {
          await options.store.recordBackup(
            Object.freeze({
              id: backupId,
              workspaceId: workspaceId as WorkspaceId,
              destinationUri: `shared://${name}`,
              checksum: await options.sha256(created.value),
              size: created.value.byteLength,
              status: "completed",
              createdAt: createdAt.toISOString(),
            }),
          );
        } catch {
          // The shared archive is already verified; metadata failure must not report it as lost.
        }
        return Object.freeze({
          ok: true,
          value: Object.freeze({ name, size: created.value.byteLength }),
        });
      } catch {
        return failure("IO_FAILURE", "The backup file could not be shared");
      } finally {
        try {
          if (file.exists) file.delete();
        } catch {
          /* Cache cleanup is best effort after sharing. */
        }
      }
    },
    async pickAndPreflight() {
      try {
        const picked = await File.pickFileAsync({
          mimeTypes: ["application/zip", "application/octet-stream"],
        });
        if (picked.canceled || !picked.result)
          return failure("CANCELLED", "Backup selection was cancelled");
        const archive = await picked.result.bytes();
        const preview = await service.preflight(archive);
        return preview.ok
          ? Object.freeze({ ok: true, value: Object.freeze({ archive, preview: preview.value }) })
          : failure("INVALID_ARCHIVE", preview.error.message);
      } catch {
        return failure("IO_FAILURE", "The selected backup could not be read");
      }
    },
    restorePicked(archive, policy, dryRun = false) {
      return service.restore(archive, policy, dryRun);
    },
  });
}
