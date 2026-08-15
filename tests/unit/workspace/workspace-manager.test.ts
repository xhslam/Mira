import { describe, expect, it, vi } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { failure, success } from "../../../src/domain/result";
import type { VaultStorage } from "../../../src/workspace/vault-storage";
import type { WorkspaceCapability, WorkspaceGrant } from "../../../src/workspace/workspace-adapter";
import {
  createWorkspaceCatalogStore,
  type WorkspaceCatalog,
  type WorkspaceRecord,
} from "../../../src/workspace/workspace-catalog";
import type { WorkspaceGrantService } from "../../../src/workspace/workspace-grant-service";
import { createWorkspaceManager } from "../../../src/workspace/workspace-manager";

const FIRST_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const SECOND_ID = "123e4567-e89b-42d3-a456-426614174001" as WorkspaceId;

const CAPABILITIES: WorkspaceCapability = Object.freeze({
  read: true,
  write: true,
  atomicReplace: false,
  create: true,
  rename: false,
  move: false,
  copy: false,
  remove: true,
  trash: false,
  watch: false,
  share: true,
});

function createMemoryStorage(): VaultStorage {
  let files: ReadonlyMap<string, string> = new Map();
  return Object.freeze({
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, contents: string) {
      files = new Map([...files, [path, contents]]);
    },
    async move(from: string, to: string) {
      const contents = files.get(from);
      if (contents === undefined) throw new Error("missing");
      files = new Map([...files].filter(([path]) => path !== from));
      files = new Map([...files, [to, contents]]);
    },
    async remove(path: string) {
      files = new Map([...files].filter(([filePath]) => filePath !== path));
    },
    async exists(path: string) {
      return files.has(path);
    },
  });
}

function grant(
  workspaceId: WorkspaceId,
  serializedGrant = "content://provider/tree/notes",
): WorkspaceGrant {
  return Object.freeze({
    workspaceId,
    provider: "android-saf",
    displayName: "Notes",
    locationSummary: "Notes",
    serializedGrant,
    status: "authorized",
    createdAt: "2026-07-31T00:00:00.000Z",
    lastOpenedAt: "2026-07-31T00:00:00.000Z",
  });
}

function grantService(options?: Readonly<{ restoreFails?: boolean }>): WorkspaceGrantService {
  return Object.freeze({
    async authorize() {
      return success(grant(SECOND_ID));
    },
    async restore(input) {
      return options?.restoreFails
        ? failure(
            Object.freeze({
              code: "PERMISSION_REVOKED" as const,
              message: "Workspace access needs to be authorized again",
            }),
          )
        : success(Object.freeze({ ...input, lastOpenedAt: "2026-07-31T01:00:00.000Z" }));
    },
  });
}

function createCatalog(record: WorkspaceRecord): WorkspaceCatalog {
  return Object.freeze({
    version: 1,
    activeWorkspaceId: record.grant.workspaceId,
    workspaces: Object.freeze([record]),
  });
}

function createRecord(inputGrant = grant(FIRST_ID)): WorkspaceRecord {
  return Object.freeze({
    grant: inputGrant,
    capabilities: CAPABILITIES,
    pinned: false,
  });
}

