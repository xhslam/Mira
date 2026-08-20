import { Directory, File } from "expo-file-system";
import * as Crypto from "expo-crypto";

import type { WorkspaceId } from "../domain/identifiers";
import type { Phase6Store } from "../phase6/phase6-store";
import type { BackupService } from "./backup-service";
import {
  createAutomaticBackup,
  DEFAULT_AUTOMATIC_BACKUP_POLICY,
  type BackupDestination,
} from "./automatic-backup";
import type { AutomaticBackupConfigStore } from "./automatic-backup-config";

export type AutomaticBackupManager = Readonly<{
  configure(): Promise<"configured" | "cancelled">;
  runIfDue(): Promise<"not-configured" | "disabled" | "not-due" | "completed">;
  runNow(): Promise<"not-configured" | "completed">;
  disable(): Promise<void>;
}>;

function destinationFor(
  directory: Directory,
  sha256: (contents: Uint8Array) => Promise<string>,
): BackupDestination {
  return Object.freeze({
    uri: directory.uri,
    async write(name, contents) {
      const file = directory.createFile(name, "application/zip");
      try {
        file.write(contents);
        const readBack = await file.bytes();
        if ((await sha256(readBack)) !== (await sha256(contents))) {
          throw new Error("Automatic backup read-back verification failed");
        }
        return file.uri;
      } catch (error) {
        try {
          if (file.exists) file.delete();
        } catch {
          // Preserve the original verification failure.
        }
        throw error;
      }
    },
    async list() {
      return Object.freeze(
        directory.list().flatMap((entry) =>
          entry instanceof File
            ? [
                Object.freeze({
                  name: entry.name,
                  modifiedAt: entry.lastModified ?? 0,
                  size: entry.size,
                }),
              ]
            : [],
        ),
      );
    },
    async remove(name) {
      const target = directory.list().find((entry) => entry instanceof File && entry.name === name);
      if (target instanceof File) target.delete();
    },
  });
}

export function createAutomaticBackupManager(
  options: Readonly<{
    workspaceId: WorkspaceId;
    service: BackupService;
    store: Phase6Store;
    configStore: AutomaticBackupConfigStore;
    sha256: (contents: Uint8Array) => Promise<string>;
  }>,
): AutomaticBackupManager {
  async function configuredBackup() {
    const config = await options.configStore.load();
    if (!config) return null;
    const directory = new Directory(config.destinationUri);
    if (!directory.exists) throw new Error("The automatic backup folder is no longer accessible");
    return Object.freeze({
      config,
      service: createAutomaticBackup({
        workspaceId: options.workspaceId,
        service: options.service,
        destination: destinationFor(directory, options.sha256),
        store: options.store,
        policy: config.policy,
        createId: Crypto.randomUUID,
        now: () => new Date(),
        sha256: options.sha256,
      }),
    });
  }

  async function complete(service: Awaited<ReturnType<typeof configuredBackup>>) {
    if (!service) return "not-configured" as const;
    await service.service.runNow();
    await options.configStore.save(
      Object.freeze({
        ...service.config,
        lastCompletedAt: new Date().toISOString(),
      }),
    );
    return "completed" as const;
  }

  return Object.freeze({
    async configure() {
      try {
        const directory = await Directory.pickDirectoryAsync();
        const config = Object.freeze({
          version: 1 as const,
          destinationUri: directory.uri,
          policy: Object.freeze({ ...DEFAULT_AUTOMATIC_BACKUP_POLICY, enabled: true }),
          lastCompletedAt: null,
        });
        await options.configStore.save(config);
        return "configured";
      } catch {
        return "cancelled";
      }
    },
    async runIfDue() {
      const configured = await configuredBackup();
      if (!configured) return "not-configured";
      const result = await configured.service.runIfDue(configured.config.lastCompletedAt);
      if (result === "completed") {
        await options.configStore.save(
          Object.freeze({
            ...configured.config,
            lastCompletedAt: new Date().toISOString(),
          }),
        );
      }
      return result;
    },
    async runNow() {
      return complete(await configuredBackup());
    },
    async disable() {
      await options.configStore.clear();
    },
  });
}
