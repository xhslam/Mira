import type { WorkspaceId } from "../domain/identifiers";
import type { VaultStorage } from "./vault-storage";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";

export type WorkspaceDirectoryStore = Readonly<{
  list(): Promise<readonly WorkspacePath[]>;
  replace(paths: readonly WorkspacePath[]): Promise<void>;
}>;

type SerializedDirectories = Readonly<{ version: 1; paths: readonly string[] }>;

function parseDirectories(serialized: string | null): readonly WorkspacePath[] {
  if (serialized === null) return Object.freeze([]);
  const input = JSON.parse(serialized) as unknown;
  if (typeof input !== "object" || input === null) throw new Error("Invalid directory catalog");
  const record = input as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.paths)) {
    throw new Error("Invalid directory catalog");
  }
  const paths = record.paths.map((value) => {
    if (typeof value !== "string") throw new Error("Invalid directory catalog path");
    const parsed = parseWorkspacePath(value);
    if (!parsed.ok) throw new Error("Invalid directory catalog path");
    return parsed.value;
  });
  return Object.freeze([...new Set(paths)].sort((left, right) => left.localeCompare(right)));
}

export function createWorkspaceDirectoryStore(
  storage: VaultStorage,
  workspaceId: WorkspaceId,
): WorkspaceDirectoryStore {
  const storagePath = `workspace-directories/${workspaceId}.json`;
  return Object.freeze({
    async list() {
      return parseDirectories(await storage.read(storagePath));
    },
    async replace(paths) {
      const normalized = paths.map((path) => {
        const parsed = parseWorkspacePath(path);
        if (!parsed.ok) throw new Error("Invalid directory catalog path");
        return parsed.value;
      });
      const payload: SerializedDirectories = Object.freeze({
        version: 1,
        paths: Object.freeze(
          [...new Set(normalized)].sort((left, right) => left.localeCompare(right)),
        ),
      });
      await storage.write(storagePath, JSON.stringify(payload));
    },
  });
}
