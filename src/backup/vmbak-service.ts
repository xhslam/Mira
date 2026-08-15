import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import { failure, success } from "../domain/result";
import { createWorkspaceConflictPath } from "../workspace/workspace-browser";
import { parseWorkspacePath } from "../workspace/workspace-path";
import type {
  BackupError,
  BackupManifest,
  BackupPreflight,
  BackupService,
  BackupServiceOptions,
} from "./backup-service";
import type { WorkspaceDocumentSnapshot } from "../workspace/workspace-repository";

const MANIFEST_PATH = "manifest.json";
const CHECKSUMS_PATH = "checksums.json";
const FILE_PREFIX = "files/";
const MAX_ARCHIVE_FILES = 10_000;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const manifestSchema = z
  .object({
    format: z.literal("inkstone-workspace-backup"),
    version: z.literal(1),
    backupId: z.string().min(1),
    workspaceId: z.string().uuid(),
    createdAt: z.string().datetime(),
    fileCount: z.number().int().min(0).max(MAX_ARCHIVE_FILES),
  })
  .strict();
const checksumsSchema = z.record(z.string(), z.string().min(1));

function backupError(code: BackupError["code"], message: string, path: string | null = null) {
  return failure(Object.freeze({ code, message, path }));
}

function safeArchivePath(entry: string): string | null {
  if (!entry.startsWith(FILE_PREFIX) || entry.includes("\\") || entry.includes("\0")) return null;
  const path = entry.slice(FILE_PREFIX.length);
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed.value : null;
}

