import { Directory, File } from "expo-file-system";

import { failure, type Result, success } from "../domain/result";
import type {
  FileEntry,
  FileStat,
  BinaryReadResult,
  ExportedFileResult,
  TextReadResult,
  TextWriteResult,
  WorkspaceAdapter,
  WorkspaceAdapterError,
  WorkspaceCapability,
  WorkspaceGrant,
} from "./workspace-adapter";
import { LINKED_CAPABILITIES } from "./linked-workspace-capabilities";
import { createWorkspaceFileRevision } from "./workspace-file-revision";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";

type ExpoEntry = Directory | File;
type WorkspaceContentHasher = (content: string) => Promise<string>;
type ExpoWorkspaceAdapterOptions = Readonly<{
  isDirectoryEntry?: (entry: ExpoEntry) => entry is Directory;
  createFileTarget?: (parent: Directory, name: string) => File;
  createDirectoryTarget?: (parent: Directory, name: string) => Directory;
}>;

function error(
  code: WorkspaceAdapterError["code"],
  path: string,
  message: string,
): Result<never, WorkspaceAdapterError> {
  return failure(Object.freeze({ code, path, message }));
}

function mapError(path: string, thrown: unknown): Result<never, WorkspaceAdapterError> {
  const message = thrown instanceof Error ? thrown.message : "Workspace provider operation failed";
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("permission") || lowerMessage.includes("access")) {
    return error("PERMISSION_REVOKED", path, "Workspace access needs to be authorized again");
  }
  if (lowerMessage.includes("not found") || lowerMessage.includes("does not exist")) {
    return error("NOT_FOUND", path, "The workspace entry no longer exists");
  }
  if (lowerMessage.includes("already exists") || lowerMessage.includes("destination")) {
    return error("ALREADY_EXISTS", path, "A workspace entry already exists at the destination");
  }
  if (lowerMessage.includes("offline") || lowerMessage.includes("unavailable")) {
    return error("OFFLINE", path, "The workspace provider is currently offline");
  }
  if (lowerMessage.includes("read-only") || lowerMessage.includes("readonly")) {
    return error("READ_ONLY", path, "The workspace provider is read-only");
  }
  if (lowerMessage.includes("unsupported") || lowerMessage.includes("not supported")) {
    return error("UNSUPPORTED", path, "The workspace provider does not support this operation");
  }
  return error("IO_FAILURE", path, "The workspace provider operation failed");
}

function pathSegments(path: WorkspacePath | undefined): readonly string[] {
  return path === undefined ? Object.freeze([]) : Object.freeze(path.split("/"));
}

function childPath(parent: WorkspacePath | undefined, name: string): WorkspacePath | null {
  const parsed = parseWorkspacePath(parent === undefined ? name : `${parent}/${name}`);
  return parsed.ok ? parsed.value : null;
}

function isDirectory(entry: ExpoEntry): entry is Directory {
  return entry instanceof Directory;
}

function sameEntryName(entry: ExpoEntry, segment: string): boolean {
  return entry.name.normalize("NFC") === segment.normalize("NFC");
}

async function revisionFor(
  entry: File,
  content: string,
  hashContent: WorkspaceContentHasher,
): Promise<string> {
  return createWorkspaceFileRevision({
    providerIdentifier: entry.uri,
    modifiedAt: entry.lastModified,
    size: entry.size,
    contentHash: await hashContent(content),
  });
}

function entryMetadata(entry: ExpoEntry, path: WorkspacePath): FileEntry {
  const directory = isDirectory(entry);
  const info = entry.info();
  return Object.freeze({
    path,
    name: entry.name,
    kind: directory ? "directory" : "file",
    size: typeof info.size === "number" ? info.size : null,
    modifiedAt:
      typeof info.modificationTime === "number"
        ? new Date(info.modificationTime).toISOString()
        : null,
    contentType: directory ? null : entry.type || null,
  });
}

async function statFromEntry(
  entry: ExpoEntry,
  path: WorkspacePath,
  hashContent: WorkspaceContentHasher,
): Promise<FileStat> {
  const metadata = entryMetadata(entry, path);
  const revision = isDirectory(entry)
    ? createWorkspaceFileRevision({
        providerIdentifier: entry.uri,
        modifiedAt: metadata.modifiedAt === null ? null : Date.parse(metadata.modifiedAt),
        size: metadata.size ?? 0,
        contentHash: "directory",
      })
    : await revisionFor(entry, await entry.text(), hashContent);
  return Object.freeze({ ...metadata, revision });
}

