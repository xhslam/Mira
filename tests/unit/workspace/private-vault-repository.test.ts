import { describe, expect, test } from "vitest";

import type { DocumentId } from "../../../src/domain/identifiers";
import { createPrivateVaultRepository } from "../../../src/workspace/private-vault-repository";
import type { VaultStorage } from "../../../src/workspace/vault-storage";
import { workspaceRepositoryContract } from "../../contracts/workspace-repository.contract";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;

function createMemoryVaultStorage(): VaultStorage {
  let entries: ReadonlyMap<string, string> = new Map();

  const storage: VaultStorage = {
    async read(path: string) {
      return entries.get(path) ?? null;
    },
    async write(path: string, contents: string) {
      entries = new Map([...entries, [path, contents]]);
    },
    async move(from: string, to: string) {
      const contents = entries.get(from);
      if (contents === undefined) {
        throw new Error(`Missing source: ${from}`);
      }
      entries = new Map([...entries].filter(([path]) => path !== from && path !== to));
      entries = new Map([...entries, [to, contents]]);
    },
    async remove(path: string) {
      entries = new Map([...entries].filter(([entryPath]) => entryPath !== path));
    },
    async exists(path: string) {
      return entries.has(path);
    },
  };
  return Object.freeze(storage);
}

function hashMarkdown(markdown: string): Promise<string> {
  return Promise.resolve(`hash:${markdown}`);
}

function createRepository(storage = createMemoryVaultStorage()) {
  let idSequence = 0;
  return createPrivateVaultRepository({
    storage,
    createId: () =>
      `123e4567-e89b-42d3-a456-${(426614174000 + idSequence++).toString()}` as DocumentId,
    hashMarkdown,
  });
}

workspaceRepositoryContract("private vault", () => createRepository());

describe("private vault recovery", () => {
  test("repairs duplicate catalog rows before exposing workspace documents", async () => {
    const storage = createMemoryVaultStorage();
    await storage.write("documents/Notes.md", "saved");
    const entry = {
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      contentHash: "hash:saved",
    };
    await storage.write(
      "catalog.json",
      JSON.stringify({ version: 1, entries: [entry, { ...entry }] }),
    );

    const listed = await createRepository(storage).list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("list failed");
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toMatchObject(entry);
  });

  test("persists catalog identity and Markdown across repository instances", async () => {
    const storage = createMemoryVaultStorage();
    const first = createRepository(storage);
    const created = await first.create({ path: "notes/persistent.md", markdown: "# Persistent\n" });
    expect(created.ok).toBe(true);

    const reopened = await createRepository(storage).read("notes/persistent.md");

    expect(reopened).toEqual(created);
  });

  test("keeps a recovery draft when the verified workspace write fails", async () => {
    const base = createMemoryVaultStorage();
    let failTargetWrite = false;
    const storage: VaultStorage = Object.freeze({
      ...base,
      async write(path: string, contents: string) {
        if (failTargetWrite && path.includes(".pending-")) {
          throw new Error("disk full");
        }
        await base.write(path, contents);
      },
    });
    const repository = createRepository(storage);
    const created = await repository.create({ path: "notes/recovery.md", markdown: "base" });
    if (!created.ok) throw new Error("create failed");

    failTargetWrite = true;
    const written = await repository.writeVerified({
      path: "notes/recovery.md",
      expectedBaseHash: created.value.contentHash,
      markdown: "unsaved edit",
    });

    expect(written).toEqual({
      ok: false,
      error: { code: "IO_FAILURE", path: "notes/recovery.md" },
    });
    expect(await storage.read(`recovery/${DOCUMENT_ID}.md`)).toBe("unsaved edit");
  });

  test("removes recovery only after a read-back verified save", async () => {
    const storage = createMemoryVaultStorage();
    const repository = createRepository(storage);
    const created = await repository.create({ path: "notes/verified.md", markdown: "base" });
    if (!created.ok) throw new Error("create failed");

    const written = await repository.writeVerified({
      path: "notes/verified.md",
      expectedBaseHash: created.value.contentHash,
      markdown: "saved edit",
    });

    expect(written.ok).toBe(true);
    expect(await storage.exists(`recovery/${DOCUMENT_ID}.md`)).toBe(false);
  });

  test("reconciles an interrupted replace from its verified backup on startup", async () => {
    const storage = createMemoryVaultStorage();
    const repository = createRepository(storage);
    const created = await repository.create({ path: "notes/interrupted.md", markdown: "base" });
    if (!created.ok) throw new Error("create failed");
    await storage.move(
      "documents/notes/interrupted.md",
      `documents/notes/interrupted.md.backup-${DOCUMENT_ID}`,
    );

    const reopened = await createRepository(storage).read("notes/interrupted.md");

    expect(reopened).toEqual(created);
    expect(await storage.exists("documents/notes/interrupted.md")).toBe(true);
  });
});
