import { describe, expect, it, vi } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import { failure, success } from "../../../src/domain/result";
import type {
  FileEntry,
  WorkspaceAdapter,
  WorkspaceAdapterError,
} from "../../../src/workspace/workspace-adapter";
import { createWorkspaceAdapterRepository } from "../../../src/workspace/workspace-adapter-repository";
import { parseWorkspacePath, type WorkspacePath } from "../../../src/workspace/workspace-path";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const FIRST_ID = "123e4567-e89b-42d3-a456-426614174001" as DocumentId;
const SECOND_ID = "123e4567-e89b-42d3-a456-426614174002" as DocumentId;

function path(input: string): WorkspacePath {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

function entry(inputPath: string, kind: FileEntry["kind"]): FileEntry {
  const parsedPath = path(inputPath);
  return Object.freeze({
    path: parsedPath,
    name: inputPath.split("/").at(-1) ?? inputPath,
    kind,
    size: kind === "file" ? 12 : null,
    modifiedAt: "2026-07-31T00:00:00.000Z",
    contentType: kind === "file" ? "text/markdown" : null,
  });
}

function adapterError(
  code: WorkspaceAdapterError["code"],
  targetPath: string,
): ReturnType<typeof failure<WorkspaceAdapterError>> {
  return failure(Object.freeze({ code, path: targetPath, message: code }));
}

function createAdapter(overrides: Partial<WorkspaceAdapter> = {}): WorkspaceAdapter {
  const unsupported = async () => adapterError("UNSUPPORTED", "");
  return Object.freeze({
    grant: Object.freeze({
      workspaceId: WORKSPACE_ID,
      provider: "android-saf",
      displayName: "Notes",
      locationSummary: "Notes",
      serializedGrant: "content://provider/tree/notes",
      status: "authorized",
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: "2026-07-31T00:00:00.000Z",
    }),
    capabilities: Object.freeze({
      read: true,
      write: true,
      atomicReplace: false,
      create: true,
      rename: true,
      move: false,
      copy: false,
      remove: true,
      trash: false,
      watch: false,
      share: true,
    }),
    list: unsupported,
    stat: unsupported,
    readText: unsupported,
    writeTextAtomic: unsupported,
    createFile: unsupported,
    createDirectory: unsupported,
    rename: unsupported,
    move: unsupported,
    copy: unsupported,
    remove: unsupported,
    exportFile: unsupported,
    ...overrides,
  } as WorkspaceAdapter);
}

function createRepository(adapter: WorkspaceAdapter, maxEntries = 1_000) {
  return createWorkspaceAdapterRepository({
    adapter,
    deriveDocumentId: async (_workspaceId, targetPath) =>
      targetPath === "docs/guide.md" ? SECOND_ID : FIRST_ID,
    includeFile: (candidate) => candidate.name.endsWith(".md"),
    maxEntries,
    maxDepth: 16,
  });
}

describe("workspace adapter repository", () => {
  it("recursively lists eligible text files as immutable snapshots", async () => {
    const list = vi.fn(async (targetPath?: WorkspacePath) =>
      targetPath === undefined
        ? success(
            Object.freeze([
              entry("docs", "directory"),
              entry("readme.md", "file"),
              entry("image.png", "file"),
            ]),
          )
        : success(Object.freeze([entry("docs/guide.md", "file")])),
    );
    const readText = vi.fn(async (targetPath: WorkspacePath) =>
      success(
        Object.freeze({
          path: targetPath,
          content: targetPath === "readme.md" ? "# Readme" : "# Guide",
          revision: `revision:${targetPath}`,
        }),
      ),
    );
    const repository = createRepository(createAdapter({ list, readText }));

    const result = await repository.list();

    expect(result).toEqual({
      ok: true,
      value: [
        {
          documentId: SECOND_ID,
          path: "docs/guide.md",
          markdown: "# Guide",
          contentHash: "revision:docs/guide.md",
        },
        {
          documentId: FIRST_ID,
          path: "readme.md",
          markdown: "# Readme",
          contentHash: "revision:readme.md",
        },
      ],
    });
    expect(readText).toHaveBeenCalledTimes(2);
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value.every(Object.isFrozen)).toBe(true);
    }
  });

  it("forwards the expected revision and rejects stale external content", async () => {
    const writeTextAtomic = vi.fn(async () => adapterError("EXTERNAL_MODIFICATION", "readme.md"));
    const repository = createRepository(createAdapter({ writeTextAtomic }));

    const result = await repository.writeVerified({
      path: "readme.md",
      markdown: "changed",
      expectedBaseHash: "revision:old",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "EXTERNAL_MODIFICATION", path: "readme.md" },
    });
    expect(writeTextAtomic).toHaveBeenCalledWith(path("readme.md"), "changed", "revision:old");
  });

  it("verifies provider write-back before reporting a successful save", async () => {
    const writeTextAtomic = vi.fn(async (targetPath: WorkspacePath) =>
      success(Object.freeze({ path: targetPath, revision: "revision:new", atomic: false })),
    );
    const readText = vi.fn(async (targetPath: WorkspacePath) =>
      success(Object.freeze({ path: targetPath, content: "different", revision: "revision:new" })),
    );
    const repository = createRepository(createAdapter({ writeTextAtomic, readText }));

    const result = await repository.writeVerified({
      path: "readme.md",
      markdown: "expected",
      expectedBaseHash: "revision:old",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "HASH_FAILED", path: "readme.md" },
    });
  });

  it("creates a file and returns the provider-confirmed identity and revision", async () => {
    const createFile = vi.fn(async (targetPath: WorkspacePath) =>
      success(Object.freeze({ path: targetPath, revision: "revision:created", atomic: false })),
    );
    const readText = vi.fn(async (targetPath: WorkspacePath) =>
      success(Object.freeze({ path: targetPath, content: "# New", revision: "revision:created" })),
    );
    const repository = createRepository(createAdapter({ createFile, readText }));

    const result = await repository.create({ path: "new.md", markdown: "# New" });

    expect(result).toEqual({
      ok: true,
      value: {
        documentId: FIRST_ID,
        path: "new.md",
        markdown: "# New",
        contentHash: "revision:created",
      },
    });
  });

  it("maps adapter errors for rename and remove without deleting outside the provider", async () => {
    const rename = vi.fn(async () => adapterError("ALREADY_EXISTS", "copy.md"));
    const remove = vi.fn(async () => adapterError("PERMISSION_REVOKED", "readme.md"));
    const repository = createRepository(createAdapter({ rename, remove }));

    const renamed = await repository.rename({ from: "readme.md", to: "copy.md" });
    const removed = await repository.remove("readme.md");

    expect(renamed).toEqual({
      ok: false,
      error: { code: "ALREADY_EXISTS", path: "copy.md" },
    });
    expect(removed).toEqual({
      ok: false,
      error: { code: "IO_FAILURE", path: "readme.md" },
    });
    expect(remove).toHaveBeenCalledWith(path("readme.md"), "permanent");
  });

  it("rejects invalid paths before invoking the adapter", async () => {
    const readText = vi.fn(async () => adapterError("IO_FAILURE", ""));
    const repository = createRepository(createAdapter({ readText }));

    const result = await repository.read("../outside.md");

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_PATH", path: "../outside.md" },
    });
    expect(readText).not.toHaveBeenCalled();
  });

  it("fails closed when provider enumeration exceeds the configured bound", async () => {
    const list = vi.fn(async () =>
      success(Object.freeze([entry("one.md", "file"), entry("two.md", "file")])),
    );
    const repository = createRepository(createAdapter({ list }), 1);

    const result = await repository.list();

    expect(result).toEqual({
      ok: false,
      error: { code: "IO_FAILURE", path: "" },
    });
  });

  it("does not expose a snapshot when stable document identity derivation fails", async () => {
    const readText = vi.fn(async (targetPath: WorkspacePath) =>
      success(Object.freeze({ path: targetPath, content: "# Readme", revision: "revision:1" })),
    );
    const repository = createWorkspaceAdapterRepository({
      adapter: createAdapter({ readText }),
      deriveDocumentId: async () => "invalid" as DocumentId,
      includeFile: () => true,
    });

    const result = await repository.read("readme.md");

    expect(result).toEqual({
      ok: false,
      error: { code: "ID_GENERATION_FAILED", path: "readme.md" },
    });
  });

  it("does not claim persisted iOS grants before the native bookmark adapter exists", () => {
    const android = createRepository(createAdapter());
    const iosGrant = Object.freeze({
      ...createAdapter().grant,
      provider: "ios-bookmark" as const,
      serializedGrant: "file:///provider/notes",
    });
    const ios = createRepository(createAdapter({ grant: iosGrant }));

    expect(android.capabilities.persistedExternalGrants).toBe(true);
    expect(ios.capabilities.persistedExternalGrants).toBe(false);
  });
});
