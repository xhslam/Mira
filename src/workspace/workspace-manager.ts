import { failure, type Result, success } from "../domain/result";
import type { WorkspaceGrantService } from "./workspace-grant-service";
import {
  removeWorkspaceRecord,
  selectActiveWorkspace,
  type WorkspaceCatalog,
  type WorkspaceCatalogError,
  type WorkspaceCatalogStore,
  type WorkspaceRecord,
  upsertWorkspaceRecord,
} from "./workspace-catalog";
import type {
  WorkspaceCapability,
  WorkspaceGrant,
  WorkspaceGrantStatus,
} from "./workspace-adapter";

export type WorkspaceManagerErrorCode =
  | "CATALOG_INVALID"
  | "CATALOG_IO"
  | "WORKSPACE_NOT_FOUND"
  | "INVALID_DISPLAY_NAME"
  | "AUTHORIZATION_FAILED"
  | "RESTORE_FAILED";

export type WorkspaceManagerError = Readonly<{
  code: WorkspaceManagerErrorCode;
  message: string;
}>;

export type WorkspaceManagerOptions = Readonly<{
  catalog: WorkspaceCatalogStore;
  grantService: WorkspaceGrantService;
  capabilitiesFor: (grant: WorkspaceGrant) => WorkspaceCapability;
}>;

