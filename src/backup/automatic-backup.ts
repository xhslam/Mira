import type { WorkspaceId } from "../domain/identifiers";
import type { Phase6Store } from "../phase6/phase6-store";
import type { BackupService } from "./backup-service";

export type AutomaticBackupPolicy = Readonly<{
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  maxBackups: number;
}>;

export const DEFAULT_AUTOMATIC_BACKUP_POLICY: AutomaticBackupPolicy = Object.freeze({
  enabled: false,
  intervalHours: 24,
  retentionDays: 30,
  maxBackups: 30,
});

export type BackupDestinationFile = Readonly<{ name: string; modifiedAt: number; size: number }>;
export type BackupDestination = Readonly<{
  uri: string;
  write(name: string, contents: Uint8Array): Promise<string>;
  list(): Promise<readonly BackupDestinationFile[]>;
  remove(name: string): Promise<void>;
}>;

export type AutomaticBackup = Readonly<{
  runIfDue(lastCompletedAt: string | null): Promise<"disabled" | "not-due" | "completed">;
  runNow(): Promise<"completed">;
}>;

export function selectRetainedBackupNames(
  files: readonly BackupDestinationFile[],
  now: Date,
  policy: AutomaticBackupPolicy,
): readonly string[] {
  const cutoff = now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1_000;
  const generated = files
    .filter((file) =>
      /^workspace-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f-]{36}\.vmbak$/iu.test(
        file.name,
      ),
    )
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  return Object.freeze(
    generated
      .filter((file, index) => index >= policy.maxBackups || file.modifiedAt < cutoff)
      .map((file) => file.name),
  );
}

export function createAutomaticBackup(
  options: Readonly<{
    workspaceId: WorkspaceId;
    service: BackupService;
    destination: BackupDestination;
    store: Phase6Store;
    policy: AutomaticBackupPolicy;
    createId: () => string;
    now: () => Date;
    sha256: (contents: Uint8Array) => Promise<string>;
  }>,
): AutomaticBackup {
  const policy = options.policy;
  if (policy.intervalHours <= 0 || policy.retentionDays <= 0 || policy.maxBackups <= 0) {
    throw new Error("Automatic backup policy must use positive limits");
  }

  async function runNow(): Promise<"completed"> {
    const createdAt = options.now();
    const backupId = options.createId();
    const archive = await options.service.create(options.workspaceId);
    if (!archive.ok) throw new Error(archive.error.message);
    const name = `workspace-backup-${createdAt.toISOString().replace(/[:.]/g, "-")}-${backupId}.vmbak`;
    const destinationUri = await options.destination.write(name, archive.value);
    try {
      await options.store.recordBackup(
        Object.freeze({
          id: backupId,
          workspaceId: options.workspaceId,
          destinationUri,
          checksum: await options.sha256(archive.value),
          size: archive.value.byteLength,
          status: "completed",
          createdAt: createdAt.toISOString(),
        }),
      );
    } catch {
      // A verified destination file remains a successful backup if local metadata is unavailable.
    }
    const expired = selectRetainedBackupNames(await options.destination.list(), createdAt, policy);
    for (const expiredName of expired) await options.destination.remove(expiredName);
    return "completed";
  }

  return Object.freeze({
    async runIfDue(lastCompletedAt) {
      if (!policy.enabled) return "disabled";
      if (lastCompletedAt) {
        const nextDue = Date.parse(lastCompletedAt) + policy.intervalHours * 60 * 60 * 1_000;
        if (Number.isFinite(nextDue) && options.now().getTime() < nextDue) return "not-due";
      }
      return runNow();
    },
    runNow,
  });
}
