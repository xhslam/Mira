import { describe, expect, test } from "vitest";

import type { DocumentId } from "../../../src/domain/identifiers";
import { createPrivateVaultRecoveryStore } from "../../../src/recovery/private-vault-recovery-store";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

const FIRST_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const SECOND_ID = "123e4567-e89b-42d3-a456-426614174001" as DocumentId;

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

describe("private vault recovery draft store", () => {
  test("repairs duplicate persisted identities by keeping the newest draft", async () => {
    const storage = createStorage();
    await storage.write(
      "recovery-drafts.json",
      JSON.stringify({
        version: 1,
        drafts: [
          {
            documentId: FIRST_ID,
            path: "First.md",
            markdown: "older",
            revision: 2,
            baseHash: null,
            updatedAt: "2026-07-30T10:00:00.000Z",
          },
          {
            documentId: FIRST_ID,
            path: "First.md",
            markdown: "newer",
            revision: 3,
            baseHash: null,
            updatedAt: "2026-07-30T11:00:00.000Z",
          },
        ],
      }),
    );

    const drafts = await createPrivateVaultRecoveryStore(storage).list();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ markdown: "newer", revision: 3 });
  });

  test("survives store recreation and returns frozen drafts newest first", async () => {
    const storage = createStorage();
    const store = createPrivateVaultRecoveryStore(storage);
    await store.write({
      documentId: FIRST_ID,
      path: "First.md",
      markdown: "first",
      revision: 1,
      baseHash: null,
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    await store.write({
      documentId: SECOND_ID,
      path: "Second.md",
      markdown: "second",
      revision: 2,
      baseHash: "hash:base",
      updatedAt: "2026-07-30T11:00:00.000Z",
    });

    const drafts = await createPrivateVaultRecoveryStore(storage).list();

    expect(drafts.map((draft) => draft.documentId)).toEqual([SECOND_ID, FIRST_ID]);
    expect(Object.isFrozen(drafts)).toBe(true);
    expect(drafts.every(Object.isFrozen)).toBe(true);
  });

  test("replaces one document draft without mutating other drafts", async () => {
    const store = createPrivateVaultRecoveryStore(createStorage());
    await store.write({
      documentId: FIRST_ID,
      path: "First.md",
      markdown: "one",
      revision: 1,
      baseHash: null,
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    await store.write({
      documentId: FIRST_ID,
      path: "First.md",
      markdown: "two",
      revision: 2,
      baseHash: null,
      updatedAt: "2026-07-30T10:01:00.000Z",
    });

    expect(await store.list()).toEqual([
      {
        documentId: FIRST_ID,
        path: "First.md",
        markdown: "two",
        revision: 2,
        baseHash: null,
        updatedAt: "2026-07-30T10:01:00.000Z",
      },
    ]);
  });

  test("removes only the confirmed document draft", async () => {
    const store = createPrivateVaultRecoveryStore(createStorage());
    for (const documentId of [FIRST_ID, SECOND_ID]) {
      await store.write({
        documentId,
        path: `${documentId}.md`,
        markdown: "draft",
        revision: 1,
        baseHash: null,
        updatedAt: "2026-07-30T10:00:00.000Z",
      });
    }

    await store.remove(FIRST_ID);

    expect((await store.list()).map((draft) => draft.documentId)).toEqual([SECOND_ID]);
  });
});
