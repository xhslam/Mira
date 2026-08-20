import { failure, type Result, success } from "../domain/result";
import type { FileEntry, WorkspaceAdapter, WorkspaceAdapterError } from "./workspace-adapter";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";
import type { WorkspaceRepository, WorkspaceRepositoryError } from "./workspace-repository";
import type { WorkspaceFileShare, WorkspaceShareError } from "./workspace-file-share";

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_DEPTH = 32;

export type WorkspaceConflictPolicy = "fail" | "replace" | "keep-both";

export type WorkspaceBrowserCapabilities = Readonly<{
  createFile: boolean;
  createDirectory: boolean;
  createReplace: boolean;
  createKeepBoth: boolean;
  rename: boolean;
  renameDirectory: boolean;
  renameReplace: boolean;
  renameKeepBoth: boolean;
  move: boolean;
  moveDirectory: boolean;
  moveReplace: boolean;
  moveKeepBoth: boolean;
  copy: boolean;
  copyDirectory: boolean;
  copyReplace: boolean;
  copyKeepBoth: boolean;
  remove: boolean;
  removeDirectory: boolean;
  trash: boolean;
  share: boolean;
}>;

export type WorkspaceBrowserErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "PERMISSION_REVOKED"
  | "READ_ONLY"
  | "OFFLINE"
  | "UNSUPPORTED"
  | "LIMIT_EXCEEDED"
  | "IO_FAILURE";

export type WorkspaceBrowserError = Readonly<{
  code: WorkspaceBrowserErrorCode;
  path: string;
  message: string;
}>;

