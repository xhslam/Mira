import { describe, expect, it, vi } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import { failure, success } from "../../../src/domain/result";
import type {
  FileEntry,
  WorkspaceAdapter,
  WorkspaceAdapterError,
} from "../../../src/workspace/workspace-adapter";
import {
  createWorkspaceConflictPath,
  createAdapterWorkspaceBrowser,
  createRepositoryWorkspaceBrowser,
} from "../../../src/workspace/workspace-browser";
import { parseWorkspacePath, type WorkspacePath } from "../../../src/workspace/workspace-path";
import type { WorkspaceRepository } from "../../../src/workspace/workspace-repository";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174001" as DocumentId;

function path(input: string): WorkspacePath {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

function entry(inputPath: string, kind: FileEntry["kind"], contentType: string | null = null) {
  return Object.freeze({
    path: path(inputPath),
    name: inputPath.split("/").at(-1) ?? inputPath,
    kind,
    size: kind === "file" ? 12 : null,
    modifiedAt: "2026-07-31T00:00:00.000Z",
    contentType: kind === "file" ? contentType : null,
  });
}

function adapter(overrides: Partial<WorkspaceAdapter> = {}): WorkspaceAdapter {
  const unsupported = async () =>
    failure(
      Object.freeze({
        code: "UNSUPPORTED" as const,
        path: "",
        message: "Unsupported",
      }),
    );
  return Object.freeze({
    grant: Object.freeze({
      workspaceId: WORKSPACE_ID,
      provider: "android-saf" as const,
      displayName: "Notes",
      locationSummary: "Documents/Notes",
      serializedGrant: "content://provider/tree/notes",
      status: "authorized" as const,
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: "2026-07-31T00:00:00.000Z",
    }),
    capabilities: Object.freeze({
      read: true,
      write: true,
      atomicReplace: false,
      create: true,
      rename: false,
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
    ...overrides,
  } as WorkspaceAdapter);
}

function repository(): WorkspaceRepository {
  return Object.freeze({
    capabilities: Object.freeze({ atomicReplace: false, persistedExternalGrants: false }),
    async list() {
      return success(
        Object.freeze([
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("projects/mobile/readme.md"),
            markdown: "# Readme\n",
            contentHash: "hash:readme",
          }),
        ]),
      );
    },
    async read() {
      return failure(Object.freeze({ code: "NOT_FOUND" as const, path: "" }));
    },
    async create() {
      return failure(Object.freeze({ code: "IO_FAILURE" as const, path: "" }));
    },
    async writeVerified() {
      return failure(Object.freeze({ code: "IO_FAILURE" as const, path: "" }));
    },
    async rename() {
      return failure(Object.freeze({ code: "IO_FAILURE" as const, path: "" }));
    },
    async remove() {
      return failure(Object.freeze({ code: "IO_FAILURE" as const, path: "" }));
    },
  });
}

describe("workspace browser", () => {
  it("creates collision-free sibling paths while preserving extensions", () => {
    expect(createWorkspaceConflictPath("notes/readme.md", ["notes/readme.md"])).toBe(
      "notes/readme (2).md",
    );
    expect(
      createWorkspaceConflictPath("notes/readme.md", ["notes/readme.md", "notes/readme (2).md"]),
    ).toBe("notes/readme (3).md");
    expect(createWorkspaceConflictPath("archive", ["archive"])).toBe("archive (2)");
    expect(createWorkspaceConflictPath("free.md", ["other.md"])).toBe("free.md");
  });

  it("recursively lists provider metadata without reading file contents", async () => {
    const list = vi.fn(async (target?: WorkspacePath) => {
      if (target === undefined) {
        return success(
          Object.freeze([
            entry("docs", "directory"),
            entry("diagram.mmd", "file", "text/vnd.mermaid"),
          ]),
        );
      }
      return success(
        Object.freeze([
          entry("docs/readme.md", "file", "text/markdown"),
          entry("docs/data.json", "file", "application/json"),
        ]),
      );
    });
    const readText = vi.fn();
    const browser = createAdapterWorkspaceBrowser({ adapter: adapter({ list, readText }) });

    const result = await browser.list();

    expect(result).toMatchObject({
      ok: true,
      value: [
        { path: "diagram.mmd", kind: "file" },
        { path: "docs", kind: "directory" },
        { path: "docs/data.json", kind: "file" },
        { path: "docs/readme.md", kind: "file" },
      ],
    });
    expect(readText).not.toHaveBeenCalled();
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value.every(Object.isFrozen)).toBe(true);
    }
  });

  it("fails closed when provider traversal exceeds its entry bound", async () => {
    const list = vi.fn(async () =>
      success(Object.freeze([entry("one.md", "file"), entry("two.md", "file")])),
    );
    const browser = createAdapterWorkspaceBrowser({ adapter: adapter({ list }), maxEntries: 1 });

    const result = await browser.list();

    expect(result).toEqual({
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        path: "",
        message: "Workspace browser entry limit exceeded",
      },
    });
  });

  it("derives real managed document paths and implicit parent directories", async () => {
    const browser = createRepositoryWorkspaceBrowser(repository());

    const result = await browser.list();

    expect(result).toMatchObject({
      ok: true,
      value: [
        { path: "projects", name: "projects", kind: "directory" },
        { path: "projects/mobile", name: "mobile", kind: "directory" },
        {
          path: "projects/mobile/readme.md",
          name: "readme.md",
          kind: "file",
          size: 9,
          contentType: "text/markdown",
        },
      ],
    });
    expect(browser.capabilities).toMatchObject({
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
      share: false,
    });
  });

  it("exposes only operations implemented by the provider boundary", () => {
    const browser = createAdapterWorkspaceBrowser({ adapter: adapter() });

    expect(browser.capabilities).toEqual({
      createFile: true,
      createDirectory: true,
      createReplace: true,
      createKeepBoth: true,
      rename: false,
      renameDirectory: false,
      renameReplace: false,
      renameKeepBoth: false,
      move: false,
      moveDirectory: false,
      moveReplace: false,
      moveKeepBoth: false,
      copy: false,
      copyDirectory: false,
      copyReplace: false,
      copyKeepBoth: false,
      remove: true,
      removeDirectory: true,
      trash: false,
      share: false,
    });
  });

  it("routes share through the configured service and rejects missing share capability", async () => {
    const share = vi.fn(async () => success(undefined));
    const supported = createAdapterWorkspaceBrowser({ adapter: adapter(), share });
    const unsupported = createAdapterWorkspaceBrowser({ adapter: adapter() });

    const shared = await supported.share("docs/readme.md");
    const rejected = await unsupported.share("docs/readme.md");

    expect(supported.capabilities.share).toBe(true);
    expect(shared).toEqual({ ok: true, value: undefined });
    expect(share).toHaveBeenCalledWith(path("docs/readme.md"), "readme.md");
    expect(rejected).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
  });

  it("rejects sharing when the provider capability is disabled", async () => {
    const share = vi.fn(async () => success(undefined));
    const baseAdapter = adapter();
    const browser = createAdapterWorkspaceBrowser({
      adapter: adapter({
        capabilities: Object.freeze({ ...baseAdapter.capabilities, share: false }),
      }),
      share,
    });

    const result = await browser.share("docs/readme.md");

    expect(browser.capabilities.share).toBe(false);
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(share).not.toHaveBeenCalled();
  });

  it("executes provider file and directory commands through validated paths", async () => {
    const createFile = vi.fn(async (target: WorkspacePath) =>
      success(Object.freeze({ path: target, revision: "revision:new", atomic: false })),
    );
    const createDirectory = vi.fn(async (target: WorkspacePath) =>
      success(entry(target, "directory")),
    );
    const remove = vi.fn(async () => success(undefined));
    const browser = createAdapterWorkspaceBrowser({
      adapter: adapter({ createFile, createDirectory, remove }),
    });

    const created = await browser.createFile("notes/new.md", "# New");
    const directory = await browser.createDirectory("archive");
    const removed = await browser.remove("notes/new.md", "permanent");

    expect(created).toMatchObject({
      ok: true,
      value: { path: "notes/new.md", name: "new.md", kind: "file", size: 5 },
    });
    expect(directory).toMatchObject({ ok: true, value: { path: "archive", kind: "directory" } });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(createFile).toHaveBeenCalledWith(path("notes/new.md"), "# New");
    expect(remove).toHaveBeenCalledWith(path("notes/new.md"), "permanent");
  });

  it("rejects unsupported or invalid provider commands before mutation", async () => {
    const rename = vi.fn();
    const browser = createAdapterWorkspaceBrowser({ adapter: adapter({ rename }) });

    const unsupported = await browser.rename("old.md", "new.md");
    const invalid = await browser.createFile("../outside.md", "unsafe");

    expect(unsupported).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
    expect(rename).not.toHaveBeenCalled();
  });

  it("uses verified repository operations for managed files", async () => {
    const base = repository();
    const create = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("new.md"),
          markdown: "# New",
          contentHash: "hash:new",
        }),
      ),
    );
    const rename = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("renamed.md"),
          markdown: "# New",
          contentHash: "hash:new",
        }),
      ),
    );
    const remove = vi.fn(async () =>
      success(Object.freeze({ documentId: DOCUMENT_ID, path: path("renamed.md") })),
    );
    const browser = createRepositoryWorkspaceBrowser(
      Object.freeze({ ...base, create, rename, remove }),
    );

    const created = await browser.createFile("new.md", "# New");
    const renamed = await browser.rename("new.md", "renamed.md");
    const removed = await browser.remove("renamed.md", "permanent");

    expect(created).toMatchObject({ ok: true, value: { path: "new.md", size: 5 } });
    expect(renamed).toMatchObject({ ok: true, value: { path: "renamed.md", size: 5 } });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(create).toHaveBeenCalledWith({ path: "new.md", markdown: "# New" });
    expect(rename).toHaveBeenCalledWith({ from: "new.md", to: "renamed.md" });
    expect(remove).toHaveBeenCalledWith("renamed.md");
  });

  it("replaces an existing managed file only after reading its expected revision", async () => {
    const base = repository();
    const create = vi.fn(async () =>
      failure(Object.freeze({ code: "ALREADY_EXISTS" as const, path: "new.md" })),
    );
    const read = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("new.md"),
          markdown: "old",
          contentHash: "hash:old",
        }),
      ),
    );
    const writeVerified = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("new.md"),
          markdown: "new",
          contentHash: "hash:new",
        }),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(
      Object.freeze({ ...base, create, read, writeVerified }),
    );

    const result = await browser.createFile("new.md", "new", "replace");

    expect(result).toMatchObject({ ok: true, value: { path: "new.md", size: 3 } });
    expect(writeVerified).toHaveBeenCalledWith({
      path: "new.md",
      markdown: "new",
      expectedBaseHash: "hash:old",
    });
  });

  it("keeps both managed files with a generated collision-free path", async () => {
    const base = repository();
    const create = vi.fn(async (request: { path: string; markdown: string }) =>
      request.path === "new.md"
        ? failure(Object.freeze({ code: "ALREADY_EXISTS" as const, path: request.path }))
        : success(
            Object.freeze({
              documentId: DOCUMENT_ID,
              path: path(request.path),
              markdown: request.markdown,
              contentHash: "hash:new",
            }),
          ),
    );
    const list = vi.fn(async () =>
      success(
        Object.freeze([
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("new.md"),
            markdown: "old",
            contentHash: "hash:old",
          }),
        ]),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, create, list }));

    const result = await browser.createFile("new.md", "new", "keep-both");

    expect(result).toMatchObject({ ok: true, value: { path: "new (2).md" } });
  });

  it("renames a managed file to a collision-free sibling when keeping both", async () => {
    const base = repository();
    const list = vi.fn(async () =>
      success(
        Object.freeze([
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("source.md"),
            markdown: "source",
            contentHash: "hash:source",
          }),
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("target.md"),
            markdown: "target",
            contentHash: "hash:target",
          }),
        ]),
      ),
    );
    const rename = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("target (2).md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, list, rename }));

    const result = await browser.rename("source.md", "target.md", "keep-both");

    expect(result).toMatchObject({ ok: true, value: { path: "target (2).md" } });
    expect(rename).toHaveBeenCalledWith({ from: "source.md", to: "target (2).md" });
  });

  it("rejects replace rename when the repository has no transactional operation", async () => {
    const base = repository();
    const rename = vi.fn();
    const browser = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, rename }));

    const result = await browser.rename("source.md", "target.md", "replace");

    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(rename).not.toHaveBeenCalled();
  });

  it("moves a managed file through verified rename with keep-both collision handling", async () => {
    const base = repository();
    const list = vi.fn(async () =>
      success(
        Object.freeze([
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("source.md"),
            markdown: "source",
            contentHash: "hash:source",
          }),
          Object.freeze({
            documentId: DOCUMENT_ID,
            path: path("archive/source.md"),
            markdown: "existing",
            contentHash: "hash:existing",
          }),
        ]),
      ),
    );
    const rename = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("archive/source (2).md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, list, rename }));

    const result = await browser.move("source.md", "archive/source.md", "keep-both");

    expect(result).toMatchObject({ ok: true, value: { path: "archive/source (2).md" } });
    expect(rename).toHaveBeenCalledWith({
      from: "source.md",
      to: "archive/source (2).md",
    });
  });

  it("keeps managed move callable without an object receiver", async () => {
    const base = repository();
    const rename = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("archive/source.md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const { move } = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, rename }));

    const result = await move("source.md", "archive/source.md");

    expect(result).toMatchObject({ ok: true, value: { path: "archive/source.md" } });
  });

  it("copies a managed file without changing the source identity", async () => {
    const base = repository();
    const read = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("source.md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const create = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("copies/source.md"),
          markdown: "source",
          contentHash: "hash:copy",
        }),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(Object.freeze({ ...base, read, create }));

    const result = await browser.copy("source.md", "copies/source.md");

    expect(result).toMatchObject({ ok: true, value: { path: "copies/source.md", size: 6 } });
    expect(create).toHaveBeenCalledWith({ path: "copies/source.md", markdown: "source" });
  });

  it("replaces a managed copy target only with its verified revision", async () => {
    const base = repository();
    const read = vi.fn(async (requestedPath: string) =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path(requestedPath),
          markdown: requestedPath === "source.md" ? "source" : "target",
          contentHash: requestedPath === "source.md" ? "hash:source" : "hash:target",
        }),
      ),
    );
    const writeVerified = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("target.md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const browser = createRepositoryWorkspaceBrowser(
      Object.freeze({ ...base, read, writeVerified }),
    );

    const result = await browser.copy("source.md", "target.md", "replace");

    expect(result).toMatchObject({ ok: true, value: { path: "target.md", size: 6 } });
    expect(writeVerified).toHaveBeenCalledWith({
      path: "target.md",
      markdown: "source",
      expectedBaseHash: "hash:target",
    });
  });

  it("does not report replacing a file with a copy of itself as success", async () => {
    const base = repository();
    const read = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("source.md"),
          markdown: "source",
          contentHash: "hash:source",
        }),
      ),
    );
    const writeVerified = vi.fn();
    const browser = createRepositoryWorkspaceBrowser(
      Object.freeze({ ...base, read, writeVerified }),
    );

    const result = await browser.copy("source.md", "source.md", "replace");

    expect(result).toMatchObject({ ok: false, error: { code: "ALREADY_EXISTS" } });
    expect(writeVerified).not.toHaveBeenCalled();
  });
});
