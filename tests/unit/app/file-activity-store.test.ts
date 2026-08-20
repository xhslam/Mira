import { describe, expect, it } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import {
  createFileActivityStore,
  FILE_ACTIVITY_RECENT_LIMIT,
} from "../../../src/app/file-activity-store";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

const FIRST_WORKSPACE = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const SECOND_WORKSPACE = "123e4567-e89b-42d3-a456-426614174001" as WorkspaceId;

function memoryStorage(initial: Readonly<Record<string, string>> = {}): VaultStorage {
  let files: ReadonlyMap<string, string> = new Map(Object.entries(initial));
  return Object.freeze({
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, contents: string) {
      files = new Map([...files, [path, contents]]);
    },
    async move(from: string, to: string) {
      const value = files.get(from);
      if (value === undefined) throw new Error("missing source");
      files = new Map([...files].filter(([path]) => path !== from && path !== to));
      files = new Map([...files, [to, value]]);
    },
    async remove(path: string) {
      files = new Map([...files].filter(([candidate]) => candidate !== path));
    },
    async exists(path: string) {
      return files.has(path);
    },
  });
}

describe("file activity store", () => {
  it("starts empty and isolates records by stable workspace identity", async () => {
    const storage = memoryStorage();
    const first = createFileActivityStore(storage, FIRST_WORKSPACE);
    const second = createFileActivityStore(storage, SECOND_WORKSPACE);

    await first.recordOpened("notes/today.md", "2026-07-31T08:00:00.000Z");

    await expect(first.load()).resolves.toMatchObject({
      ok: true,
      value: { recent: [{ path: "notes/today.md" }], favorites: [] },
    });
    await expect(second.load()).resolves.toEqual({
      ok: true,
      value: { version: 1, recent: [], favorites: [] },
    });
  });

  it("keeps newest unique recent paths and enforces the bounded history", async () => {
    const store = createFileActivityStore(memoryStorage(), FIRST_WORKSPACE);

    for (let index = 0; index <= FILE_ACTIVITY_RECENT_LIMIT; index += 1) {
      await store.recordOpened(
        `note-${index}.md`,
        new Date(Date.UTC(2026, 6, 31, 0, index)).toISOString(),
      );
    }
    await store.recordOpened("note-1.md", "2026-07-31T12:00:00.000Z");
    const loaded = await store.load();

    expect(loaded.ok && loaded.value.recent).toHaveLength(FILE_ACTIVITY_RECENT_LIMIT);
    expect(loaded.ok && loaded.value.recent[0]?.path).toBe("note-1.md");
    expect(loaded.ok && loaded.value.recent.some((item) => item.path === "note-0.md")).toBe(false);
  });

  it("toggles favorites immutably and ignores duplicate requests", async () => {
    const store = createFileActivityStore(memoryStorage(), FIRST_WORKSPACE);

    const first = await store.setFavorite("notes/today.md", true);
    const duplicate = await store.setFavorite("notes/today.md", true);
    const removed = await store.setFavorite("notes/today.md", false);

    expect(first).toMatchObject({ ok: true, value: { favorites: ["notes/today.md"] } });
    expect(duplicate).toMatchObject({ ok: true, value: { favorites: ["notes/today.md"] } });
    expect(removed).toMatchObject({ ok: true, value: { favorites: [] } });
    if (first.ok) {
      expect(Object.isFrozen(first.value)).toBe(true);
      expect(Object.isFrozen(first.value.favorites)).toBe(true);
    }
  });

  it("translates file and directory paths after rename or move", async () => {
    const store = createFileActivityStore(memoryStorage(), FIRST_WORKSPACE);
    await store.recordOpened("docs/guide/start.md", "2026-07-31T08:00:00.000Z");
    await store.recordOpened("docs/index.md", "2026-07-31T09:00:00.000Z");
    await store.setFavorite("docs/guide/start.md", true);

    const moved = await store.movePath("docs", "manual");

    expect(moved).toMatchObject({
      ok: true,
      value: {
        recent: [{ path: "manual/index.md" }, { path: "manual/guide/start.md" }],
        favorites: ["manual/guide/start.md"],
      },
    });
  });

  it("deduplicates activity when a moved path joins an existing record", async () => {
    const store = createFileActivityStore(memoryStorage(), FIRST_WORKSPACE);
    await store.recordOpened("archive/note.md", "2026-07-31T07:00:00.000Z");
    await store.recordOpened("note.md", "2026-07-31T08:00:00.000Z");
    await store.setFavorite("archive/note.md", true);
    await store.setFavorite("note.md", true);

    const moved = await store.movePath("note.md", "archive/note.md");

    expect(moved).toMatchObject({
      ok: true,
      value: {
        recent: [{ path: "archive/note.md", openedAt: "2026-07-31T08:00:00.000Z" }],
        favorites: ["archive/note.md"],
      },
    });
  });

  it("removes activity for a file or complete directory subtree", async () => {
    const store = createFileActivityStore(memoryStorage(), FIRST_WORKSPACE);
    await store.recordOpened("docs/guide/start.md", "2026-07-31T08:00:00.000Z");
    await store.recordOpened("other.md", "2026-07-31T09:00:00.000Z");
    await store.setFavorite("docs/guide/start.md", true);
    await store.setFavorite("other.md", true);

    const removed = await store.removePath("docs");

    expect(removed).toMatchObject({
      ok: true,
      value: { recent: [{ path: "other.md" }], favorites: ["other.md"] },
    });
  });

  it("rejects malformed persisted data and unsafe update paths", async () => {
    const storage = memoryStorage({
      [`workspace-state/${FIRST_WORKSPACE}/file-activity.json`]: '{"version":1,"recent":[]}',
    });
    const store = createFileActivityStore(storage, FIRST_WORKSPACE);

    await expect(store.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DATA" },
    });
    await expect(store.setFavorite("../escape.md", true)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_PATH" },
    });
  });

  it("reports storage failures without throwing", async () => {
    const storage = memoryStorage();
    const failing = Object.freeze({
      ...storage,
      async write() {
        throw new Error("offline");
      },
    });
    const store = createFileActivityStore(failing, FIRST_WORKSPACE);

    await expect(store.recordOpened("notes.md", "2026-07-31T08:00:00.000Z")).resolves.toMatchObject(
      {
        ok: false,
        error: { code: "IO_FAILURE" },
      },
    );
  });
});
