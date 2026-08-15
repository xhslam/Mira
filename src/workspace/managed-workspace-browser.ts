import { failure, type Result, success } from "../domain/result";
import type { FileEntry } from "./workspace-adapter";
import {
  createRepositoryWorkspaceBrowser,
  createWorkspaceConflictPath,
  type WorkspaceBrowser,
  type WorkspaceBrowserError,
  type WorkspaceConflictPolicy,
} from "./workspace-browser";
import type { WorkspaceDirectoryStore } from "./workspace-directory-store";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";
import type { WorkspaceDocumentSnapshot, WorkspaceRepository } from "./workspace-repository";
import type { WorkspaceFileShare } from "./workspace-file-share";

function browserError(
  code: WorkspaceBrowserError["code"],
  path: string,
  message: string,
): Result<never, WorkspaceBrowserError> {
  return failure(Object.freeze({ code, path, message }));
}

function directoryEntry(path: WorkspacePath): FileEntry {
  return Object.freeze({
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "directory",
    size: null,
    modifiedAt: null,
    contentType: null,
  });
}

function freezeEntries(entries: readonly FileEntry[]): readonly FileEntry[] {
  return Object.freeze(
    entries
      .filter(
        (entry, index) => entries.findIndex((candidate) => candidate.path === entry.path) === index,
      )
      .map((entry) => Object.freeze({ ...entry }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

function validatePath(path: string): Result<WorkspacePath, WorkspaceBrowserError> {
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed : browserError("INVALID_PATH", path, "Workspace path is invalid");
}

function isWithin(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function relocatedPath(path: WorkspacePath, from: WorkspacePath, to: WorkspacePath): WorkspacePath {
  const suffix = path.slice(from.length);
  const parsed = parseWorkspacePath(`${to}${suffix}`);
  if (!parsed.ok) throw new Error("Generated workspace path is invalid");
  return parsed.value;
}

export function createManagedWorkspaceBrowser(options: {
  repository: WorkspaceRepository;
  directoryStore: WorkspaceDirectoryStore;
  share?: WorkspaceFileShare["share"];
}): WorkspaceBrowser {
  const files = createRepositoryWorkspaceBrowser(options.repository, options.share);
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function listAll(): Promise<Result<readonly FileEntry[], WorkspaceBrowserError>> {
    const listed = await files.list();
    if (!listed.ok) return listed;
    try {
      const explicit = await options.directoryStore.list();
      return success(freezeEntries([...listed.value, ...explicit.map(directoryEntry)]));
    } catch {
      return browserError("IO_FAILURE", "", "The managed directory catalog could not be read");
    }
  }

  async function directoryTransfer(
    kind: "move" | "copy",
    fromInput: string,
    toInput: string,
    conflict: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>> {
    const from = validatePath(fromInput);
    if (!from.ok) return from;
    const to = validatePath(toInput);
    if (!to.ok) return to;
    if (to.value.startsWith(`${from.value}/`)) {
      return browserError("INVALID_PATH", to.value, "A directory cannot be placed inside itself");
    }
    const listed = await listAll();
    if (!listed.ok) return listed;
    const source = listed.value.find(
      (entry) => entry.path === from.value && entry.kind === "directory",
    );
    if (!source) {
      return kind === "move"
        ? files.move(from.value, to.value, conflict)
        : files.copy(from.value, to.value, conflict);
    }

    let target = to.value;
    const occupied = listed.value.map((entry) => entry.path);
    if (conflict === "replace") {
      return browserError(
        "UNSUPPORTED",
        target,
        "Replacing a directory is disabled because the provider cannot guarantee atomic rollback",
      );
    }
    if (conflict === "keep-both") {
      const parsed = validatePath(createWorkspaceConflictPath(target, occupied));
      if (!parsed.ok) return parsed;
      target = parsed.value;
    } else if (occupied.includes(target)) {
      return browserError("ALREADY_EXISTS", target, "A workspace entry already exists here");
    }

    const sourceFiles = listed.value.filter(
      (entry) => entry.kind === "file" && isWithin(entry.path, from.value),
    );
    const sourceDirectories = listed.value.filter(
      (entry) => entry.kind === "directory" && isWithin(entry.path, from.value),
    );
    const mutableCompleted: Readonly<{ from: WorkspacePath; to: WorkspacePath }>[] = [];
    for (const entry of sourceFiles) {
      const destination = relocatedPath(entry.path, from.value, target);
      const result =
        kind === "move"
          ? await files.move(entry.path, destination, "fail")
          : await files.copy(entry.path, destination, "fail");
      if (!result.ok) {
        for (const item of [...mutableCompleted].reverse()) {
          if (kind === "move") await files.move(item.to, item.from, "fail");
          else await files.remove(item.to, "permanent");
        }
        return result;
      }
      mutableCompleted.push(Object.freeze({ from: entry.path, to: destination }));
    }
    try {
      const currentDirectories = await options.directoryStore.list();
      const retained =
        kind === "move"
          ? currentDirectories.filter((path) => !isWithin(path, from.value))
          : currentDirectories;
      const relocated = sourceDirectories.map((entry) =>
        relocatedPath(entry.path, from.value, target),
      );
      await options.directoryStore.replace([...retained, ...relocated]);
    } catch {
      for (const item of [...mutableCompleted].reverse()) {
        if (kind === "move") await files.move(item.to, item.from, "fail");
        else await files.remove(item.to, "permanent");
      }
      return browserError("IO_FAILURE", from.value, "The directory catalog update failed");
    }
    return success(directoryEntry(target));
  }

  async function removeDirectory(
    path: WorkspacePath,
  ): Promise<Result<void, WorkspaceBrowserError>> {
    const listed = await listAll();
    if (!listed.ok) return listed;
    const directory = listed.value.find(
      (entry) => entry.path === path && entry.kind === "directory",
    );
    if (!directory) return files.remove(path, "permanent");
    const containedFiles = listed.value.filter(
      (entry) => entry.kind === "file" && isWithin(entry.path, path),
    );
    const snapshots: WorkspaceDocumentSnapshot[] = [];
    for (const entry of containedFiles) {
      const snapshot = await options.repository.read(entry.path);
      if (!snapshot.ok) {
        return browserError("IO_FAILURE", entry.path, "A directory file could not be prepared");
      }
      snapshots.push(snapshot.value);
    }
    const removed: WorkspaceDocumentSnapshot[] = [];
    for (const snapshot of snapshots) {
      const result = await files.remove(snapshot.path, "permanent");
      if (!result.ok) {
        for (const restore of removed) {
          await options.repository.create({ path: restore.path, markdown: restore.markdown });
        }
        return result;
      }
      removed.push(snapshot);
    }
    try {
      const directories = await options.directoryStore.list();
      await options.directoryStore.replace(directories.filter((item) => !isWithin(item, path)));
      return success(undefined);
    } catch {
      for (const restore of removed) {
        await options.repository.create({ path: restore.path, markdown: restore.markdown });
      }
      return browserError("IO_FAILURE", path, "The directory catalog update failed");
    }
  }

  return Object.freeze({
    capabilities: Object.freeze({
      ...files.capabilities,
      createDirectory: true,
      renameDirectory: true,
      moveDirectory: true,
      copyDirectory: true,
      removeDirectory: true,
    }),
    async list() {
      await operationTail;
      return listAll();
    },
    createFile: files.createFile,
    async createDirectory(pathInput) {
      const path = validatePath(pathInput);
      if (!path.ok) return path;
      return serialize(async () => {
        const listed = await listAll();
        if (!listed.ok) return listed;
        if (listed.value.some((entry) => entry.path === path.value)) {
          return browserError(
            "ALREADY_EXISTS",
            path.value,
            "A workspace entry already exists here",
          );
        }
        const parent = path.value.split("/").slice(0, -1).join("/");
        if (
          parent.length > 0 &&
          !listed.value.some((entry) => entry.path === parent && entry.kind === "directory")
        ) {
          return browserError("NOT_FOUND", parent, "The parent directory does not exist");
        }
        try {
          const directories = await options.directoryStore.list();
          await options.directoryStore.replace([...directories, path.value]);
          return success(directoryEntry(path.value));
        } catch {
          return browserError("IO_FAILURE", path.value, "The directory could not be created");
        }
      });
    },
    async rename(from, to, conflict = "fail") {
      return serialize(() => directoryTransfer("move", from, to, conflict));
    },
    async move(from, to, conflict = "fail") {
      return serialize(() => directoryTransfer("move", from, to, conflict));
    },
    async copy(from, to, conflict = "fail") {
      return serialize(() => directoryTransfer("copy", from, to, conflict));
    },
    async remove(pathInput, mode) {
      if (mode === "trash") return files.remove(pathInput, mode);
      const path = validatePath(pathInput);
      if (!path.ok) return path;
      return serialize(() => removeDirectory(path.value));
    },
    share: files.share,
  });
}