export type WorkspaceManager = Readonly<{
  load(): Promise<Result<WorkspaceCatalog, WorkspaceManagerError>>;
  ensureManaged(record: WorkspaceRecord): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  authorize(initialUri?: string): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  reauthorize(
    workspaceId: WorkspaceGrant["workspaceId"],
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  restore(
    workspaceId: WorkspaceGrant["workspaceId"],
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  restoreActive(): Promise<Result<WorkspaceRecord | null, WorkspaceManagerError>>;
  select(
    workspaceId: WorkspaceGrant["workspaceId"],
  ): Promise<Result<WorkspaceCatalog, WorkspaceManagerError>>;
  rename(
    workspaceId: WorkspaceGrant["workspaceId"],
    displayName: string,
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  pin(
    workspaceId: WorkspaceGrant["workspaceId"],
    pinned: boolean,
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>>;
  remove(
    workspaceId: WorkspaceGrant["workspaceId"],
  ): Promise<Result<WorkspaceCatalog, WorkspaceManagerError>>;
}>;

function managerError(
  code: WorkspaceManagerErrorCode,
  message: string,
): Result<never, WorkspaceManagerError> {
  return failure(Object.freeze({ code, message }));
}

function mapCatalogError(error: WorkspaceCatalogError): Result<never, WorkspaceManagerError> {
  return managerError(
    error.code === "IO_FAILURE" ? "CATALOG_IO" : "CATALOG_INVALID",
    error.message,
  );
}

function normalizeDisplayName(displayName: string): string | null {
  const normalized = displayName.normalize("NFC").trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}

function recordWithGrant(record: WorkspaceRecord, grant: WorkspaceGrant): WorkspaceRecord {
  return Object.freeze({
    ...record,
    grant: Object.freeze({ ...grant }),
    capabilities: Object.freeze({ ...record.capabilities }),
  });
}

function recordWithStatus(record: WorkspaceRecord, status: WorkspaceGrantStatus): WorkspaceRecord {
  return recordWithGrant(record, Object.freeze({ ...record.grant, status }));
}

function upsertWithoutSelecting(
  catalog: WorkspaceCatalog,
  record: WorkspaceRecord,
): WorkspaceCatalog {
  return Object.freeze({
    ...upsertWorkspaceRecord(catalog, record),
    activeWorkspaceId: catalog.activeWorkspaceId,
  });
}

export function createWorkspaceManager(options: WorkspaceManagerOptions): WorkspaceManager {
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function loadCatalog(): Promise<Result<WorkspaceCatalog, WorkspaceManagerError>> {
    const result = await options.catalog.load();
    return result.ok ? result : mapCatalogError(result.error);
  }

  async function saveCatalog(
    catalog: WorkspaceCatalog,
  ): Promise<Result<WorkspaceCatalog, WorkspaceManagerError>> {
    const saved = await options.catalog.save(catalog);
    return saved.ok ? success(catalog) : mapCatalogError(saved.error);
  }

  async function updateRecord(
    workspaceId: WorkspaceGrant["workspaceId"],
    update: (record: WorkspaceRecord) => WorkspaceRecord,
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>> {
    const loaded = await loadCatalog();
    if (!loaded.ok) return loaded;
    const record = loaded.value.workspaces.find((item) => item.grant.workspaceId === workspaceId);
    if (!record) return managerError("WORKSPACE_NOT_FOUND", "The workspace is not in the catalog");
    const updated = update(record);
    const saved = await saveCatalog(upsertWorkspaceRecord(loaded.value, updated));
    return saved.ok ? success(updated) : saved;
  }

  async function restoreRecord(
    workspaceId: WorkspaceGrant["workspaceId"],
  ): Promise<Result<WorkspaceRecord, WorkspaceManagerError>> {
    const loaded = await loadCatalog();
    if (!loaded.ok) return loaded;
    const record = loaded.value.workspaces.find((item) => item.grant.workspaceId === workspaceId);
    if (!record) return managerError("WORKSPACE_NOT_FOUND", "The workspace is not in the catalog");
    if (record.grant.provider === "managed") return success(record);

    let restored: Awaited<ReturnType<WorkspaceGrantService["restore"]>>;
    try {
      restored = await options.grantService.restore(record.grant);
    } catch {
      restored = failure(
        Object.freeze({
          code: "IO_FAILURE",
          message: "Workspace access could not be restored",
        }),
      );
    }
    if (restored.ok) {
      let capabilities: WorkspaceCapability;
      try {
        capabilities = options.capabilitiesFor(restored.value);
      } catch {
        return managerError("RESTORE_FAILED", "Workspace capabilities could not be determined");
      }
      const updated = recordWithGrant(
        Object.freeze({ ...record, capabilities: Object.freeze({ ...capabilities }) }),
        restored.value,
      );
      const saved = await saveCatalog(upsertWorkspaceRecord(loaded.value, updated));
      return saved.ok ? success(updated) : saved;
    }

    const status =
      restored.error.code === "PERMISSION_REVOKED" ? "needs-reauthorization" : "offline";
    const marked = recordWithStatus(record, status);
    const saved = await saveCatalog(upsertWorkspaceRecord(loaded.value, marked));
    return saved.ok ? managerError("RESTORE_FAILED", restored.error.message) : saved;
  }

  return Object.freeze({
    async load() {
      await operationTail;
      return loadCatalog();
    },

    async ensureManaged(record) {
      return serialize(async () => {
        if (record.grant.provider !== "managed") {
          return managerError(
            "AUTHORIZATION_FAILED",
            "Only a managed workspace can be registered without authorization",
          );
        }
        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        const existing = loaded.value.workspaces.find(
          (item) =>
            item.grant.provider === "managed" &&
            item.grant.serializedGrant === record.grant.serializedGrant,
        );
        const managed = existing
          ? recordWithGrant(
              Object.freeze({
                ...existing,
                capabilities: Object.freeze({ ...record.capabilities }),
              }),
              Object.freeze({
                ...record.grant,
                workspaceId: existing.grant.workspaceId,
                displayName: existing.grant.displayName,
                createdAt: existing.grant.createdAt,
                lastOpenedAt: existing.grant.lastOpenedAt,
              }),
            )
          : Object.freeze({
              grant: Object.freeze({ ...record.grant }),
              capabilities: Object.freeze({ ...record.capabilities }),
              pinned: record.pinned,
            });
        const saved = await saveCatalog(upsertWithoutSelecting(loaded.value, managed));
        return saved.ok ? success(managed) : saved;
      });
    },

    async authorize(initialUri) {
      return serialize(async () => {
        let authorized: Awaited<ReturnType<WorkspaceGrantService["authorize"]>>;
        try {
          authorized = await options.grantService.authorize(initialUri);
        } catch {
          return managerError("AUTHORIZATION_FAILED", "Workspace authorization failed");
        }
        if (!authorized.ok) {
          return managerError("AUTHORIZATION_FAILED", authorized.error.message);
        }

        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        const existing = loaded.value.workspaces.find(
          (record) =>
            record.grant.provider === authorized.value.provider &&
            record.grant.serializedGrant === authorized.value.serializedGrant,
        );
        let record: WorkspaceRecord;
        if (existing) {
          record = recordWithGrant(
            existing,
            Object.freeze({
              ...authorized.value,
              workspaceId: existing.grant.workspaceId,
              displayName: existing.grant.displayName,
              createdAt: existing.grant.createdAt,
            }),
          );
        } else {
          let capabilities: WorkspaceCapability;
          try {
            capabilities = options.capabilitiesFor(authorized.value);
          } catch {
            return managerError(
              "AUTHORIZATION_FAILED",
              "Workspace capabilities could not be determined",
            );
          }
          record = Object.freeze({
            grant: Object.freeze({ ...authorized.value }),
            capabilities: Object.freeze({ ...capabilities }),
            pinned: false,
          });
        }
        const saved = await saveCatalog(upsertWithoutSelecting(loaded.value, record));
        return saved.ok ? success(record) : saved;
      });
    },

    async reauthorize(workspaceId) {
      return serialize(async () => {
        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        const existing = loaded.value.workspaces.find(
          (record) => record.grant.workspaceId === workspaceId,
        );
        if (!existing) {
          return managerError("WORKSPACE_NOT_FOUND", "The workspace is not in the catalog");
        }
        if (existing.grant.provider === "managed") {
          return managerError(
            "AUTHORIZATION_FAILED",
            "The managed workspace does not require reauthorization",
          );
        }

        let authorized: Awaited<ReturnType<WorkspaceGrantService["authorize"]>>;
        try {
          authorized = await options.grantService.authorize(existing.grant.serializedGrant);
        } catch {
          return managerError("AUTHORIZATION_FAILED", "Workspace authorization failed");
        }
        if (!authorized.ok) {
          return managerError("AUTHORIZATION_FAILED", authorized.error.message);
        }
        if (authorized.value.provider !== existing.grant.provider) {
          return managerError(
            "AUTHORIZATION_FAILED",
            "The selected workspace belongs to a different provider",
          );
        }

        let capabilities: WorkspaceCapability;
        try {
          capabilities = options.capabilitiesFor(authorized.value);
        } catch {
          return managerError(
            "AUTHORIZATION_FAILED",
            "Workspace capabilities could not be determined",
          );
        }
        const updated: WorkspaceRecord = Object.freeze({
          grant: Object.freeze({
            ...authorized.value,
            workspaceId: existing.grant.workspaceId,
            displayName: existing.grant.displayName,
            createdAt: existing.grant.createdAt,
          }),
          capabilities: Object.freeze({ ...capabilities }),
          pinned: existing.pinned,
        });
        const saved = await saveCatalog(upsertWorkspaceRecord(loaded.value, updated));
        return saved.ok ? success(updated) : saved;
      });
    },

    async restore(workspaceId) {
      return serialize(() => restoreRecord(workspaceId));
    },

    async restoreActive() {
      return serialize(async () => {
        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        const activeId = loaded.value.activeWorkspaceId;
        if (activeId === null) return success(null);
        return restoreRecord(activeId);
      });
    },

    async select(workspaceId) {
      return serialize(async () => {
        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        const selected = selectActiveWorkspace(loaded.value, workspaceId);
        if (!selected.ok) return managerError("WORKSPACE_NOT_FOUND", selected.error.message);
        return saveCatalog(selected.value);
      });
    },

    async rename(workspaceId, displayName) {
      return serialize(async () => {
        const normalized = normalizeDisplayName(displayName);
        if (normalized === null) {
          return managerError(
            "INVALID_DISPLAY_NAME",
            "Workspace name must be between 1 and 200 characters",
          );
        }
        return updateRecord(workspaceId, (record) =>
          recordWithGrant(record, Object.freeze({ ...record.grant, displayName: normalized })),
        );
      });
    },

    async pin(workspaceId, pinned) {
      return serialize(() =>
        updateRecord(workspaceId, (record) => Object.freeze({ ...record, pinned })),
      );
    },

    async remove(workspaceId) {
      return serialize(async () => {
        const loaded = await loadCatalog();
        if (!loaded.ok) return loaded;
        if (!loaded.value.workspaces.some((record) => record.grant.workspaceId === workspaceId)) {
          return managerError("WORKSPACE_NOT_FOUND", "The workspace is not in the catalog");
        }
        return saveCatalog(removeWorkspaceRecord(loaded.value, workspaceId));
      });
    },
  });
}
