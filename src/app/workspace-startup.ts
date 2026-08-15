import type { RecoveryDraftStore } from "../recovery/recovery-draft-store";
import type { WorkspaceCatalog, WorkspaceRecord } from "../workspace/workspace-catalog";
import type { WorkspaceManager } from "../workspace/workspace-manager";
import type { WorkspaceRepository } from "../workspace/workspace-repository";

export type ActiveWorkspaceServices = Readonly<{
  repository: WorkspaceRepository;
  recoveryStore: RecoveryDraftStore;
}>;

export type WorkspaceStartupServices<
  TServices extends ActiveWorkspaceServices = ActiveWorkspaceServices,
> = ActiveWorkspaceServices &
  Readonly<{
    managedWorkspace: WorkspaceRecord;
    workspaceManager: WorkspaceManager;
    activateWorkspace: (record: WorkspaceRecord) => TServices;
  }>;

export type StartupWorkspaceResult<TServices extends ActiveWorkspaceServices> = Readonly<{
  catalog: WorkspaceCatalog;
  services: TServices | null;
  needsWorkspace: boolean;
  error: string | null;
}>;

async function preflightWorkspace(
  services: ActiveWorkspaceServices,
): Promise<Readonly<{ documentCount: number; recoveryDraftCount: number }> | null> {
  const [documents, recoveryDrafts] = await Promise.all([
    services.repository.list(),
    services.recoveryStore.list(),
  ]);
  if (!documents.ok) return null;
  return Object.freeze({
    documentCount: documents.value.length,
    recoveryDraftCount: recoveryDrafts.length,
  });
}

export async function openStartupWorkspace<TServices extends ActiveWorkspaceServices>(
  baseServices: WorkspaceStartupServices<TServices>,
): Promise<StartupWorkspaceResult<TServices>> {
  const loaded = await baseServices.workspaceManager.load();
  if (!loaded.ok) throw new Error(loaded.error.message);

  if (loaded.value.activeWorkspaceId === null) {
    const preflight = await preflightWorkspace(baseServices);
    if (!preflight) throw new Error("The app-managed workspace could not be checked");
    if (preflight.documentCount + preflight.recoveryDraftCount === 0) {
      return Object.freeze({
        catalog: loaded.value,
        services: null,
        needsWorkspace: true,
        error: null,
      });
    }
    const ensured = await baseServices.workspaceManager.ensureManaged(
      baseServices.managedWorkspace,
    );
    if (!ensured.ok) throw new Error(ensured.error.message);
    const selected = await baseServices.workspaceManager.select(ensured.value.grant.workspaceId);
    if (!selected.ok) throw new Error(selected.error.message);
    return Object.freeze({
      catalog: selected.value,
      services: baseServices.activateWorkspace(ensured.value),
      needsWorkspace: false,
      error: null,
    });
  }

  const active = loaded.value.workspaces.find(
    (record) => record.grant.workspaceId === loaded.value.activeWorkspaceId,
  );
  if (!active) throw new Error("The active workspace record is missing");
  if (active.grant.provider === "managed") {
    const services = baseServices.activateWorkspace(active);
    const preflight = await preflightWorkspace(services);
    if (!preflight) throw new Error("The app-managed workspace could not be checked");
    return Object.freeze({
      catalog: loaded.value,
      services,
      needsWorkspace: false,
      error: null,
    });
  }

  const restored = await baseServices.workspaceManager.restoreActive();
  const refreshed = await baseServices.workspaceManager.load();
  if (!refreshed.ok) throw new Error(refreshed.error.message);
  if (!restored.ok || restored.value === null) {
    return Object.freeze({
      catalog: refreshed.value,
      services: null,
      needsWorkspace: true,
      error: restored.ok ? "Workspace access could not be restored" : restored.error.message,
    });
  }
  const services = baseServices.activateWorkspace(restored.value);
  const preflight = await preflightWorkspace(services);
  if (!preflight) {
    return Object.freeze({
      catalog: refreshed.value,
      services: null,
      needsWorkspace: true,
      error: "The linked workspace could not be read",
    });
  }
  return Object.freeze({
    catalog: refreshed.value,
    services,
    needsWorkspace: false,
    error: null,
  });
}
