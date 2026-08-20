import { z } from "zod";

import { parseDocumentId, type DocumentId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import type { VaultStorage } from "./vault-storage";
import {
  type RemovedWorkspaceDocument,
  type WorkspaceDocumentSnapshot,
  type WorkspaceRepository,
  type WorkspaceRepositoryError,
  type WorkspaceRepositoryErrorCode,
} from "./workspace-repository";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";

const CATALOG_PATH = "catalog.json";
const DOCUMENTS_PREFIX = "documents";
const RECOVERY_PREFIX = "recovery";
const CATALOG_VERSION = 1 as const;

const catalogSchema = z
  .object({
    version: z.literal(CATALOG_VERSION),
    entries: z.array(
      z
        .object({
          documentId: z.string(),
          path: z.string(),
          contentHash: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

type CatalogEntry = Readonly<{
  documentId: DocumentId;
  path: WorkspacePath;
  contentHash: string;
}>;

type Catalog = Readonly<{
  version: typeof CATALOG_VERSION;
  entries: readonly CatalogEntry[];
}>;

export type PrivateVaultRepositoryOptions = Readonly<{
  storage: VaultStorage;
  createId: () => DocumentId;
  hashMarkdown: (markdown: string) => Promise<string>;
}>;

function repositoryFailure(
  code: WorkspaceRepositoryErrorCode,
  path: string,
): Result<never, WorkspaceRepositoryError> {
  return failure(Object.freeze({ code, path }));
}

function validatePath(path: string): Result<WorkspacePath, WorkspaceRepositoryError> {
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed : repositoryFailure("INVALID_PATH", path);
}

function documentStoragePath(path: WorkspacePath): string {
  return `${DOCUMENTS_PREFIX}/${path}`;
}

function recoveryStoragePath(documentId: DocumentId): string {
  return `${RECOVERY_PREFIX}/${documentId}.md`;
}

function snapshot(
  entry: CatalogEntry,
  markdown: string,
  contentHash: string,
): WorkspaceDocumentSnapshot {
  return Object.freeze({
    documentId: entry.documentId,
    path: entry.path,
    markdown,
    contentHash,
  });
}

function freezeCatalog(entries: readonly CatalogEntry[]): Catalog {
  return Object.freeze({
    version: CATALOG_VERSION,
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

function parseCatalog(contents: string | null): Catalog {
  if (contents === null) {
    return freezeCatalog([]);
  }

  const parsed = catalogSchema.safeParse(JSON.parse(contents) as unknown);
  if (!parsed.success) {
    throw new Error("Invalid private-vault catalog");
  }

  const entries = parsed.data.entries.map((entry) => {
    const documentId = parseDocumentId(entry.documentId);
    const path = parseWorkspacePath(entry.path);
    if (!documentId.ok || !path.ok) {
      throw new Error("Invalid private-vault catalog entry");
    }
    return Object.freeze({
      documentId: documentId.value,
      path: path.value,
      contentHash: entry.contentHash,
    });
  });
  const documentIds = new Set<DocumentId>();
  const paths = new Set<WorkspacePath>();
  return freezeCatalog(
    entries.filter((entry) => {
      if (documentIds.has(entry.documentId) || paths.has(entry.path)) return false;
      documentIds.add(entry.documentId);
      paths.add(entry.path);
      return true;
    }),
  );
}

export function createPrivateVaultRepository(
  options: PrivateVaultRepositoryOptions,
): WorkspaceRepository {
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function loadCatalog(): Promise<Catalog> {
    return parseCatalog(await options.storage.read(CATALOG_PATH));
  }

  async function saveCatalog(catalog: Catalog): Promise<void> {
    await options.storage.write(CATALOG_PATH, JSON.stringify(catalog));
  }

  async function hashMarkdown(markdown: string): Promise<string> {
    const hash = await options.hashMarkdown(markdown);
    if (hash.length === 0) {
      throw new Error("Empty content hash");
    }
    return hash;
  }

  async function readEntry(entry: CatalogEntry): Promise<WorkspaceDocumentSnapshot> {
    const targetPath = documentStoragePath(entry.path);
    const backupPath = `${targetPath}.backup-${entry.documentId}`;
    let markdown = await options.storage.read(targetPath);

    if (await options.storage.exists(backupPath)) {
      if (markdown === null) {
        await options.storage.move(backupPath, targetPath);
        markdown = await options.storage.read(targetPath);
      } else {
        const targetHash = await hashMarkdown(markdown);
        if (targetHash === entry.contentHash) {
          await options.storage.remove(backupPath);
        } else {
          const backup = await options.storage.read(backupPath);
          if (backup === null || (await hashMarkdown(backup)) !== entry.contentHash) {
            throw new Error("Interrupted replace cannot be reconciled");
          }
          await options.storage.remove(targetPath);
          await options.storage.move(backupPath, targetPath);
          markdown = backup;
        }
      }
    }

    if (markdown === null) throw new Error("Catalog document is missing");
    return snapshot(entry, markdown, await hashMarkdown(markdown));
  }

  const repository: WorkspaceRepository = {
    capabilities: Object.freeze({ atomicReplace: false, persistedExternalGrants: false }),

    async list() {
      await operationTail;
      try {
        const catalog = await loadCatalog();
        const documents = await Promise.all(
          [...catalog.entries]
            .sort((left, right) => left.path.localeCompare(right.path))
            .map(readEntry),
        );
        return success(Object.freeze(documents));
      } catch {
        return repositoryFailure("IO_FAILURE", CATALOG_PATH);
      }
    },

    async read(path) {
      const validatedPath = validatePath(path);
      if (!validatedPath.ok) return validatedPath;
      await operationTail;

      try {
        const catalog = await loadCatalog();
        const entry = catalog.entries.find((item) => item.path === validatedPath.value);
        return entry ? success(await readEntry(entry)) : repositoryFailure("NOT_FOUND", path);
      } catch {
        return repositoryFailure("IO_FAILURE", path);
      }
    },

    async create(request) {
      const validatedPath = validatePath(request.path);
      if (!validatedPath.ok) return validatedPath;

      return serialize(async () => {
        try {
          const catalog = await loadCatalog();
          if (catalog.entries.some((entry) => entry.path === validatedPath.value)) {
            return repositoryFailure("ALREADY_EXISTS", request.path);
          }

          const parsedId = parseDocumentId(options.createId());
          if (
            !parsedId.ok ||
            catalog.entries.some((entry) => entry.documentId === parsedId.value)
          ) {
            return repositoryFailure("ID_GENERATION_FAILED", request.path);
          }

          const contentHash = await hashMarkdown(request.markdown);
          const entry: CatalogEntry = Object.freeze({
            documentId: parsedId.value,
            path: validatedPath.value,
            contentHash,
          });
          const pendingPath = `${documentStoragePath(entry.path)}.pending-${entry.documentId}`;
          const recoveryPath = recoveryStoragePath(entry.documentId);

          await options.storage.write(recoveryPath, request.markdown);
          await options.storage.write(pendingPath, request.markdown);
          const pending = await options.storage.read(pendingPath);
          if (pending === null || (await hashMarkdown(pending)) !== contentHash) {
            return repositoryFailure("HASH_FAILED", request.path);
          }

          await options.storage.move(pendingPath, documentStoragePath(entry.path));
          await saveCatalog(freezeCatalog([...catalog.entries, entry]));
          const written = await readEntry(entry);
          if (written.contentHash !== contentHash) {
            return repositoryFailure("HASH_FAILED", request.path);
          }
          await options.storage.remove(recoveryPath);
          return success(written);
        } catch {
          return repositoryFailure("IO_FAILURE", request.path);
        }
      });
    },

    async writeVerified(request) {
      const validatedPath = validatePath(request.path);
      if (!validatedPath.ok) return validatedPath;

      return serialize(async () => {
        let backupPath: string | null = null;
        try {
          const catalog = await loadCatalog();
          const entry = catalog.entries.find((item) => item.path === validatedPath.value);
          if (!entry) return repositoryFailure("NOT_FOUND", request.path);

          const current = await readEntry(entry);
          if (current.contentHash !== request.expectedBaseHash) {
            return repositoryFailure("EXTERNAL_MODIFICATION", request.path);
          }

          const contentHash = await hashMarkdown(request.markdown);
          const targetPath = documentStoragePath(entry.path);
          const pendingPath = `${targetPath}.pending-${entry.documentId}`;
          backupPath = `${targetPath}.backup-${entry.documentId}`;
          const recoveryPath = recoveryStoragePath(entry.documentId);

          await options.storage.write(recoveryPath, request.markdown);
          await options.storage.write(pendingPath, request.markdown);
          const pending = await options.storage.read(pendingPath);
          if (pending === null || (await hashMarkdown(pending)) !== contentHash) {
            return repositoryFailure("HASH_FAILED", request.path);
          }

          await options.storage.move(targetPath, backupPath);
          await options.storage.move(pendingPath, targetPath);
          const verifiedMarkdown = await options.storage.read(targetPath);
          if (verifiedMarkdown === null || (await hashMarkdown(verifiedMarkdown)) !== contentHash) {
            throw new Error("Read-back verification failed");
          }

          const updatedEntry: CatalogEntry = Object.freeze({ ...entry, contentHash });
          const updatedCatalog = freezeCatalog(
            catalog.entries.map((item) =>
              item.documentId === entry.documentId ? updatedEntry : item,
            ),
          );
          await saveCatalog(updatedCatalog);
          await options.storage.remove(backupPath);
          backupPath = null;
          await options.storage.remove(recoveryPath);
          return success(snapshot(updatedEntry, verifiedMarkdown, contentHash));
        } catch {
          if (backupPath !== null && (await options.storage.exists(backupPath))) {
            const targetPath = documentStoragePath(validatedPath.value);
            if (await options.storage.exists(targetPath)) {
              await options.storage.remove(targetPath);
            }
            await options.storage.move(backupPath, targetPath);
          }
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
          const catalog = await loadCatalog();
          const entry = catalog.entries.find((item) => item.path === from.value);
          if (!entry) return repositoryFailure("NOT_FOUND", request.from);
          if (from.value === to.value) return success(await readEntry(entry));
          if (catalog.entries.some((item) => item.path === to.value)) {
            return repositoryFailure("ALREADY_EXISTS", request.to);
          }

          await options.storage.move(
            documentStoragePath(from.value),
            documentStoragePath(to.value),
          );
          const renamed: CatalogEntry = Object.freeze({ ...entry, path: to.value });
          await saveCatalog(
            freezeCatalog(
              catalog.entries.map((item) =>
                item.documentId === entry.documentId ? renamed : item,
              ),
            ),
          );
          return success(await readEntry(renamed));
        } catch {
          return repositoryFailure("IO_FAILURE", request.from);
        }
      });
    },

    async remove(path) {
      const validatedPath = validatePath(path);
      if (!validatedPath.ok) return validatedPath;

      return serialize(async () => {
        try {
          const catalog = await loadCatalog();
          const entry = catalog.entries.find((item) => item.path === validatedPath.value);
          if (!entry) return repositoryFailure("NOT_FOUND", path);

          await options.storage.remove(documentStoragePath(entry.path));
          await saveCatalog(
            freezeCatalog(catalog.entries.filter((item) => item.documentId !== entry.documentId)),
          );
          const removed: RemovedWorkspaceDocument = Object.freeze({
            documentId: entry.documentId,
            path: entry.path,
          });
          return success(removed);
        } catch {
          return repositoryFailure("IO_FAILURE", path);
        }
      });
    },
  };

  return Object.freeze(repository);
}