export type WorkspaceBrowser = Readonly<{
  capabilities: WorkspaceBrowserCapabilities;
  list(): Promise<Result<readonly FileEntry[], WorkspaceBrowserError>>;
  createFile(
    path: string,
    content: string,
    conflict?: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>>;
  createDirectory(path: string): Promise<Result<FileEntry, WorkspaceBrowserError>>;
  rename(
    from: string,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>>;
  move(
    from: string,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>>;
  copy(
    from: string,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>>;
  remove(path: string, mode: "trash" | "permanent"): Promise<Result<void, WorkspaceBrowserError>>;
  share(path: string): Promise<Result<void, WorkspaceBrowserError>>;
}>;

export type AdapterWorkspaceBrowserOptions = Readonly<{
  adapter: WorkspaceAdapter;
  share?: WorkspaceFileShare["share"];
  maxEntries?: number;
  maxDepth?: number;
}>;

function browserFailure(
  code: WorkspaceBrowserErrorCode,
  path: string,
  message: string,
): Result<never, WorkspaceBrowserError> {
  return failure(Object.freeze({ code, path, message }));
}

function mapAdapterError(error: WorkspaceAdapterError): Result<never, WorkspaceBrowserError> {
  const code: WorkspaceBrowserErrorCode =
    error.code === "EXTERNAL_MODIFICATION" ? "IO_FAILURE" : error.code;
  return browserFailure(code, error.path, error.message);
}

function mapRepositoryError(error: WorkspaceRepositoryError): Result<never, WorkspaceBrowserError> {
  const code: WorkspaceBrowserErrorCode =
    error.code === "INVALID_PATH" || error.code === "NOT_FOUND" || error.code === "ALREADY_EXISTS"
      ? error.code
      : "IO_FAILURE";
  return browserFailure(code, error.path, "The managed workspace could not be browsed");
}

function mapShareError(error: WorkspaceShareError): Result<never, WorkspaceBrowserError> {
  const code: WorkspaceBrowserErrorCode =
    error.code === "UNAVAILABLE" || error.code === "SHARE_FAILED" ? "IO_FAILURE" : error.code;
  return browserFailure(code, error.path, error.message);
}

function validateBounds(maxEntries: number, maxDepth: number): void {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Workspace browser entry limit must be a positive integer");
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error("Workspace browser depth limit must be a non-negative integer");
  }
}

function freezeEntries(entries: readonly FileEntry[]): readonly FileEntry[] {
  return Object.freeze(
    entries
      .map((entry) => Object.freeze({ ...entry }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
}

function validatePath(path: string): Result<WorkspacePath, WorkspaceBrowserError> {
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed : browserFailure("INVALID_PATH", path, "Workspace path is invalid");
}

function unsupported(path: string): Result<never, WorkspaceBrowserError> {
  return browserFailure("UNSUPPORTED", path, "This workspace does not support that operation");
}

function fileEntry(path: WorkspacePath, content: string): FileEntry {
  return Object.freeze({
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "file",
    size: new TextEncoder().encode(content).byteLength,
    modifiedAt: null,
    contentType: "text/plain",
  });
}

export function createWorkspaceConflictPath(
  path: string,
  occupiedPaths: readonly string[],
): string {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const occupied = new Set(occupiedPaths);
  if (!occupied.has(path)) return path;
  let sequence = 2;
  let candidate = `${directory}${stem} (${sequence})${extension}`;
  while (occupied.has(candidate)) {
    sequence += 1;
    candidate = `${directory}${stem} (${sequence})${extension}`;
  }
  return candidate;
}

async function listAdapterEntries(
  adapter: WorkspaceAdapter,
  maxEntries: number,
  maxDepth: number,
): Promise<Result<readonly FileEntry[], WorkspaceBrowserError>> {
  let pending: readonly Readonly<{ path?: WorkspacePath; depth: number }>[] = Object.freeze([
    Object.freeze({ depth: 0 }),
  ]);
  let entries: readonly FileEntry[] = Object.freeze([]);

  while (pending.length > 0) {
    const current = pending[0];
    if (!current) break;
    pending = Object.freeze(pending.slice(1));
    let listed: Awaited<ReturnType<WorkspaceAdapter["list"]>>;
    try {
      listed = await adapter.list(current.path);
    } catch {
      return browserFailure("IO_FAILURE", current.path ?? "", "Workspace browsing failed");
    }
    if (!listed.ok) return mapAdapterError(listed.error);
    if (entries.length + listed.value.length > maxEntries) {
      return browserFailure(
        "LIMIT_EXCEEDED",
        current.path ?? "",
        "Workspace browser entry limit exceeded",
      );
    }

    const directories = listed.value.filter((entry) => entry.kind === "directory");
    if (directories.length > 0 && current.depth >= maxDepth) {
      return browserFailure(
        "LIMIT_EXCEEDED",
        current.path ?? "",
        "Workspace browser depth limit exceeded",
      );
    }
    entries = Object.freeze([...entries, ...listed.value]);
    pending = Object.freeze([
      ...pending,
      ...directories.map((entry) => Object.freeze({ path: entry.path, depth: current.depth + 1 })),
    ]);
  }

  return success(freezeEntries(entries));
}

export function createAdapterWorkspaceBrowser(
  options: AdapterWorkspaceBrowserOptions,
): WorkspaceBrowser {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  validateBounds(maxEntries, maxDepth);
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function entryCommand(
    capability: boolean,
    source: string,
    destination: string,
    command: (
      from: WorkspacePath,
      to: WorkspacePath,
    ) => Promise<Result<FileEntry, WorkspaceAdapterError>>,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>> {
    if (!capability) return unsupported(source);
    const from = validatePath(source);
    if (!from.ok) return from;
    const to = validatePath(destination);
    if (!to.ok) return to;
    return serialize(async () => {
      try {
        const result = await command(from.value, to.value);
        return result.ok
          ? success(Object.freeze({ ...result.value }))
          : mapAdapterError(result.error);
      } catch {
        return browserFailure("IO_FAILURE", source, "Workspace operation failed");
      }
    });
  }

  return Object.freeze({
    capabilities: Object.freeze({
      createFile: options.adapter.capabilities.create,
      createDirectory: options.adapter.capabilities.create,
      createReplace: options.adapter.capabilities.create && options.adapter.capabilities.write,
      createKeepBoth: options.adapter.capabilities.create,
      rename: options.adapter.capabilities.rename,
      renameDirectory: options.adapter.capabilities.rename,
      renameReplace: false,
      renameKeepBoth: options.adapter.capabilities.rename,
      move: options.adapter.capabilities.move,
      moveDirectory: options.adapter.capabilities.move,
      moveReplace: false,
      moveKeepBoth: options.adapter.capabilities.move,
      copy: options.adapter.capabilities.copy,
      copyDirectory: options.adapter.capabilities.copy,
      copyReplace: false,
      copyKeepBoth: options.adapter.capabilities.copy,
      remove: options.adapter.capabilities.remove,
      removeDirectory: options.adapter.capabilities.remove,
      trash: options.adapter.capabilities.trash,
      share: options.adapter.capabilities.share && options.share !== undefined,
    }),
    async list() {
      await operationTail;
      return listAdapterEntries(options.adapter, maxEntries, maxDepth);
    },
    async createFile(path, content, conflict = "fail") {
      if (!options.adapter.capabilities.create) return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      return serialize(async () => {
        try {
          let targetPath = target.value;
          if (conflict === "keep-both") {
            const occupied = await listAdapterEntries(options.adapter, maxEntries, maxDepth);
            if (!occupied.ok) return occupied;
            const generated = validatePath(
              createWorkspaceConflictPath(
                targetPath,
                occupied.value.map((entry) => entry.path),
              ),
            );
            if (!generated.ok) return generated;
            targetPath = generated.value;
          }
          if (conflict === "replace") {
            if (!options.adapter.capabilities.write) return unsupported(path);
            const existing = await options.adapter.readText(targetPath);
            if (!existing.ok) return mapAdapterError(existing.error);
            const replaced = await options.adapter.writeTextAtomic(
              targetPath,
              content,
              existing.value.revision,
            );
            return replaced.ok
              ? success(fileEntry(replaced.value.path, content))
              : mapAdapterError(replaced.error);
          }
          const result = await options.adapter.createFile(targetPath, content);
          return result.ok
            ? success(fileEntry(result.value.path, content))
            : mapAdapterError(result.error);
        } catch {
          return browserFailure("IO_FAILURE", path, "Workspace file creation failed");
        }
      });
    },
    async createDirectory(path) {
      if (!options.adapter.capabilities.create) return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      return serialize(async () => {
        try {
          const result = await options.adapter.createDirectory(target.value);
          return result.ok
            ? success(Object.freeze({ ...result.value }))
            : mapAdapterError(result.error);
        } catch {
          return browserFailure("IO_FAILURE", path, "Workspace directory creation failed");
        }
      });
    },
    async rename(from, to, conflict = "fail") {
      if (!options.adapter.capabilities.rename) return unsupported(from);
      if (conflict === "replace") return unsupported(to);
      const source = validatePath(from);
      if (!source.ok) return source;
      const destination = validatePath(to);
      if (!destination.ok) return destination;
      if (source.value === destination.value) {
        const listed = await listAdapterEntries(options.adapter, maxEntries, maxDepth);
        if (!listed.ok) return listed;
        const existing = listed.value.find((entry) => entry.path === source.value);
        return existing ? success(existing) : browserFailure("NOT_FOUND", from, "Entry not found");
      }
      return serialize(async () => {
        try {
          let target = destination.value;
          if (conflict === "keep-both") {
            const occupied = await listAdapterEntries(options.adapter, maxEntries, maxDepth);
            if (!occupied.ok) return occupied;
            const generated = validatePath(
              createWorkspaceConflictPath(
                target,
                occupied.value.map((entry) => entry.path),
              ),
            );
            if (!generated.ok) return generated;
            target = generated.value;
          }
          const result = await options.adapter.rename(source.value, target);
          return result.ok
            ? success(Object.freeze({ ...result.value }))
            : mapAdapterError(result.error);
        } catch {
          return browserFailure("IO_FAILURE", from, "Workspace operation failed");
        }
      });
    },
    async move(from, to, conflict = "fail") {
      if (conflict === "replace") return unsupported(to);
      if (conflict === "fail") {
        return entryCommand(options.adapter.capabilities.move, from, to, options.adapter.move);
      }
      if (!options.adapter.capabilities.move) return unsupported(from);
      const occupied = await listAdapterEntries(options.adapter, maxEntries, maxDepth);
      if (!occupied.ok) return occupied;
      return entryCommand(
        true,
        from,
        createWorkspaceConflictPath(
          to,
          occupied.value.map((entry) => entry.path),
        ),
        options.adapter.move,
      );
    },
    async copy(from, to, conflict = "fail") {
      if (conflict === "replace") return unsupported(to);
      if (conflict === "fail") {
        return entryCommand(options.adapter.capabilities.copy, from, to, options.adapter.copy);
      }
      if (!options.adapter.capabilities.copy) return unsupported(from);
      const occupied = await listAdapterEntries(options.adapter, maxEntries, maxDepth);
      if (!occupied.ok) return occupied;
      return entryCommand(
        true,
        from,
        createWorkspaceConflictPath(
          to,
          occupied.value.map((entry) => entry.path),
        ),
        options.adapter.copy,
      );
    },
    async remove(path, mode) {
      const allowed =
        mode === "trash" ? options.adapter.capabilities.trash : options.adapter.capabilities.remove;
      if (!allowed) return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      return serialize(async () => {
        try {
          const result = await options.adapter.remove(target.value, mode);
          return result.ok ? success(undefined) : mapAdapterError(result.error);
        } catch {
          return browserFailure("IO_FAILURE", path, "Workspace removal failed");
        }
      });
    },
    async share(path) {
      if (!options.adapter.capabilities.share || !options.share) return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      const name = target.value.split("/").at(-1) ?? target.value;
      try {
        const result = await options.share(target.value, name);
        return result.ok ? success(undefined) : mapShareError(result.error);
      } catch {
        return browserFailure("IO_FAILURE", path, "The workspace file could not be shared");
      }
    },
  });
}

function directoryEntriesFor(paths: readonly WorkspacePath[]): readonly FileEntry[] {
  const directories = paths.flatMap((path) => {
    const segments = path.split("/").slice(0, -1);
    return segments.map((name, index) => {
      const directoryPath = segments.slice(0, index + 1).join("/");
      const parsed = parseWorkspacePath(directoryPath);
      if (!parsed.ok) throw new Error("Managed workspace contains an invalid directory path");
      return Object.freeze({
        path: parsed.value,
        name,
        kind: "directory" as const,
        size: null,
        modifiedAt: null,
        contentType: null,
      });
    });
  });
  return Object.freeze(
    directories.filter(
      (entry, index) =>
        directories.findIndex((candidate) => candidate.path === entry.path) === index,
    ),
  );
}

export function createRepositoryWorkspaceBrowser(
  repository: WorkspaceRepository,
  share?: WorkspaceFileShare["share"],
): WorkspaceBrowser {
  function snapshotEntry(
    snapshot: Awaited<ReturnType<WorkspaceRepository["create"]>> & { ok: true },
  ): FileEntry {
    return fileEntry(snapshot.value.path, snapshot.value.markdown);
  }

  async function renameManaged(
    from: string,
    to: string,
    conflict: WorkspaceConflictPolicy,
  ): Promise<Result<FileEntry, WorkspaceBrowserError>> {
    const source = validatePath(from);
    if (!source.ok) return source;
    const destination = validatePath(to);
    if (!destination.ok) return destination;
    try {
      if (source.value === destination.value) {
        const existing = await repository.read(source.value);
        return existing.ok
          ? success(fileEntry(existing.value.path, existing.value.markdown))
          : mapRepositoryError(existing.error);
      }
      if (conflict === "replace") return unsupported(to);
      let target = destination.value;
      if (conflict === "keep-both") {
        const listed = await repository.list();
        if (!listed.ok) return mapRepositoryError(listed.error);
        const generated = validatePath(
          createWorkspaceConflictPath(
            target,
            listed.value.map((document) => document.path),
          ),
        );
        if (!generated.ok) return generated;
        target = generated.value;
      }
      const result = await repository.rename({ from: source.value, to: target });
      return result.ok ? success(snapshotEntry(result)) : mapRepositoryError(result.error);
    } catch {
      return browserFailure("IO_FAILURE", from, "Managed workspace rename failed");
    }
  }

  return Object.freeze({
    capabilities: Object.freeze({
      createFile: true,
      createDirectory: false,
      createReplace: true,
      createKeepBoth: true,
      rename: true,
      renameDirectory: false,
      renameReplace: false,
      renameKeepBoth: true,
      move: true,
      moveDirectory: false,
      moveReplace: false,
      moveKeepBoth: true,
      copy: true,
      copyDirectory: false,
      copyReplace: true,
      copyKeepBoth: true,
      remove: true,
      removeDirectory: false,
      trash: false,
      share: share !== undefined,
    }),
    async list() {
      let documents: Awaited<ReturnType<WorkspaceRepository["list"]>>;
      try {
        documents = await repository.list();
      } catch {
        return browserFailure("IO_FAILURE", "", "The managed workspace could not be browsed");
      }
      if (!documents.ok) return mapRepositoryError(documents.error);
      const files = documents.value.map((document) =>
        Object.freeze({
          path: document.path,
          name: document.path.split("/").at(-1) ?? document.path,
          kind: "file" as const,
          size: new TextEncoder().encode(document.markdown).byteLength,
          modifiedAt: null,
          contentType: "text/markdown",
        }),
      );
      return success(
        freezeEntries([...directoryEntriesFor(files.map((file) => file.path)), ...files]),
      );
    },
    async createFile(path, content, conflict = "fail") {
      const target = validatePath(path);
      if (!target.ok) return target;
      try {
        if (conflict === "replace") {
          const existing = await repository.read(target.value);
          if (!existing.ok) return mapRepositoryError(existing.error);
          const replaced = await repository.writeVerified({
            path: target.value,
            markdown: content,
            expectedBaseHash: existing.value.contentHash,
          });
          return replaced.ok
            ? success(snapshotEntry(replaced))
            : mapRepositoryError(replaced.error);
        }
        let targetPath = target.value;
        if (conflict === "keep-both") {
          const listed = await repository.list();
          if (!listed.ok) return mapRepositoryError(listed.error);
          const generated = validatePath(
            createWorkspaceConflictPath(
              targetPath,
              listed.value.map((document) => document.path),
            ),
          );
          if (!generated.ok) return generated;
          targetPath = generated.value;
        }
        const result = await repository.create({ path: targetPath, markdown: content });
        return result.ok ? success(snapshotEntry(result)) : mapRepositoryError(result.error);
      } catch {
        return browserFailure("IO_FAILURE", path, "Managed workspace file creation failed");
      }
    },
    async createDirectory(path) {
      return unsupported(path);
    },
    async rename(from, to, conflict = "fail") {
      return renameManaged(from, to, conflict);
    },
    async move(from, to, conflict = "fail") {
      return renameManaged(from, to, conflict);
    },
    async copy(from, to, conflict = "fail") {
      const source = validatePath(from);
      if (!source.ok) return source;
      const destination = validatePath(to);
      if (!destination.ok) return destination;
      if (source.value === destination.value && conflict !== "keep-both") {
        return browserFailure("ALREADY_EXISTS", to, "Source and destination are the same file");
      }
      try {
        const sourceDocument = await repository.read(source.value);
        if (!sourceDocument.ok) return mapRepositoryError(sourceDocument.error);
        if (conflict === "replace") {
          const destinationDocument = await repository.read(destination.value);
          if (!destinationDocument.ok) return mapRepositoryError(destinationDocument.error);
          const replaced = await repository.writeVerified({
            path: destination.value,
            markdown: sourceDocument.value.markdown,
            expectedBaseHash: destinationDocument.value.contentHash,
          });
          return replaced.ok
            ? success(snapshotEntry(replaced))
            : mapRepositoryError(replaced.error);
        }
        let target = destination.value;
        if (conflict === "keep-both") {
          const listed = await repository.list();
          if (!listed.ok) return mapRepositoryError(listed.error);
          const generated = validatePath(
            createWorkspaceConflictPath(
              target,
              listed.value.map((document) => document.path),
            ),
          );
          if (!generated.ok) return generated;
          target = generated.value;
        }
        const copied = await repository.create({
          path: target,
          markdown: sourceDocument.value.markdown,
        });
        return copied.ok ? success(snapshotEntry(copied)) : mapRepositoryError(copied.error);
      } catch {
        return browserFailure("IO_FAILURE", from, "Managed workspace copy failed");
      }
    },
    async remove(path, mode) {
      if (mode === "trash") return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      try {
        const result = await repository.remove(target.value);
        return result.ok ? success(undefined) : mapRepositoryError(result.error);
      } catch {
        return browserFailure("IO_FAILURE", path, "Managed workspace removal failed");
      }
    },
    async share(path) {
      if (!share) return unsupported(path);
      const target = validatePath(path);
      if (!target.ok) return target;
      const name = target.value.split("/").at(-1) ?? target.value;
      try {
        const result = await share(target.value, name);
        return result.ok ? success(undefined) : mapShareError(result.error);
      } catch {
        return browserFailure("IO_FAILURE", path, "The workspace file could not be shared");
      }
    },
  });
}
