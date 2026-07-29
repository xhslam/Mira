import { parseDocumentId, type DocumentId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import {
  type RemovedWorkspaceDocument,
  type WorkspaceDocumentSnapshot,
  type WorkspaceRepository,
  type WorkspaceRepositoryCapabilities,
  type WorkspaceRepositoryError,
  type WorkspaceRepositoryErrorCode,
} from "./workspace-repository";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";

type StoredWorkspaceDocument = Readonly<{
  documentId: DocumentId;
  path: WorkspacePath;
  markdown: string;
  contentHash: string;
}>;

export type MemoryWorkspaceRepositoryOptions = Readonly<{
  capabilities: WorkspaceRepositoryCapabilities;
  createId: () => DocumentId;
  hashMarkdown: (markdown: string) => Promise<string>;
}>;

function repositoryFailure(
  code: WorkspaceRepositoryErrorCode,
  path: string,
): Result<never, WorkspaceRepositoryError> {
  return failure(Object.freeze({ code, path }));
}

function snapshot(document: StoredWorkspaceDocument): WorkspaceDocumentSnapshot {
  return Object.freeze({
    documentId: document.documentId,
    path: document.path,
    markdown: document.markdown,
    contentHash: document.contentHash,
  });
}

function validatePath(path: string): Result<WorkspacePath, WorkspaceRepositoryError> {
  const parsed = parseWorkspacePath(path);
  return parsed.ok ? parsed : repositoryFailure("INVALID_PATH", path);
}

export function createMemoryWorkspaceRepository(
  options: MemoryWorkspaceRepositoryOptions,
): WorkspaceRepository {
  let documents: ReadonlyMap<string, StoredWorkspaceDocument> = new Map();

  const capabilities: WorkspaceRepositoryCapabilities = Object.freeze({
    atomicReplace: options.capabilities.atomicReplace,
    persistedExternalGrants: options.capabilities.persistedExternalGrants,
  });

  async function hashMarkdown(
    markdown: string,
    path: string,
  ): Promise<Result<string, WorkspaceRepositoryError>> {
    try {
      const contentHash = await options.hashMarkdown(markdown);
      return contentHash.length > 0 ? success(contentHash) : repositoryFailure("HASH_FAILED", path);
    } catch {
      return repositoryFailure("HASH_FAILED", path);
    }
  }

  const repository: WorkspaceRepository = {
    capabilities,

    async list() {
      const listed = [...documents.values()]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(snapshot);
      return success(Object.freeze(listed));
    },

    async read(path) {
      const validatedPath = validatePath(path);
      if (!validatedPath.ok) {
        return validatedPath;
      }

      const document = documents.get(validatedPath.value);
      return document ? success(snapshot(document)) : repositoryFailure("NOT_FOUND", path);
    },

    async create(request) {
      const validatedPath = validatePath(request.path);
      if (!validatedPath.ok) {
        return validatedPath;
      }

      if (documents.has(validatedPath.value)) {
        return repositoryFailure("ALREADY_EXISTS", request.path);
      }

      const contentHash = await hashMarkdown(request.markdown, request.path);
      if (!contentHash.ok) {
        return contentHash;
      }

      let documentId: DocumentId;
      try {
        const parsedId = parseDocumentId(options.createId());
        if (
          !parsedId.ok ||
          [...documents.values()].some((item) => item.documentId === parsedId.value)
        ) {
          return repositoryFailure("ID_GENERATION_FAILED", request.path);
        }
        documentId = parsedId.value;
      } catch {
        return repositoryFailure("ID_GENERATION_FAILED", request.path);
      }

      const document: StoredWorkspaceDocument = Object.freeze({
        documentId,
        path: validatedPath.value,
        markdown: request.markdown,
        contentHash: contentHash.value,
      });
      documents = new Map([...documents, [validatedPath.value, document]]);
      return success(snapshot(document));
    },

    async writeVerified(request) {
      const validatedPath = validatePath(request.path);
      if (!validatedPath.ok) {
        return validatedPath;
      }

      const current = documents.get(validatedPath.value);
      if (!current) {
        return repositoryFailure("NOT_FOUND", request.path);
      }

      if (current.contentHash !== request.expectedBaseHash) {
        return repositoryFailure("EXTERNAL_MODIFICATION", request.path);
      }

      const contentHash = await hashMarkdown(request.markdown, request.path);
      if (!contentHash.ok) {
        return contentHash;
      }

      const updated: StoredWorkspaceDocument = Object.freeze({
        documentId: current.documentId,
        path: current.path,
        markdown: request.markdown,
        contentHash: contentHash.value,
      });
      documents = new Map(
        [...documents].map(([key, value]) =>
          key === validatedPath.value ? [key, updated] : [key, value],
        ),
      );
      return success(snapshot(updated));
    },

    async rename(request) {
      const from = validatePath(request.from);
      if (!from.ok) {
        return from;
      }
      const to = validatePath(request.to);
      if (!to.ok) {
        return to;
      }

      const current = documents.get(from.value);
      if (!current) {
        return repositoryFailure("NOT_FOUND", request.from);
      }
      if (from.value === to.value) {
        return success(snapshot(current));
      }
      if (documents.has(to.value)) {
        return repositoryFailure("ALREADY_EXISTS", request.to);
      }

      const renamed: StoredWorkspaceDocument = Object.freeze({
        documentId: current.documentId,
        path: to.value,
        markdown: current.markdown,
        contentHash: current.contentHash,
      });
      documents = new Map([
        ...[...documents].filter(([key]) => key !== from.value),
        [to.value, renamed],
      ]);
      return success(snapshot(renamed));
    },

    async remove(path) {
      const validatedPath = validatePath(path);
      if (!validatedPath.ok) {
        return validatedPath;
      }

      const current = documents.get(validatedPath.value);
      if (!current) {
        return repositoryFailure("NOT_FOUND", path);
      }

      documents = new Map([...documents].filter(([key]) => key !== validatedPath.value));
      const removed: RemovedWorkspaceDocument = Object.freeze({
        documentId: current.documentId,
        path: current.path,
      });
      return success(removed);
    },
  };

  return Object.freeze(repository);
}
