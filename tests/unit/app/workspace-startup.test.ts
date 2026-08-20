import { describe, expect, it, vi } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { failure, type Result, success } from "../../../src/domain/result";
import type { RecoveryDraftStore } from "../../../src/recovery/recovery-draft-store";
import type { WorkspaceRecord } from "../../../src/workspace/workspace-catalog";
import type { WorkspaceManager } from "../../../src/workspace/workspace-manager";
import type {
  WorkspaceDocumentSnapshot,
  WorkspaceRepository,
  WorkspaceRepositoryError,
} from "../../../src/workspace/workspace-repository";
import {
  openStartupWorkspace,
  type WorkspaceStartupServices,
} from "../../../src/app/workspace-startup";

const MANAGED_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const LINKED_ID = "123e4567-e89b-42d3-a456-426614174001" as WorkspaceId;

function record(provider: "managed" | "android-saf", workspaceId: WorkspaceId): WorkspaceRecord {
  return Object.freeze({
    grant: Object.freeze({
      workspaceId,
      provider,
      displayName: provider === "managed" ? "App-managed workspace" : "Notes",
      locationSummary: provider === "managed" ? "Private storage" : "Documents/Notes",
      serializedGrant:
        provider === "managed" ? "managed://private-vault" : "content://provider/tree/notes",
      status: "authorized" as const,
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: "2026-07-31T00:00:00.000Z",
    }),
    capabilities: Object.freeze({
      read: true,
      write: true,
      atomicReplace: false,
      create: true,
      rename: true,
      move: false,
      copy: false,
      remove: true,
      trash: false,
      watch: false,
      share: false,
    }),
    pinned: false,
  });
}

function repository(
  listResult: Result<readonly WorkspaceDocumentSnapshot[], WorkspaceRepositoryError> = success(
    Object.freeze([]),
  ),
): WorkspaceRepository {
  return Object.freeze({
    capabilities: Object.freeze({ atomicReplace: false, persistedExternalGrants: true }),
    list: vi.fn(async () => listResult),
    read: vi.fn(),
    create: vi.fn(),
    writeVerified: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  }) as unknown as WorkspaceRepository;
}

function recoveryStore(draftCount = 0): RecoveryDraftStore {
  return Object.freeze({
    list: vi.fn(async () => Object.freeze(Array.from({ length: draftCount }, () => ({})))) as never,
    write: vi.fn(),
    remove: vi.fn(),
  });
}

function services(
  records: readonly WorkspaceRecord[],
  activeWorkspaceId: WorkspaceId | null,
  options: Readonly<{
    baseDocuments?: WorkspaceRepository;
    activeDocuments?: WorkspaceRepository;
    activeRecoveryDraftCount?: number;
    restoreFails?: boolean;
  }> = {},
): WorkspaceStartupServices {
  const catalog = Object.freeze({
    version: 1 as const,
    activeWorkspaceId,
    workspaces: Object.freeze([...records]),
  });
  const activeRecord = records.find((item) => item.grant.workspaceId === activeWorkspaceId) ?? null;
  const activeServices = Object.freeze({
    repository: options.activeDocuments ?? repository(),
    recoveryStore: recoveryStore(options.activeRecoveryDraftCount),
  });
  const workspaceManager = Object.freeze({
    load: vi.fn(async () => success(catalog)),
    ensureManaged: vi.fn(async () => success(records[0] ?? record("managed", MANAGED_ID))),
    select: vi.fn(async () => success(catalog)),
    restoreActive: vi.fn(async () =>
      options.restoreFails
        ? failure(Object.freeze({ code: "RESTORE_FAILED" as const, message: "Access revoked" }))
        : success(activeRecord),
    ),
  }) as unknown as WorkspaceManager;

  return Object.freeze({
    repository: options.baseDocuments ?? repository(),
    recoveryStore: recoveryStore(),
    managedWorkspace: record("managed", MANAGED_ID),
    workspaceManager,
    activateWorkspace: vi.fn(() => activeServices),
  });
}

describe("workspace startup", () => {
  it("preflights an already-selected managed workspace before reporting ready", async () => {
    const managed = record("managed", MANAGED_ID);
    const managedRepository = repository(
      failure(Object.freeze({ code: "IO_FAILURE" as const, path: "" })),
    );
    const appServices = services([managed], MANAGED_ID, { activeDocuments: managedRepository });

    await expect(openStartupWorkspace(appServices)).rejects.toThrow(
      "The app-managed workspace could not be checked",
    );
  });

  it("opens an empty selected workspace after repository and recovery preflight", async () => {
    const managed = record("managed", MANAGED_ID);
    const appServices = services([managed], MANAGED_ID);

    const result = await openStartupWorkspace(appServices);

    expect(result).toMatchObject({ needsWorkspace: false, error: null });
    expect(result.services).not.toBeNull();
    expect(appServices.activateWorkspace).toHaveBeenCalledWith(managed);
  });

  it("restores and preflights a linked workspace including its scoped recovery store", async () => {
    const linked = record("android-saf", LINKED_ID);
    const appServices = services([linked], LINKED_ID, { activeRecoveryDraftCount: 1 });

    const result = await openStartupWorkspace(appServices);

    expect(result).toMatchObject({ needsWorkspace: false, error: null });
    expect(appServices.workspaceManager.restoreActive).toHaveBeenCalledOnce();
    expect(result.services?.recoveryStore.list).toHaveBeenCalledOnce();
  });

  it("keeps a revoked linked workspace in the picker for reauthorization", async () => {
    const linked = record("android-saf", LINKED_ID);
    const appServices = services([linked], LINKED_ID, { restoreFails: true });

    const result = await openStartupWorkspace(appServices);

    expect(result).toMatchObject({
      services: null,
      needsWorkspace: true,
      error: "Access revoked",
    });
  });

  it("shows workspace choice on a genuinely empty first run", async () => {
    const appServices = services([], null);

    const result = await openStartupWorkspace(appServices);

    expect(result).toMatchObject({ services: null, needsWorkspace: true, error: null });
    expect(appServices.workspaceManager.ensureManaged).not.toHaveBeenCalled();
  });
});
