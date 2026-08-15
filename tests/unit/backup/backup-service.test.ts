import { describe, expect, test } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import { createBackupService } from "../../../src/backup/vmbak-service";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";
import type {
  CreateWorkspaceDocumentRequest,
  WorkspaceRepository,
} from "../../../src/workspace/workspace-repository";
import { strToU8, zipSync } from "fflate";
import type { BackupBinaryWorkspace } from "../../../src/backup/backup-service";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const FIRST_ID = "223e4567-e89b-42d3-a456-426614174000" as DocumentId;
const SECOND_ID = "323e4567-e89b-42d3-a456-426614174000" as DocumentId;
const IDS: readonly DocumentId[] = Object.freeze([FIRST_ID, SECOND_ID]);

function hash(bytes: Uint8Array): Promise<string> {
  return Promise.resolve(Array.from(bytes).join("-"));
}

function repository() {
  let id = 0;
  return createMemoryWorkspaceRepository({
    capabilities: Object.freeze({ atomicReplace: true, persistedExternalGrants: false }),
    createId: () => IDS[id++] ?? SECOND_ID,
    hashMarkdown: async (markdown) => `hash:${markdown}`,
  });
}

function binaryWorkspace(initial: Readonly<Record<string, readonly number[]>> = {}) {
  const files = new Map(
    Object.entries(initial).map(([path, contents]) => [path, new Uint8Array(contents)]),
  );
  const revision = (contents: Uint8Array) => Array.from(contents).join("-");
  const store: BackupBinaryWorkspace = Object.freeze({
    async list() {
      return Object.freeze(
        [...files].map(([path, contents]) =>
          Object.freeze({ path, contents: new Uint8Array(contents), revision: revision(contents) }),
        ),
      );
    },
    async read(path) {
      const contents = files.get(path);
      if (!contents) throw new Error(path);
      return Object.freeze({
        path,
        contents: new Uint8Array(contents),
        revision: revision(contents),
      });
    },
    async create(path, contents) {
      if (files.has(path)) throw new Error(path);
      files.set(path, new Uint8Array(contents));
    },
    async replace(path, contents, expectedRevision) {
      const current = files.get(path);
      if (!current || revision(current) !== expectedRevision) throw new Error(path);
      files.set(path, new Uint8Array(contents));
    },
    async remove(path) {
      if (!files.delete(path)) throw new Error(path);
    },
  });
  return Object.freeze({ store, files });
}