export function createExpoWorkspaceAdapter(
  root: Directory,
  grant: WorkspaceGrant,
  capabilities: WorkspaceCapability = LINKED_CAPABILITIES,
  hashContent: WorkspaceContentHasher,
  options: ExpoWorkspaceAdapterOptions = {},
): WorkspaceAdapter {
  const isDirectoryEntry = options.isDirectoryEntry ?? isDirectory;
  const createFileTarget = options.createFileTarget ?? ((parent, name) => new File(parent, name));
  const createDirectoryTarget =
    options.createDirectoryTarget ?? ((parent, name) => new Directory(parent, name));

  async function resolveDirectory(path: WorkspacePath | undefined): Promise<Directory | null> {
    let current = root;
    for (const segment of pathSegments(path)) {
      const child = current.list().find((entry) => sameEntryName(entry, segment));
      if (!child || !isDirectoryEntry(child)) return null;
      current = child;
    }
    return current;
  }

  async function resolveEntry(path: WorkspacePath): Promise<ExpoEntry | null> {
    const segments = pathSegments(path);
    const name = segments.at(-1);
    if (!name) return root;
    const parentPath = segments.slice(0, -1).join("/");
    const parent = await resolveDirectory(
      parentPath.length > 0 ? (parentPath as WorkspacePath) : undefined,
    );
    return parent?.list().find((entry) => sameEntryName(entry, name)) ?? null;
  }

  async function relocationTarget(
    path: WorkspacePath,
    directory: boolean,
  ): Promise<ExpoEntry | null> {
    const segments = pathSegments(path);
    const name = segments.at(-1);
    const parentPath = segments.slice(0, -1).join("/");
    if (!name) return null;
    const parent = await resolveDirectory(
      parentPath.length > 0 ? (parentPath as WorkspacePath) : undefined,
    );
    if (!parent) return null;
    return directory ? createDirectoryTarget(parent, name) : createFileTarget(parent, name);
  }

  async function relocate(
    operation: "move" | "copy",
    from: WorkspacePath,
    to: WorkspacePath,
  ): Promise<Result<FileEntry, WorkspaceAdapterError>> {
    if (!capabilities[operation]) {
      return error("UNSUPPORTED", from, `Workspace ${operation} is not supported`);
    }
    if (from === to) {
      const unchanged = await resolveEntry(from);
      return unchanged
        ? success(entryMetadata(unchanged, from))
        : error("NOT_FOUND", from, "The workspace entry was not found");
    }
    if (to.startsWith(`${from}/`)) {
      return error("INVALID_PATH", to, "A directory cannot be placed inside itself");
    }
    try {
      const source = await resolveEntry(from);
      if (!source) return error("NOT_FOUND", from, "The workspace entry was not found");
      if (await resolveEntry(to)) {
        return error("ALREADY_EXISTS", to, "A workspace entry already exists at the destination");
      }
      const destination = await relocationTarget(to, isDirectoryEntry(source));
      if (!destination) return error("NOT_FOUND", to, "The destination directory was not found");
      await source[operation](destination, { overwrite: false });
      const relocated = await resolveEntry(to);
      return relocated
        ? success(entryMetadata(relocated, to))
        : error("IO_FAILURE", to, `The ${operation}d workspace entry could not be verified`);
    } catch (thrown) {
      return mapError(`${from} -> ${to}`, thrown);
    }
  }

  async function list(
    path?: WorkspacePath,
  ): Promise<Result<readonly FileEntry[], WorkspaceAdapterError>> {
    if (!capabilities.read) return error("READ_ONLY", path ?? "", "This workspace is not readable");
    try {
      const directory = await resolveDirectory(path);
      if (!directory)
        return error("NOT_FOUND", path ?? "", "The workspace directory was not found");
      const entries = directory
        .list()
        .flatMap((entry) => {
          const entryPath = childPath(path, entry.name);
          return entryPath ? [entryMetadata(entry, entryPath)] : [];
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      return success(Object.freeze(entries));
    } catch (thrown) {
      return mapError(path ?? "", thrown);
    }
  }

  async function stat(path: WorkspacePath): Promise<Result<FileStat, WorkspaceAdapterError>> {
    if (!capabilities.read) return error("READ_ONLY", path, "This workspace is not readable");
    try {
      const entry = await resolveEntry(path);
      return entry
        ? success(await statFromEntry(entry, path, hashContent))
        : error("NOT_FOUND", path, "The workspace entry was not found");
    } catch (thrown) {
      return mapError(path, thrown);
    }
  }

  const adapter: WorkspaceAdapter = {
    grant: Object.freeze({ ...grant }),
    capabilities: Object.freeze({ ...capabilities }),

    list,

    stat,

    async readText(path) {
      if (!capabilities.read) return error("READ_ONLY", path, "This workspace is not readable");
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace file was not found");
        if (isDirectory(entry))
          return error("UNSUPPORTED", path, "Directories cannot be read as text");
        const content = await entry.text();
        return success(
          Object.freeze({
            path,
            content,
            revision: await revisionFor(entry, content, hashContent),
          } satisfies TextReadResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async readBytes(path) {
      if (!capabilities.read) return error("READ_ONLY", path, "This workspace is not readable");
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace file was not found");
        if (isDirectory(entry)) return error("UNSUPPORTED", path, "Directories have no bytes");
        const content = await entry.bytes();
        return success(
          Object.freeze({
            path,
            content: new Uint8Array(content),
            revision: await revisionFor(entry, await entry.base64(), hashContent),
            contentType: entry.type || null,
          } satisfies BinaryReadResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async writeTextAtomic(path, content, expectedRevision) {
      if (!capabilities.write) return error("READ_ONLY", path, "This workspace is read-only");
      if (capabilities.atomicReplace) {
        return error("UNSUPPORTED", path, "Atomic replacement is not implemented by this adapter");
      }
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace file was not found");
        if (isDirectory(entry))
          return error("UNSUPPORTED", path, "Directories cannot be written as text");
        const currentContent = await entry.text();
        const currentRevision = await revisionFor(entry, currentContent, hashContent);
        if (expectedRevision !== null && expectedRevision !== currentRevision) {
          return error("EXTERNAL_MODIFICATION", path, "The file changed outside the app");
        }
        entry.write(content);
        const written = await resolveEntry(path);
        if (!written || isDirectory(written)) {
          return error("IO_FAILURE", path, "The written workspace file could not be verified");
        }
        const writtenContent = await written.text();
        return success(
          Object.freeze({
            path,
            revision: await revisionFor(written, writtenContent, hashContent),
            atomic: false,
          } satisfies TextWriteResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async createFile(path, content) {
      if (!capabilities.create) return error("UNSUPPORTED", path, "File creation is not supported");
      try {
        const segments = pathSegments(path);
        const name = segments.at(-1);
        const parentPath = segments.slice(0, -1).join("/");
        if (!name) return error("INVALID_PATH", path, "A file name is required");
        const parent = await resolveDirectory(
          parentPath.length > 0 ? (parentPath as WorkspacePath) : undefined,
        );
        if (!parent) return error("NOT_FOUND", path, "The parent directory was not found");
        if (parent.list().some((entry) => sameEntryName(entry, name))) {
          return error("ALREADY_EXISTS", path, "A workspace entry already exists at this path");
        }
        const file = parent.createFile(name, "text/plain");
        file.write(content);
        const writtenContent = await file.text();
        return success(
          Object.freeze({
            path,
            revision: await revisionFor(file, writtenContent, hashContent),
            atomic: false,
          } satisfies TextWriteResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async createFileBytes(path, content) {
      if (!capabilities.create) return error("UNSUPPORTED", path, "File creation is not supported");
      try {
        const segments = pathSegments(path);
        const name = segments.at(-1);
        const parentPath = segments.slice(0, -1).join("/");
        if (!name) return error("INVALID_PATH", path, "A file name is required");
        const parent = await resolveDirectory(
          parentPath.length > 0 ? (parentPath as WorkspacePath) : undefined,
        );
        if (!parent) return error("NOT_FOUND", path, "The parent directory was not found");
        if (parent.list().some((entry) => sameEntryName(entry, name))) {
          return error("ALREADY_EXISTS", path, "A workspace entry already exists at this path");
        }
        const file = parent.createFile(name, "application/octet-stream");
        file.write(content);
        return success(
          Object.freeze({
            path,
            revision: await revisionFor(file, await file.base64(), hashContent),
            atomic: false,
          } satisfies TextWriteResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async writeBytes(path, content, expectedRevision) {
      if (!capabilities.write) return error("READ_ONLY", path, "This workspace is read-only");
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace file was not found");
        if (isDirectory(entry)) return error("UNSUPPORTED", path, "Directories cannot be written");
        const currentRevision = await revisionFor(entry, await entry.base64(), hashContent);
        if (expectedRevision !== null && currentRevision !== expectedRevision) {
          return error("EXTERNAL_MODIFICATION", path, "The file changed outside the app");
        }
        entry.write(content);
        return success(
          Object.freeze({
            path,
            revision: await revisionFor(entry, await entry.base64(), hashContent),
            atomic: false,
          } satisfies TextWriteResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async createDirectory(path) {
      if (!capabilities.create)
        return error("UNSUPPORTED", path, "Directory creation is not supported");
      try {
        const segments = pathSegments(path);
        const name = segments.at(-1);
        const parentPath = segments.slice(0, -1).join("/");
        if (!name) return error("INVALID_PATH", path, "A directory name is required");
        const parent = await resolveDirectory(
          parentPath.length > 0 ? (parentPath as WorkspacePath) : undefined,
        );
        if (!parent) return error("NOT_FOUND", path, "The parent directory was not found");
        if (parent.list().some((entry) => sameEntryName(entry, name))) {
          return error("ALREADY_EXISTS", path, "A workspace entry already exists at this path");
        }
        const directory = parent.createDirectory(name);
        return success(entryMetadata(directory, path));
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async rename(path, to) {
      if (!capabilities.rename) {
        return error("UNSUPPORTED", path, "Workspace rename is not supported");
      }
      const sourceSegments = pathSegments(path);
      const targetSegments = pathSegments(to);
      const sourceParent = sourceSegments.slice(0, -1).join("/");
      const targetParent = targetSegments.slice(0, -1).join("/");
      const targetName = targetSegments.at(-1);
      if (sourceParent !== targetParent || !targetName) {
        return error("INVALID_PATH", to, "Rename must keep the entry in its current directory");
      }
      if (path === to) {
        const unchanged = await resolveEntry(path);
        return unchanged
          ? success(entryMetadata(unchanged, path))
          : error("NOT_FOUND", path, "The workspace entry was not found");
      }
      try {
        const source = await resolveEntry(path);
        if (!source) return error("NOT_FOUND", path, "The workspace entry was not found");
        if (await resolveEntry(to)) {
          return error("ALREADY_EXISTS", to, "A workspace entry already exists at the destination");
        }
        source.rename(targetName);
        const renamed = await resolveEntry(to);
        return renamed
          ? success(entryMetadata(renamed, to))
          : error("IO_FAILURE", to, "The renamed workspace entry could not be verified");
      } catch (thrown) {
        return mapError(`${path} -> ${to}`, thrown);
      }
    },

    async move(path, to) {
      return relocate("move", path, to);
    },

    async copy(path, to) {
      return relocate("copy", path, to);
    },

    async remove(path, mode) {
      if (mode === "trash" || !capabilities.remove) {
        return error("UNSUPPORTED", path, "Trash or removal is not supported by this provider");
      }
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace entry was not found");
        entry.delete();
        return success(undefined);
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },

    async exportFile(path, destinationUri) {
      if (!capabilities.read) return error("READ_ONLY", path, "This workspace is not readable");
      if (!/^file:\/\/\//i.test(destinationUri)) {
        return error("INVALID_PATH", path, "The share destination is invalid");
      }
      try {
        const entry = await resolveEntry(path);
        if (!entry) return error("NOT_FOUND", path, "The workspace file was not found");
        if (isDirectory(entry)) {
          return error("UNSUPPORTED", path, "Directories cannot be shared as files");
        }
        const destination = new File(destinationUri);
        await entry.copy(destination);
        return success(
          Object.freeze({
            uri: destination.uri,
            contentType: entry.type || null,
          } satisfies ExportedFileResult),
        );
      } catch (thrown) {
        return mapError(path, thrown);
      }
    },
  };

  return Object.freeze(adapter);
}
