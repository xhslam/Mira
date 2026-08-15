import type { WorkspaceAdapter } from "../workspace/workspace-adapter";
import { parseWorkspacePath, type WorkspacePath } from "../workspace/workspace-path";
import type { BackupBinaryFile, BackupBinaryWorkspace } from "./backup-service";

function checkedPath(path: string): WorkspacePath {
  const parsed = parseWorkspacePath(path);
  if (!parsed.ok) throw new Error(`Invalid backup path: ${path}`);
  return parsed.value;
}

export function createAdapterBackupWorkspace(adapter: WorkspaceAdapter): BackupBinaryWorkspace {
  if (!adapter.readBytes || !adapter.createFileBytes || !adapter.writeBytes) {
    throw new Error("The workspace adapter does not support binary-safe backup");
  }
  const readBytes = adapter.readBytes;
  const createFileBytes = adapter.createFileBytes;
  const writeBytes = adapter.writeBytes;

  async function listPaths(
    directory?: WorkspacePath,
  ): Promise<Readonly<{ files: readonly WorkspacePath[]; directories: readonly WorkspacePath[] }>> {
    const listed = await adapter.list(directory);
    if (!listed.ok) throw new Error(listed.error.message);
    let files: readonly WorkspacePath[] = Object.freeze([]);
    let directories: readonly WorkspacePath[] = Object.freeze([]);
    for (const entry of listed.value) {
      if (entry.kind === "file") files = Object.freeze([...files, entry.path]);
      else {
        directories = Object.freeze([...directories, entry.path]);
        const child = await listPaths(entry.path);
        files = Object.freeze([...files, ...child.files]);
        directories = Object.freeze([...directories, ...child.directories]);
      }
    }
    return Object.freeze({ files, directories });
  }

  async function ensureParents(path: WorkspacePath): Promise<void> {
    const segments = path.split("/").slice(0, -1);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const parsed = checkedPath(current);
      const existing = await adapter.stat(parsed);
      if (existing.ok) continue;
      if (existing.error.code !== "NOT_FOUND") throw new Error(existing.error.message);
      const created = await adapter.createDirectory(parsed);
      if (!created.ok) throw new Error(created.error.message);
    }
  }

  async function read(path: string): Promise<BackupBinaryFile> {
    const result = await readBytes(checkedPath(path));
    if (!result.ok) throw new Error(result.error.message);
    return Object.freeze({
      path: result.value.path,
      contents: new Uint8Array(result.value.content),
      revision: result.value.revision,
    });
  }

  return Object.freeze({
    async list() {
      const paths = await listPaths();
      return Object.freeze(await Promise.all(paths.files.map((path) => read(path))));
    },
    read,
    async create(path, contents) {
      const parsed = checkedPath(path);
      await ensureParents(parsed);
      const result = await createFileBytes(parsed, contents);
      if (!result.ok) throw new Error(result.error.message);
    },
    async replace(path, contents, expectedRevision) {
      const result = await writeBytes(checkedPath(path), contents, expectedRevision);
      if (!result.ok) throw new Error(result.error.message);
    },
    async remove(path) {
      const result = await adapter.remove(checkedPath(path), "permanent");
      if (!result.ok) throw new Error(result.error.message);
    },
  });
}
