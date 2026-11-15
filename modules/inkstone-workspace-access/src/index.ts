import { requireOptionalNativeModule } from "expo-modules-core";

export type ResolvedWorkspaceBookmark = Readonly<{
  uri: string;
  stale: boolean;
  serializedBookmark: string;
}>;

type WorkspaceAccessNativeModule = Readonly<{
  createBookmark(uri: string): string;
  resolveBookmark(serializedBookmark: string): ResolvedWorkspaceBookmark;
  stopAccessing(uri: string): void;
  androidBuildNumber?(): number;
  installAndroidUpdate?(sha256: string, build: number): Promise<boolean>;
  openAndroidInstallPermission?(): void;
  performClickHaptic?(): boolean;
  setEditorInputEnabled?(viewId: number, enabled: boolean): Promise<void>;
}>;

const nativeModule =
  requireOptionalNativeModule<WorkspaceAccessNativeModule>("InkstoneWorkspaceAccess");

export function isWorkspaceBookmarkAvailable(): boolean {
  return nativeModule !== null;
}

export function createWorkspaceBookmark(uri: string): string {
  if (nativeModule === null) throw new Error("Native iOS workspace bookmarks are unavailable");
  return nativeModule.createBookmark(uri);
}

export function resolveWorkspaceBookmark(serializedBookmark: string): ResolvedWorkspaceBookmark {
  if (nativeModule === null) throw new Error("Native iOS workspace bookmarks are unavailable");
  return Object.freeze({ ...nativeModule.resolveBookmark(serializedBookmark) });
}

export function stopAccessingWorkspace(uri: string): void {
  nativeModule?.stopAccessing(uri);
}

export function performClickHaptic(): boolean {
  return nativeModule?.performClickHaptic?.() ?? false;
}

export function setEditorInputEnabled(viewId: number, enabled: boolean): Promise<void> {
  return nativeModule?.setEditorInputEnabled?.(viewId, enabled) ?? Promise.resolve();
}

export function androidBuildNumber(): number | undefined {
  return nativeModule?.androidBuildNumber?.();
}

export async function installAndroidUpdate(sha256: string, build: number): Promise<boolean> {
  if (!nativeModule?.installAndroidUpdate) throw new Error("Android installer is unavailable");
  return nativeModule.installAndroidUpdate(sha256, build);
}

export function openAndroidInstallPermission(): void {
  nativeModule?.openAndroidInstallPermission?.();
}
