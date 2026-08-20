import { parseDocumentId, type DocumentId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import type {
  FileEntry,
  TextReadResult,
  WorkspaceAdapter,
  WorkspaceAdapterError,
} from "./workspace-adapter";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";
import type {
  RemovedWorkspaceDocument,
  WorkspaceDocumentSnapshot,
  WorkspaceRepository,
  WorkspaceRepositoryError,
  WorkspaceRepositoryErrorCode,
} from "./workspace-repository";

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_DEPTH = 32;

export type WorkspaceAdapterRepositoryOptions = Readonly<{
  adapter: WorkspaceAdapter;
  deriveDocumentId: (
    workspaceId: WorkspaceAdapter["grant"]["workspaceId"],
    path: WorkspacePath,
  ) => Promise<DocumentId>;
  includeFile: (entry: FileEntry) => boolean;
  maxEntries?: number;
  maxDepth?: number;
}>;

function repositoryFailure(
  code: WorkspaceRepositoryErrorCode,
  path: string,
): Result<never, WorkspaceRepositoryError> {
  return failure(Object.freeze({ code, path }));
}

function mapAdapterError(
  adapterError: WorkspaceAdapterError,
  fallbackPath: string,
): Result<never, WorkspaceRepositoryError> {
  const mappedCode: WorkspaceRepositoryErrorCode =
    adapterError.code === "INVALID_PATH" ||
    adapterError.code === "NOT_FOUND" ||
    adapterError.code === "ALREADY_EXISTS" ||
    adapterError.code === "EXTERNAL_MODIFICATION"
      ? adapterError.code
      : "IO_FAILURE";
  return repositoryFailure(mappedCode, adapterError.path || fallbackPath);
}

function validatePath(path: string): Result<WorkspacePath, WorkspaceRepositoryError> {
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed : repositoryFailure("INVALID_PATH", path);
}

export function createWorkspaceAdapterRepository(
  options: WorkspaceAdapterRepositoryOptions,
): WorkspaceRepository {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Workspace enumeration limit must be a positive integer");
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error("Workspace depth limit must be a non-negative integer");
  }

  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function documentIdFor(
    path: WorkspacePath,
  ): Promise<Result<DocumentId, WorkspaceRepositoryError>> {
    try {
      const parsed = parseDocumentId(
        await options.deriveDocumentId(options.adapter.grant.workspaceId, path),
      );
      return parsed.ok ? parsed : repositoryFailure("ID_GENERATION_FAILED", path);
    } catch {
      return repositoryFailure("ID_GENERATION_FAILED", path);
    }
  }

  async function snapshotFromRead(
    read: TextReadResult,
  ): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>> {
    if (read.revision.length === 0) return repositoryFailure("HASH_FAILED", read.path);
    const documentId = await documentIdFor(read.path);
    if (!documentId.ok) return documentId;
    return success(
      Object.freeze({
        documentId: documentId.value,
        path: read.path,
        markdown: read.content,
        contentHash: read.revision,
      }),
    );
  }

  async function readSnapshot(
    path: WorkspacePath,
  ): Promise<Result<WorkspaceDocumentSnapshot, WorkspaceRepositoryError>> {
    const read = await options.adapter.readText(path);
    return read.ok ? snapshotFromRead(read.value) : mapAdapterError(read.error, path);
  }

  async function listDocuments(): Promise<
    Result<readonly WorkspaceDocumentSnapshot[], WorkspaceRepositoryError>
  > {
    let pending: readonly Readonly<{ path?: WorkspacePath; depth: number }>[] = Object.freeze([
      Object.freeze({ depth: 0 }),
    ]);
    let files: readonly FileEntry[] = Object.freeze([]);
    let discoveredEntries = 0;

    while (pending.length > 0) {
      const current = pending[0];
      if (!current) break;
      pending = Object.freeze(pending.slice(1));
      const listed = await options.adapter.list(current.path);
      if (!listed.ok) return mapAdapterError(listed.error, current.path ?? "");
      discoveredEntries += listed.value.length;
      if (discoveredEntries > maxEntries) return repositoryFailure("IO_FAILURE", "");

      const directories = listed.value.filter((entry) => entry.kind === "directory");
      if (directories.length > 0 && current.depth >= maxDepth) {
        return repositoryFailure("IO_FAILURE", current.path ?? "");
      }
      pending = Object.freeze([
        ...pending,
        ...directories.map((entry) =>
          Object.freeze({ path: entry.path, depth: current.depth + 1 }),
        ),
      ]);
      files = Object.freeze([
        ...files,
        ...listed.value.filter((entry) => entry.kind === "file" && options.includeFile(entry)),
      ]);
    }

    let snapshots: readonly WorkspaceDocumentSnapshot[] = Object.freeze([]);
    for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
      const snapshot = await readSnapshot(file.path);
      if (!snapshot.ok) return snapshot;
      snapshots = Object.freeze([...snapshots, snapshot.value]);
    }
    return success(snapshots);
  }

  const repository: WorkspaceRepository = {
    capabilities: Object.freeze({
      atomicReplace: options.adapter.capabilities.atomicReplace,
      persistedExternalGrants: options.adapter.grant.provider === "android-saf",
    }),

    async list() {
      await operationTail;
      try {
        return await listDocuments();
      } catch {
        return repositoryFailure("IO_FAILURE", "");
      }
    },

    async read(path) {
      const validated = validatePath(path);
      if (!validated.ok) return validated;
      await operationTail;
      try {
        return await readSnapshot(validated.value);
      } catch {
        return repositoryFailure("IO_FAILURE", path);
      }
    },

    async create(request) {
      const validated = validatePath(request.path);
      if (!validated.ok) return validated;
      return serialize(async () => {
        try {
          const created = await options.adapter.createFile(validated.value, request.markdown);
          if (!created.ok) return mapAdapterError(created.error, request.path);
          const snapshot = await readSnapshot(validated.value);
          if (!snapshot.ok) return snapshot;
          return snapshot.value.markdown === request.markdown
            ? snapshot
            : repositoryFailure("HASH_FAILED", request.path);
        } catch {
          return repositoryFailure("IO_FAILURE", request.path);
        }
      });
    },

    async writeVerified(request) {
      const validated = validatePath(request.path);
      if (!validated.ok) return validated;
      return serialize(async () => {
        try {
          const written = await options.adapter.writeTextAtomic(
            validated.value,
            request.markdown,
            request.expectedBaseHash,
          );
          if (!written.ok) return mapAdapterError(written.error, request.path);
          const snapshot = await readSnapshot(validated.value);
          if (!snapshot.ok) return snapshot;
          return snapshot.value.markdown === request.markdown
            ? snapshot
            : repositoryFailure("HASH_FAILED", request.path);
        } catch {
          return repositoryFailure("IO_FAILURE", request.path);
        }
      });
    },

    async rename(request) {
      const from = validatePath(request.from);
      if (!from.ok) return from;
      const to = validatePath(request.to);
      if (!to.ok) return to;
      return serialize(async () => {
        try {
          const renamed = await options.adapter.rename(from.value, to.value);
          return renamed.ok ? readSnapshot(to.value) : mapAdapterError(renamed.error, request.from);
        } catch {
          return repositoryFailure("IO_FAILURE", request.from);
        }
      });
    },

    async remove(path) {
      const validated = validatePath(path);
      if (!validated.ok) return validated;
      return serialize(async () => {
        const documentId = await documentIdFor(validated.value);
        if (!documentId.ok) return documentId;
        try {
          const removed = await options.adapter.remove(validated.value, "permanent");
          if (!removed.ok) return mapAdapterError(removed.error, path);
          const result: RemovedWorkspaceDocument = Object.freeze({
            documentId: documentId.value,
            path: validated.value,
          });
          return success(result);
        } catch {
          return repositoryFailure("IO_FAILURE", path);
        }
      });
    },
  };

  return Object.freeze(repository);
}
