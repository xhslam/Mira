import { describe, expect, test } from "vitest";

import type { DocumentId } from "../../../src/domain/identifiers";
import { createPrivateVaultHistoryStore } from "../../../src/history/private-vault-history-store";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const OTHER_DOCUMENT_ID = "223e4567-e89b-42d3-a456-426614174000" as DocumentId;

function createStorage(): VaultStorage {
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
      if (contents === undefined) throw new Error("missing source");
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

describe("private vault history store", () => {
  test("clears one document without removing another document's history", async () => {
    const storage = createStorage();
    let id = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${++id}`,
      now: () => new Date(`2026-01-01T00:00:0${id}.000Z`),
    });
    await store.add({
      documentId: DOCUMENT_ID,
      path: "one.md",
      markdown: "one",
      contentHash: "h1",
      source: "manual",
    });
    await store.add({
      documentId: OTHER_DOCUMENT_ID,
      path: "two.md",
      markdown: "two",
      contentHash: "h2",
      source: "manual",
    });

    await store.clear(DOCUMENT_ID);

    expect(await store.list(DOCUMENT_ID)).toEqual([]);
    expect(await store.list(OTHER_DOCUMENT_ID)).toHaveLength(1);
  });
  test("persists verified snapshots newest first and deduplicates equal hashes", async () => {
    const storage = createStorage();
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence++}`,
      now: () => new Date(`2026-07-30T10:0${sequence}:00.000Z`),
    });
    const input = {
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "one",
      contentHash: "hash:one",
      source: "manual" as const,
    };

    expect(await store.add(input)).not.toBeNull();
    expect(await store.add(input)).toBeNull();
    await store.add({ ...input, markdown: "two", contentHash: "hash:two", source: "auto" });

    const reopened = createPrivateVaultHistoryStore({
      storage,
      createId: () => "unused",
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    });
    expect((await reopened.list(DOCUMENT_ID)).map((snapshot) => snapshot.contentHash)).toEqual([
      "hash:two",
      "hash:one",
    ]);
  });

  test("retains at most 50 snapshots per document", async () => {
    const storage = createStorage();
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence}`,
      now: () => new Date(2026, 6, 30, 10, sequence++),
    });

    for (let index = 0; index < 105; index += 1) {
      await store.add({
        documentId: DOCUMENT_ID,
        path: "Notes.md",
        markdown: `${index}`,
        contentHash: `hash:${index}`,
        source: "manual",
      });
    }

    const snapshots = await store.list(DOCUMENT_ID);
    expect(snapshots).toHaveLength(50);
    expect(snapshots.at(-1)?.contentHash).toBe("hash:55");
  });

  test("removes only the selected immutable snapshot", async () => {
    const storage = createStorage();
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence++}`,
      now: () => new Date("2026-07-30T10:00:00.000Z"),
    });
    const first = await store.add({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "one",
      contentHash: "one",
      source: "manual",
    });
    await store.add({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "two",
      contentHash: "two",
      source: "manual",
    });
    if (!first) throw new Error("missing snapshot");

    await store.remove(first.snapshotId);

    expect((await store.list(DOCUMENT_ID)).map((snapshot) => snapshot.contentHash)).toEqual([
      "two",
    ]);
  });

  test("limits autosave history to one snapshot in each thirty-second window", async () => {
    const storage = createStorage();
    const times = [
      new Date("2026-07-30T10:00:00.000Z"),
      new Date("2026-07-30T10:00:20.000Z"),
      new Date("2026-07-30T10:00:31.000Z"),
    ];
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence}`,
      now: () => times[sequence++] ?? new Date("2026-07-30T10:00:31.000Z"),
    });

    expect(
      await store.add({
        documentId: DOCUMENT_ID,
        path: "Notes.md",
        markdown: "one",
        contentHash: "one",
        source: "auto",
      }),
    ).not.toBeNull();
    expect(
      await store.add({
        documentId: DOCUMENT_ID,
        path: "Notes.md",
        markdown: "two",
        contentHash: "two",
        source: "auto",
      }),
    ).toBeNull();
    expect(
      await store.add({
        documentId: DOCUMENT_ID,
        path: "Notes.md",
        markdown: "three",
        contentHash: "three",
        source: "auto",
      }),
    ).not.toBeNull();
    expect((await store.list(DOCUMENT_ID)).map((snapshot) => snapshot.contentHash)).toEqual([
      "three",
      "one",
    ]);
  });

  test("stores oversized autosaves as non-restorable metadata", async () => {
    const storage = createStorage();
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence++}`,
      now: () => new Date(2026, 7, 1, 10, sequence),
      maxBytes: 2 * 1024 * 1024,
    });
    const markdown = "x".repeat(1024 * 1024 + 1);

    await store.add({
      documentId: DOCUMENT_ID,
      path: "large.md",
      markdown,
      contentHash: "auto",
      source: "auto",
    });
    await store.add({
      documentId: DOCUMENT_ID,
      path: "large.md",
      markdown,
      contentHash: "manual",
      source: "manual",
    });

    const snapshots = await store.list(DOCUMENT_ID);
    expect(snapshots.find((item) => item.contentHash === "auto")).toMatchObject({
      metadataOnly: true,
      markdown: "",
    });
    expect(snapshots.find((item) => item.contentHash === "manual")).toMatchObject({
      markdown,
    });
  });

  test("prunes old and oversized history while retaining the newest document snapshot", async () => {
    const storage = createStorage();
    const times = [
      new Date("2026-05-01T10:00:00.000Z"),
      new Date("2026-07-30T10:00:00.000Z"),
      new Date("2026-07-30T10:01:00.000Z"),
    ];
    let sequence = 0;
    const store = createPrivateVaultHistoryStore({
      storage,
      createId: () => `snapshot-${sequence}`,
      now: () => times[sequence++] ?? new Date("2026-07-30T10:01:00.000Z"),
      maxBytes: 9,
    });

    await store.add({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "old",
      contentHash: "old",
      source: "manual",
    });
    await store.add({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "123456",
      contentHash: "newer",
      source: "manual",
    });
    await store.add({
      documentId: DOCUMENT_ID,
      path: "Notes.md",
      markdown: "abcdef",
      contentHash: "newest",
      source: "manual",
    });

    expect((await store.list(DOCUMENT_ID)).map((snapshot) => snapshot.contentHash)).toEqual([
      "newest",
    ]);
  });
});