describe("VMBak backup service", () => {
  test("round trips binary attachments without UTF-8 conversion", async () => {
    const source = binaryWorkspace({ "attachments/pixel.png": [0, 255, 137, 80, 78, 71] });
    const creator = createBackupService({
      repository: repository(),
      binaryWorkspace: source.store,
      createId: () => "binary-backup",
      now: () => new Date("2026-08-01T08:00:00.000Z"),
      sha256: hash,
    });
    const archive = await creator.create(WORKSPACE_ID);
    if (!archive.ok) throw new Error(archive.error.message);

    const target = binaryWorkspace();
    const restorer = createBackupService({
      repository: repository(),
      binaryWorkspace: target.store,
      createId: () => "restore",
      now: () => new Date(),
      sha256: hash,
    });
    expect(await restorer.restore(archive.value, "fail")).toMatchObject({ ok: true });
    expect(Array.from(target.files.get("attachments/pixel.png") ?? [])).toEqual([
      0, 255, 137, 80, 78, 71,
    ]);
  });
  test("round trips files through a versioned checksummed archive", async () => {
    const source = repository();
    await source.create({ path: "notes/plan.md", markdown: "alpha" });
    const creator = createBackupService({
      repository: source,
      createId: () => "backup-1",
      now: () => new Date("2026-08-01T08:00:00.000Z"),
      sha256: hash,
    });
    const archive = await creator.create(WORKSPACE_ID);
    if (!archive.ok) throw new Error(archive.error.message);

    const target = repository();
    const restorer = createBackupService({
      repository: target,
      createId: () => "backup-2",
      now: () => new Date(),
      sha256: hash,
    });
    const preview = await restorer.preflight(archive.value);
    expect(preview).toMatchObject({ ok: true, value: { totalBytes: 5, conflicts: [] } });
    const restored = await restorer.restore(archive.value, "fail");
    expect(restored.ok).toBe(true);
    expect(await target.read("notes/plan.md")).toMatchObject({
      ok: true,
      value: { markdown: "alpha" },
    });
  });

  test("rejects a file whose content no longer matches its checksum", async () => {
    const source = repository();
    await source.create({ path: "note.md", markdown: "original" });
    const service = createBackupService({
      repository: source,
      createId: () => "backup",
      now: () => new Date(),
      sha256: hash,
    });
    const archive = await service.create(WORKSPACE_ID);
    if (!archive.ok) throw new Error(archive.error.message);
    const tampered = new Uint8Array(archive.value);
    const tamperIndex = Math.floor(tampered.length / 2);
    tampered[tamperIndex] = (tampered[tamperIndex] ?? 0) ^ 1;

    expect(await service.preflight(tampered)).toMatchObject({ ok: false });
  });

  test("dry-run reports conflicts without writing and keep-both uses a collision-free path", async () => {
    const source = repository();
    await source.create({ path: "note.md", markdown: "from backup" });
    const creator = createBackupService({
      repository: source,
      createId: () => "backup",
      now: () => new Date(),
      sha256: hash,
    });
    const archive = await creator.create(WORKSPACE_ID);
    if (!archive.ok) throw new Error(archive.error.message);
    const target = repository();
    await target.create({ path: "note.md", markdown: "local" });
    const restorer = createBackupService({
      repository: target,
      createId: () => "restore",
      now: () => new Date(),
      sha256: hash,
    });

    expect(await restorer.restore(archive.value, "keep-both", true)).toMatchObject({
      ok: true,
      value: { conflicts: ["note.md"] },
    });
    const afterDryRun = await target.list();
    expect(afterDryRun.ok ? afterDryRun.value : []).toHaveLength(1);
    expect(await restorer.restore(archive.value, "keep-both")).toMatchObject({ ok: true });
    const listed = await target.list();
    expect(listed.ok && listed.value.map((item) => item.path)).toEqual(["note (2).md", "note.md"]);
  });

  test("rolls back files already applied when a later restore write fails", async () => {
    const source = repository();
    await source.create({ path: "a.md", markdown: "a" });
    await source.create({ path: "b.md", markdown: "b" });
    const creator = createBackupService({
      repository: source,
      createId: () => "backup",
      now: () => new Date(),
      sha256: hash,
    });
    const archive = await creator.create(WORKSPACE_ID);
    if (!archive.ok) throw new Error(archive.error.message);
    const target = repository();
    const failing: WorkspaceRepository = Object.freeze({
      ...target,
      async create(request: CreateWorkspaceDocumentRequest) {
        return request.path === "b.md"
          ? { ok: false as const, error: { code: "IO_FAILURE" as const, path: request.path } }
          : target.create(request);
      },
    });
    const restorer = createBackupService({
      repository: failing,
      createId: () => "restore",
      now: () => new Date(),
      sha256: hash,
    });

    expect(await restorer.restore(archive.value, "fail")).toMatchObject({
      ok: false,
      error: { message: "Restore failed and all applied changes were rolled back" },
    });
    expect(await target.list()).toMatchObject({ ok: true, value: [] });
  });

  test("rejects Zip Slip entries before inspecting the target workspace", async () => {
    const service = createBackupService({
      repository: repository(),
      createId: () => "backup",
      now: () => new Date(),
      sha256: hash,
    });
    const manifest = {
      format: "inkstone-workspace-backup",
      version: 1,
      backupId: "unsafe",
      workspaceId: WORKSPACE_ID,
      createdAt: "2026-08-01T00:00:00.000Z",
      fileCount: 1,
    };
    const contents = strToU8("unsafe");
    const archive = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "checksums.json": strToU8(JSON.stringify({ "files/../outside.md": await hash(contents) })),
      "files/../outside.md": contents,
    });

    expect(await service.preflight(archive)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARCHIVE" },
    });
  });

  test("reports unsupported archive versions distinctly", async () => {
    const service = createBackupService({
      repository: repository(),
      createId: () => "backup",
      now: () => new Date(),
      sha256: hash,
    });
    const archive = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          format: "inkstone-workspace-backup",
          version: 99,
          backupId: "future",
          workspaceId: WORKSPACE_ID,
          createdAt: "2026-08-01T00:00:00.000Z",
          fileCount: 0,
        }),
      ),
      "checksums.json": strToU8("{}"),
    });

    expect(await service.preflight(archive)).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_VERSION" },
    });
  });
});