function decodeJson(input: Uint8Array | undefined): unknown {
  if (!input) throw new Error("Missing archive metadata");
  return JSON.parse(strFromU8(input)) as unknown;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  async function inspect(archive: Uint8Array) {
    let entries: Record<string, Uint8Array>;
    let manifest: BackupManifest;
    let checksums: Record<string, string>;
    try {
      let discoveredFiles = 0;
      let declaredBytes = 0;
      entries = unzipSync(archive, {
        filter: (file) => {
          discoveredFiles += 1;
          declaredBytes += file.originalSize;
          if (discoveredFiles > MAX_ARCHIVE_FILES + 2 || declaredBytes > MAX_ARCHIVE_BYTES) {
            throw new Error("Archive extraction limit exceeded");
          }
          return true;
        },
      });
      const manifestInput = decodeJson(entries[MANIFEST_PATH]);
      if (
        typeof manifestInput === "object" &&
        manifestInput !== null &&
        "version" in manifestInput &&
        manifestInput.version !== 1
      ) {
        return backupError("UNSUPPORTED_VERSION", "The backup version is not supported");
      }
      manifest = Object.freeze(manifestSchema.parse(manifestInput)) as BackupManifest;
      checksums = checksumsSchema.parse(decodeJson(entries[CHECKSUMS_PATH]));
    } catch {
      return backupError("INVALID_ARCHIVE", "The backup archive or its metadata is invalid");
    }
    const fileEntries = Object.entries(entries).filter(([path]) => path.startsWith(FILE_PREFIX));
    if (fileEntries.length !== manifest.fileCount || fileEntries.length > MAX_ARCHIVE_FILES) {
      return backupError("INVALID_ARCHIVE", "The backup file count does not match its manifest");
    }
    let totalBytes = 0;
    const files = [];
    for (const [entryPath, contents] of fileEntries) {
      const path = safeArchivePath(entryPath);
      if (!path)
        return backupError("INVALID_ARCHIVE", "The backup contains an unsafe path", entryPath);
      totalBytes += contents.byteLength;
      if (totalBytes > MAX_ARCHIVE_BYTES)
        return backupError("INVALID_ARCHIVE", "The backup exceeds the restore size limit");
      const checksum = await options.sha256(contents);
      if (checksums[entryPath] !== checksum)
        return backupError("CHECKSUM_MISMATCH", "A backup file failed checksum verification", path);
      files.push(Object.freeze({ path, size: contents.byteLength, checksum, contents }));
    }
    return success(Object.freeze({ manifest, files: Object.freeze(files), totalBytes }));
  }

  async function preflight(archive: Uint8Array) {
    const inspected = await inspect(archive);
    if (!inspected.ok) return inspected;
    let occupied: readonly string[];
    if (options.binaryWorkspace) {
      try {
        occupied = Object.freeze((await options.binaryWorkspace.list()).map((item) => item.path));
      } catch {
        return backupError("IO_FAILURE", "The target workspace could not be inspected");
      }
    } else {
      const current = await options.repository.list();
      if (!current.ok)
        return backupError("IO_FAILURE", "The target workspace could not be inspected");
      occupied = Object.freeze(current.value.map((item) => item.path as string));
    }
    const conflicts = inspected.value.files
      .filter((file) => occupied.includes(file.path))
      .map((file) => file.path);
    const preview: BackupPreflight = Object.freeze({
      manifest: inspected.value.manifest,
      files: Object.freeze(
        inspected.value.files.map((file) =>
          Object.freeze({
            path: file.path,
            size: file.size,
            checksum: file.checksum,
            conflict: conflicts.includes(file.path),
          }),
        ),
      ),
      conflicts: Object.freeze(conflicts),
      totalBytes: inspected.value.totalBytes,
    });
    return success(Object.freeze({ preview, inspected: inspected.value, occupied }));
  }

  return Object.freeze({
    async create(workspaceId) {
      let listedFiles: readonly Readonly<{ path: string; contents: Uint8Array }>[];
      if (options.binaryWorkspace) {
        try {
          listedFiles = await options.binaryWorkspace.list();
        } catch {
          return backupError("IO_FAILURE", "The workspace could not be read for backup");
        }
      } else {
        const listed = await options.repository.list();
        if (!listed.ok)
          return backupError("IO_FAILURE", "The workspace could not be read for backup");
        listedFiles = Object.freeze(
          listed.value.map((document) =>
            Object.freeze({ path: document.path, contents: strToU8(document.markdown) }),
          ),
        );
      }
      const manifest: BackupManifest = Object.freeze({
        format: "inkstone-workspace-backup",
        version: 1,
        backupId: options.createId(),
        workspaceId,
        createdAt: options.now().toISOString(),
        fileCount: listedFiles.length,
      });
      const entries: Record<string, Uint8Array> = {
        [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)),
      };
      const checksums: Record<string, string> = {};
      for (const document of listedFiles) {
        const entryPath = `${FILE_PREFIX}${document.path}`;
        const contents = document.contents;
        entries[entryPath] = contents;
        checksums[entryPath] = await options.sha256(contents);
      }
      entries[CHECKSUMS_PATH] = strToU8(JSON.stringify(checksums));
      try {
        return success(zipSync(entries, { level: 6 }));
      } catch {
        return backupError("IO_FAILURE", "The backup archive could not be created");
      }
    },
    async preflight(archive) {
      const result = await preflight(archive);
      return result.ok ? success(result.value.preview) : result;
    },
    async restore(archive, policy, dryRun = false) {
      const result = await preflight(archive);
      if (!result.ok) return result;
      if (result.value.preview.conflicts.length > 0 && policy === "fail")
        return backupError("CONFLICT", "The backup conflicts with files in the target workspace");
      if (dryRun) return success(result.value.preview);
      if (options.binaryWorkspace) {
        const binaryWorkspace = options.binaryWorkspace;
        let occupied = [...result.value.occupied];
        const createdPaths: string[] = [];
        const replaced: Readonly<{
          before: Awaited<ReturnType<typeof binaryWorkspace.read>>;
          afterRevision: string;
        }>[] = [];
        let failedPath: string | null = null;
        try {
          for (const file of result.value.inspected.files) {
            if (occupied.includes(file.path) && policy === "replace") {
              const before = await binaryWorkspace.read(file.path);
              await binaryWorkspace.replace(file.path, file.contents, before.revision);
              const after = await binaryWorkspace.read(file.path);
              replaced.push(Object.freeze({ before, afterRevision: after.revision }));
              continue;
            }
            const target = occupied.includes(file.path)
              ? createWorkspaceConflictPath(file.path, occupied)
              : file.path;
            await binaryWorkspace.create(target, file.contents);
            createdPaths.push(target);
            occupied = [...occupied, target];
          }
          return success(result.value.preview);
        } catch (error) {
          failedPath = error instanceof Error ? error.message : null;
        }
        let rollbackFailed = false;
        for (const path of [...createdPaths].reverse()) {
          try {
            await binaryWorkspace.remove(path);
          } catch {
            rollbackFailed = true;
          }
        }
        for (const replacement of [...replaced].reverse()) {
          try {
            await binaryWorkspace.replace(
              replacement.before.path,
              replacement.before.contents,
              replacement.afterRevision,
            );
          } catch {
            rollbackFailed = true;
          }
        }
        return backupError(
          "IO_FAILURE",
          rollbackFailed
            ? "Restore failed and rollback was incomplete; inspect the target workspace"
            : "Restore failed and all applied changes were rolled back",
          failedPath,
        );
      }
      let occupied = [...result.value.occupied];
      const createdPaths: string[] = [];
      const replaced: Readonly<{
        before: WorkspaceDocumentSnapshot;
        after: WorkspaceDocumentSnapshot;
      }>[] = [];
      let failedPath: string | null = null;
      try {
        for (const file of result.value.inspected.files) {
          const content = strFromU8(file.contents);
          if (occupied.includes(file.path) && policy === "replace") {
            const existing = await options.repository.read(file.path);
            if (!existing.ok) throw new Error(file.path);
            const written = await options.repository.writeVerified({
              path: file.path,
              expectedBaseHash: existing.value.contentHash,
              markdown: content,
            });
            if (!written.ok) throw new Error(file.path);
            replaced.push(Object.freeze({ before: existing.value, after: written.value }));
            continue;
          }
          const target = occupied.includes(file.path)
            ? createWorkspaceConflictPath(file.path, occupied)
            : file.path;
          const created = await options.repository.create({ path: target, markdown: content });
          if (!created.ok) throw new Error(target);
          createdPaths.push(target);
          occupied = [...occupied, target];
        }
        return success(result.value.preview);
      } catch (error) {
        failedPath = error instanceof Error ? error.message : null;
      }

      let rollbackFailed = false;
      for (const path of [...createdPaths].reverse()) {
        const removed = await options.repository.remove(path);
        if (!removed.ok) rollbackFailed = true;
      }
      for (const replacement of [...replaced].reverse()) {
        const restored = await options.repository.writeVerified({
          path: replacement.before.path,
          expectedBaseHash: replacement.after.contentHash,
          markdown: replacement.before.markdown,
        });
        if (!restored.ok) rollbackFailed = true;
      }
      return backupError(
        "IO_FAILURE",
        rollbackFailed
          ? "Restore failed and rollback was incomplete; inspect the target workspace"
          : "Restore failed and all applied changes were rolled back",
        failedPath,
      );
    },
  });
}
