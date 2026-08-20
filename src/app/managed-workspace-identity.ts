import type { WorkspaceGrant } from "../workspace/workspace-adapter";
import type { Translator } from "./locale";

/**
 * The app-managed workspace is synthesized in code, so its name and location
 * are English constants persisted into the workspace catalog. Users can rename
 * it, and a rename must survive a language switch. So these two constants are
 * the only values we localize at render time: anything else is user data.
 */
export const MANAGED_WORKSPACE_DEFAULT_NAME = "App-managed workspace";
export const MANAGED_WORKSPACE_DEFAULT_LOCATION = "Private Inkstone storage on this device";

/** Localizes the built-in managed workspace name, preserving user renames. */
export function resolveWorkspaceName(grant: WorkspaceGrant, t: Translator): string {
  if (grant.provider !== "managed") return grant.displayName;
  if (grant.displayName !== MANAGED_WORKSPACE_DEFAULT_NAME) return grant.displayName;
  return t("workspace.managedName");
}

/** Localizes the built-in managed workspace location summary. */
export function resolveWorkspaceLocation(grant: WorkspaceGrant, t: Translator): string {
  if (grant.provider !== "managed") return grant.locationSummary;
  if (grant.locationSummary !== MANAGED_WORKSPACE_DEFAULT_LOCATION) return grant.locationSummary;
  return t("workspace.managedLocation");
}