describe("workspace manager", () => {
  it("registers the managed workspace without selecting it before preflight", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });
    const managed = Object.freeze({
      ...createRecord(
        Object.freeze({
          ...grant(FIRST_ID, "managed://private-vault"),
          provider: "managed" as const,
          displayName: "App-managed workspace",
          locationSummary: "Private Inkstone storage on this device",
        }),
      ),
      capabilities: Object.freeze({ ...CAPABILITIES, atomicReplace: false }),
    });

    const registered = await manager.ensureManaged(managed);

    expect(registered).toMatchObject({
      ok: true,
      value: { grant: { workspaceId: FIRST_ID, provider: "managed" } },
    });
    await expect(manager.load()).resolves.toMatchObject({
      ok: true,
      value: { activeWorkspaceId: null, workspaces: [{ grant: { provider: "managed" } }] },
    });
  });

  it("preserves managed workspace user metadata when ensuring it again", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(
      createCatalog(
        Object.freeze({
          ...createRecord(
            Object.freeze({
              ...grant(FIRST_ID, "managed://private-vault"),
              provider: "managed" as const,
              displayName: "Personal vault",
            }),
          ),
          pinned: true,
        }),
      ),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });
    const defaultRecord = Object.freeze({
      ...createRecord(
        Object.freeze({
          ...grant(FIRST_ID, "managed://private-vault"),
          provider: "managed" as const,
          displayName: "App-managed workspace",
        }),
      ),
    });

    const ensured = await manager.ensureManaged(defaultRecord);

    expect(ensured).toMatchObject({
      ok: true,
      value: { grant: { displayName: "Personal vault" }, pinned: true },
    });
  });

  it("authorizes and persists a linked workspace without selecting it before preflight", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const authorized = await manager.authorize();
    const loaded = await catalog.load();

    expect(authorized).toMatchObject({
      ok: true,
      value: { grant: { workspaceId: SECOND_ID }, pinned: false },
    });
    expect(loaded).toMatchObject({
      ok: true,
      value: { activeWorkspaceId: null, workspaces: [{ grant: { workspaceId: SECOND_ID } }] },
    });
  });

  it("deduplicates the same provider grant while preserving the existing identity", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(
      createCatalog(
        Object.freeze({
          ...createRecord(),
          grant: Object.freeze({
            ...grant(FIRST_ID),
            displayName: "My project",
            createdAt: "2026-07-30T00:00:00.000Z",
          }),
          pinned: true,
        }),
      ),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const authorized = await manager.authorize();
    const loaded = await catalog.load();

    expect(authorized).toMatchObject({
      ok: true,
      value: {
        grant: {
          workspaceId: FIRST_ID,
          displayName: "My project",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
        pinned: true,
      },
    });
    expect(loaded.ok && loaded.value.workspaces).toHaveLength(1);
  });

  it("returns a typed authorization failure when capability discovery fails", async () => {
    const manager = createWorkspaceManager({
      catalog: createWorkspaceCatalogStore(createMemoryStorage()),
      grantService: grantService(),
      capabilitiesFor: () => {
        throw new Error("provider metadata unavailable");
      },
    });

    const result = await manager.authorize();

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTHORIZATION_FAILED",
        message: "Workspace capabilities could not be determined",
      },
    });
  });

  it("restores the active linked grant and persists its latest access time", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const restored = await manager.restoreActive();
    const loaded = await catalog.load();

    expect(restored).toMatchObject({
      ok: true,
      value: { grant: { lastOpenedAt: "2026-07-31T01:00:00.000Z" } },
    });
    expect(loaded).toMatchObject({
      ok: true,
      value: { workspaces: [{ grant: { lastOpenedAt: "2026-07-31T01:00:00.000Z" } }] },
    });
  });

  it("restores an inactive linked grant without selecting it", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    const first = createRecord();
    const second = createRecord(grant(SECOND_ID, "content://provider/tree/archive"));
    await catalog.save(
      Object.freeze({
        version: 1,
        activeWorkspaceId: FIRST_ID,
        workspaces: Object.freeze([first, second]),
      }),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const restored = await manager.restore(SECOND_ID);
    const loaded = await manager.load();

    expect(restored).toMatchObject({
      ok: true,
      value: { grant: { workspaceId: SECOND_ID, lastOpenedAt: "2026-07-31T01:00:00.000Z" } },
    });
    expect(loaded).toMatchObject({
      ok: true,
      value: { activeWorkspaceId: FIRST_ID },
    });
  });

  it("marks a revoked inactive grant for reauthorization without selecting it", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    const first = createRecord();
    const second = createRecord(grant(SECOND_ID, "content://provider/tree/archive"));
    await catalog.save(
      Object.freeze({
        version: 1,
        activeWorkspaceId: FIRST_ID,
        workspaces: Object.freeze([first, second]),
      }),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService({ restoreFails: true }),
      capabilitiesFor: () => CAPABILITIES,
    });

    const restored = await manager.restore(SECOND_ID);
    const loaded = await manager.load();

    expect(restored).toMatchObject({ ok: false, error: { code: "RESTORE_FAILED" } });
    expect(loaded).toMatchObject({
      ok: true,
      value: {
        activeWorkspaceId: FIRST_ID,
        workspaces: [
          { grant: { workspaceId: FIRST_ID, status: "authorized" } },
          { grant: { workspaceId: SECOND_ID, status: "needs-reauthorization" } },
        ],
      },
    });
  });

  it("marks a revoked active grant for reauthorization without removing it", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService({ restoreFails: true }),
      capabilitiesFor: () => CAPABILITIES,
    });

    const restored = await manager.restoreActive();
    const loaded = await catalog.load();

    expect(restored).toMatchObject({ ok: false, error: { code: "RESTORE_FAILED" } });
    expect(loaded).toMatchObject({
      ok: true,
      value: { workspaces: [{ grant: { status: "needs-reauthorization" } }] },
    });
  });

  it("refreshes provider capabilities after a successful grant restore", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(
      createCatalog(
        Object.freeze({
          ...createRecord(),
          capabilities: Object.freeze({ ...CAPABILITIES, share: false }),
        }),
      ),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const restored = await manager.restoreActive();
    const loaded = await manager.load();

    expect(restored).toMatchObject({ ok: true, value: { capabilities: { share: true } } });
    expect(loaded).toMatchObject({
      ok: true,
      value: { workspaces: [{ capabilities: { share: true } }] },
    });
  });

  it("reauthorizes a linked workspace while preserving user metadata and identity", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(
      createCatalog(
        Object.freeze({
          ...createRecord(
            Object.freeze({
              ...grant(FIRST_ID, "content://provider/tree/old"),
              displayName: "Project files",
              status: "needs-reauthorization" as const,
              createdAt: "2026-07-30T00:00:00.000Z",
            }),
          ),
          pinned: true,
        }),
      ),
    );
    const authorize = vi.fn(async () =>
      success(grant(SECOND_ID, "content://provider/tree/reauthorized")),
    );
    const manager = createWorkspaceManager({
      catalog,
      grantService: Object.freeze({ authorize, restore: grantService().restore }),
      capabilitiesFor: () => CAPABILITIES,
    });

    const reauthorized = await manager.reauthorize(FIRST_ID);

    expect(authorize).toHaveBeenCalledWith("content://provider/tree/old");
    expect(reauthorized).toMatchObject({
      ok: true,
      value: {
        grant: {
          workspaceId: FIRST_ID,
          displayName: "Project files",
          serializedGrant: "content://provider/tree/reauthorized",
          status: "authorized",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
        pinned: true,
      },
    });
  });

  it("does not replace a linked grant when reauthorization is cancelled", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord(grant(FIRST_ID, "content://provider/tree/old"))));
    const manager = createWorkspaceManager({
      catalog,
      grantService: Object.freeze({
        async authorize() {
          return failure(
            Object.freeze({
              code: "AUTHORIZATION_CANCELLED" as const,
              message: "Workspace authorization was cancelled",
            }),
          );
        },
        restore: grantService().restore,
      }),
      capabilitiesFor: () => CAPABILITIES,
    });

    const reauthorized = await manager.reauthorize(FIRST_ID);
    const loaded = await manager.load();

    expect(reauthorized).toMatchObject({ ok: false, error: { code: "AUTHORIZATION_FAILED" } });
    expect(loaded).toMatchObject({
      ok: true,
      value: { workspaces: [{ grant: { serializedGrant: "content://provider/tree/old" } }] },
    });
  });

  it("renames and pins a record with immutable persisted values", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const renamed = await manager.rename(FIRST_ID, "  Project Notes  ");
    const pinned = await manager.pin(FIRST_ID, true);

    expect(renamed).toMatchObject({ ok: true, value: { grant: { displayName: "Project Notes" } } });
    expect(pinned).toMatchObject({ ok: true, value: { pinned: true } });
    if (pinned.ok) expect(Object.isFrozen(pinned.value)).toBe(true);
  });

  it("serializes concurrent catalog mutations without losing a newer value", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const [renamed, pinned] = await Promise.all([
      manager.rename(FIRST_ID, "Project Notes"),
      manager.pin(FIRST_ID, true),
    ]);
    const loaded = await manager.load();

    expect(renamed.ok).toBe(true);
    expect(pinned.ok).toBe(true);
    expect(loaded).toMatchObject({
      ok: true,
      value: {
        workspaces: [{ grant: { displayName: "Project Notes" }, pinned: true }],
      },
    });
  });

  it("removes only the catalog record and rejects unknown workspaces", async () => {
    const storage = createMemoryStorage();
    const catalog = createWorkspaceCatalogStore(storage);
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const removed = await manager.remove(FIRST_ID);
    const missing = await manager.select(FIRST_ID);

    expect(removed).toMatchObject({
      ok: true,
      value: { activeWorkspaceId: null, workspaces: [] },
    });
    expect(missing).toMatchObject({ ok: false, error: { code: "WORKSPACE_NOT_FOUND" } });
  });

  it("rejects invalid display names without changing the catalog", async () => {
    const catalog = createWorkspaceCatalogStore(createMemoryStorage());
    await catalog.save(createCatalog(createRecord()));
    const manager = createWorkspaceManager({
      catalog,
      grantService: grantService(),
      capabilitiesFor: () => CAPABILITIES,
    });

    const renamed = await manager.rename(FIRST_ID, "   ");
    const loaded = await catalog.load();

    expect(renamed).toMatchObject({ ok: false, error: { code: "INVALID_DISPLAY_NAME" } });
    expect(loaded).toMatchObject({
      ok: true,
      value: { workspaces: [{ grant: { displayName: "Notes" } }] },
    });
  });
});
