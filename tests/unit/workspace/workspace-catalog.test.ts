import { describe, expect, it } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import {
  createWorkspaceCatalogStore,
  removeWorkspaceRecord,
  selectActiveWorkspace,
  upsertWorkspaceRecord,
  WORKSPACE_CATALOG_PATH,
  type WorkspaceCatalog,
  type WorkspaceRecord,
} from "../../../src/workspace/workspace-catalog";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

function createMemoryStorage(): VaultStorage {
  let files: ReadonlyMap<string, string> = new Map();
  return Object.freeze({
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, contents: string) {
      files = new Map([...files, [path, contents]]);
    },
    async move() {
      throw new Error("not used");
    },
    async remove(path: string) {
      files = new Map([...files].filter(([filePath]) => filePath !== path));
    },
    async exists(path: string) {
      return files.has(path);
    },
  });
}

function createRecord(workspaceId: WorkspaceId = WORKSPACE_ID): WorkspaceRecord {
  return Object.freeze({
    grant: Object.freeze({
      workspaceId,
      provider: "managed",
      displayName: "My notes",
      locationSummary: "App private storage",
      serializedGrant: "managed://workspace/123",
      status: "authorized",
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: null,
    }),
    capabilities: Object.freeze({
      read: true,
      write: true,
      atomicReplace: true,
      create: true,
      rename: true,
      move: true,
      copy: true,
      remove: true,
      trash: true,
      watch: true,
      share: true,
    }),
    pinned: false,
  });
}

function createCatalog(workspaces: readonly WorkspaceRecord[]): WorkspaceCatalog {
  return Object.freeze({
    version: 1,
    activeWorkspaceId: workspaces[0]?.grant.workspaceId ?? null,
    workspaces: Object.freeze([...workspaces]),
  });
}

describe("workspace catalog", () => {
  it("returns an immutable empty catalog on first launch", async () => {
    const result = await createWorkspaceCatalogStore(createMemoryStorage()).load();

    expect(result).toEqual({
      ok: true,
      value: { version: 1, activeWorkspaceId: null, workspaces: [] },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.workspaces)).toBe(true);
    }
  });

  it("round-trips a validated catalog without mutating the caller", async () => {
    const storage = createMemoryStorage();
    const store = createWorkspaceCatalogStore(storage);
    const catalog = createCatalog([createRecord()]);

    const saved = await store.save(catalog);
    const loaded = await store.load();

    expect(saved).toEqual({ ok: true, value: undefined });
    expect(loaded).toEqual({ ok: true, value: catalog });
    expect(await storage.exists(WORKSPACE_CATALOG_PATH)).toBe(true);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("rejects duplicate workspace IDs and an unknown active workspace", async () => {
    const store = createWorkspaceCatalogStore(createMemoryStorage());
    const duplicate = createCatalog([createRecord(), createRecord()]);
    const unknownActive = Object.freeze({
      ...createCatalog([createRecord()]),
      activeWorkspaceId: "123e4567-e89b-42d3-a456-426614174001" as WorkspaceId,
    });

    await expect(store.save(duplicate)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_CATALOG" },
    });
    await expect(store.save(unknownActive)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_CATALOG" },
    });
  });

  it("rejects malformed persisted JSON without throwing", async () => {
    const storage = createMemoryStorage();
    await storage.write(WORKSPACE_CATALOG_PATH, '{"version":1,"workspaces":[]}');

    const result = await createWorkspaceCatalogStore(storage).load();

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_CATALOG" } });
  });

  it("returns an IO failure when catalog storage is unavailable", async () => {
    const failingStorage: VaultStorage = Object.freeze({
      async read() {
        throw new Error("offline");
      },
      async write() {
        throw new Error("offline");
      },
      async move() {
        throw new Error("offline");
      },
      async remove() {
        throw new Error("offline");
      },
      async exists() {
        throw new Error("offline");
      },
    });

    const result = await createWorkspaceCatalogStore(failingStorage).load();

    expect(result).toEqual({
      ok: false,
      error: { code: "IO_FAILURE", message: "Workspace catalog could not be read" },
    });
  });

  it("upserts records, selects an existing workspace, and removes only catalog records", () => {
    const first = createRecord();
    const second = createRecord("123e4567-e89b-42d3-a456-426614174001" as WorkspaceId);
    const catalog = createCatalog([first]);

    const upserted = upsertWorkspaceRecord(catalog, second);
    const selected = selectActiveWorkspace(upserted, second.grant.workspaceId);
    const removed = removeWorkspaceRecord(
      selected.ok ? selected.value : upserted,
      second.grant.workspaceId,
    );

    expect(upserted.workspaces).toHaveLength(2);
    expect(selected).toMatchObject({
      ok: true,
      value: { activeWorkspaceId: second.grant.workspaceId },
    });
    expect(removed).toMatchObject({ activeWorkspaceId: first.grant.workspaceId });
    expect(Object.isFrozen(removed)).toBe(true);
  });
});
