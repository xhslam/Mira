import { z } from "zod";

import type { WorkspaceId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import type { VaultStorage } from "./vault-storage";
import type { WorkspaceCapability, WorkspaceGrant } from "./workspace-adapter";

export const WORKSPACE_CATALOG_PATH = "metadata/workspaces.json";

export type WorkspaceRecord = Readonly<{
  grant: WorkspaceGrant;
  capabilities: WorkspaceCapability;
  pinned: boolean;
}>;

export type WorkspaceCatalog = Readonly<{
  version: 1;
  activeWorkspaceId: WorkspaceId | null;
  workspaces: readonly WorkspaceRecord[];
}>;

export type WorkspaceCatalogError = Readonly<{
  code: "INVALID_CATALOG" | "IO_FAILURE";
  message: string;
}>;

export type WorkspaceCatalogStore = Readonly<{
  load(): Promise<Result<WorkspaceCatalog, WorkspaceCatalogError>>;
  save(catalog: WorkspaceCatalog): Promise<Result<void, WorkspaceCatalogError>>;
}>;

const workspaceProviderSchema = z.enum(["managed", "android-saf", "ios-bookmark"]);
const workspaceGrantSchema = z
  .object({
    workspaceId: z.string().uuid(),
    provider: workspaceProviderSchema,
    displayName: z.string().min(1).max(200),
    locationSummary: z.string().min(1).max(500),
    serializedGrant: z.string().min(1).max(16_384),
    status: z.enum(["authorized", "needs-reauthorization", "offline"]),
    createdAt: z.string().datetime(),
    lastOpenedAt: z.string().datetime().nullable(),
  })
  .strict();
const workspaceCapabilitySchema = z
  .object({
    read: z.boolean(),
    write: z.boolean(),
    atomicReplace: z.boolean(),
    create: z.boolean(),
    rename: z.boolean(),
    move: z.boolean(),
    copy: z.boolean(),
    remove: z.boolean(),
    trash: z.boolean(),
    watch: z.boolean(),
    share: z.boolean(),
  })
  .strict();
const workspaceRecordSchema = z
  .object({
    grant: workspaceGrantSchema,
    capabilities: workspaceCapabilitySchema,
    pinned: z.boolean(),
  })
  .strict();
const workspaceCatalogSchema = z
  .object({
    version: z.literal(1),
    activeWorkspaceId: z.string().uuid().nullable(),
    workspaces: z.array(workspaceRecordSchema).max(32),
  })
  .strict();

const EMPTY_CATALOG: WorkspaceCatalog = Object.freeze({
  version: 1,
  activeWorkspaceId: null,
  workspaces: Object.freeze([]),
});

function freezeCapability(capability: WorkspaceCapability): WorkspaceCapability {
  return Object.freeze({ ...capability });
}

function freezeGrant(grant: WorkspaceGrant): WorkspaceGrant {
  return Object.freeze({ ...grant });
}

function freezeRecord(record: WorkspaceRecord): WorkspaceRecord {
  return Object.freeze({
    grant: freezeGrant(record.grant),
    capabilities: freezeCapability(record.capabilities),
    pinned: record.pinned,
  });
}

function freezeCatalog(catalog: WorkspaceCatalog): WorkspaceCatalog {
  return Object.freeze({
    version: 1,
    activeWorkspaceId: catalog.activeWorkspaceId,
    workspaces: Object.freeze(catalog.workspaces.map(freezeRecord)),
  });
}

function invalidCatalog(message: string): Result<never, WorkspaceCatalogError> {
  return failure(Object.freeze({ code: "INVALID_CATALOG", message }));
}

function parseCatalog(input: unknown): Result<WorkspaceCatalog, WorkspaceCatalogError> {
  const parsed = workspaceCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return invalidCatalog(parsed.error.issues[0]?.message ?? "Invalid workspace catalog");
  }

  const records = parsed.data.workspaces.map((record) =>
    freezeRecord({
      ...record,
      grant: {
        ...record.grant,
        workspaceId: record.grant.workspaceId as WorkspaceId,
      },
    }),
  );
  const ids = new Set<WorkspaceId>();
  for (const record of records) {
    if (ids.has(record.grant.workspaceId as WorkspaceId)) {
      return invalidCatalog("Workspace IDs must be unique");
    }
    ids.add(record.grant.workspaceId as WorkspaceId);
  }
  if (
    parsed.data.activeWorkspaceId !== null &&
    !ids.has(parsed.data.activeWorkspaceId as WorkspaceId)
  ) {
    return invalidCatalog("Active workspace must exist in the catalog");
  }

  return success(
    freezeCatalog({
      version: 1,
      activeWorkspaceId: parsed.data.activeWorkspaceId as WorkspaceId | null,
      workspaces: records,
    }),
  );
}

export function createWorkspaceCatalogStore(storage: VaultStorage): WorkspaceCatalogStore {
  return Object.freeze({
    async load() {
      let raw: string | null;
      try {
        raw = await storage.read(WORKSPACE_CATALOG_PATH);
      } catch {
        return failure(
          Object.freeze({ code: "IO_FAILURE", message: "Workspace catalog could not be read" }),
        );
      }
      if (raw === null) return success(EMPTY_CATALOG);
      try {
        return parseCatalog(JSON.parse(raw) as unknown);
      } catch {
        return invalidCatalog("Workspace catalog is not valid JSON");
      }
    },

    async save(catalog) {
      const validated = parseCatalog(catalog);
      if (!validated.ok) return validated;
      try {
        await storage.write(WORKSPACE_CATALOG_PATH, JSON.stringify(validated.value));
        return success(undefined);
      } catch {
        return failure(
          Object.freeze({ code: "IO_FAILURE", message: "Workspace catalog could not be saved" }),
        );
      }
    },
  });
}

export function upsertWorkspaceRecord(
  catalog: WorkspaceCatalog,
  record: WorkspaceRecord,
): WorkspaceCatalog {
  const existing = catalog.workspaces.some(
    (item) => item.grant.workspaceId === record.grant.workspaceId,
  );
  const workspaces = existing
    ? catalog.workspaces.map((item) =>
        item.grant.workspaceId === record.grant.workspaceId ? record : item,
      )
    : [...catalog.workspaces, record];
  return freezeCatalog({
    ...catalog,
    workspaces,
    activeWorkspaceId: catalog.activeWorkspaceId ?? record.grant.workspaceId,
  });
}

export function selectActiveWorkspace(
  catalog: WorkspaceCatalog,
  workspaceId: WorkspaceId,
): Result<WorkspaceCatalog, WorkspaceCatalogError> {
  if (!catalog.workspaces.some((record) => record.grant.workspaceId === workspaceId)) {
    return invalidCatalog("Active workspace must exist in the catalog");
  }
  return success(freezeCatalog({ ...catalog, activeWorkspaceId: workspaceId }));
}

export function removeWorkspaceRecord(
  catalog: WorkspaceCatalog,
  workspaceId: WorkspaceId,
): WorkspaceCatalog {
  const workspaces = catalog.workspaces.filter(
    (record) => record.grant.workspaceId !== workspaceId,
  );
  const activeWorkspaceId =
    catalog.activeWorkspaceId === workspaceId
      ? (workspaces[0]?.grant.workspaceId ?? null)
      : catalog.activeWorkspaceId;
  return freezeCatalog({ ...catalog, activeWorkspaceId, workspaces });
}
