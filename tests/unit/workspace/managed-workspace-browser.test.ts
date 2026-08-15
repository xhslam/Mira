import { describe, expect, it } from "vitest";

import { parseDocumentId, type DocumentId } from "../../../src/domain/identifiers";
import { createManagedWorkspaceBrowser } from "../../../src/workspace/managed-workspace-browser";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";
import type { WorkspaceDirectoryStore } from "../../../src/workspace/workspace-directory-store";
import type { WorkspacePath } from "../../../src/workspace/workspace-path";

function documentId(index: number): DocumentId {
  const parsed = parseDocumentId(`123e4567-e89b-42d3-a456-${index.toString().padStart(12, "0")}`);
  if (!parsed.ok) throw new Error("Invalid document ID");
  return parsed.value;
}

function setup() {
  let nextId = 1;
  let directories: readonly WorkspacePath[] = Object.freeze([]);
  const repository = createMemoryWorkspaceRepository({
    capabilities: { atomicReplace: true, persistedExternalGrants: false },
    createId: () => documentId(nextId++),
    hashMarkdown: async (markdown) => `hash:${markdown}`,
  });
  const directoryStore: WorkspaceDirectoryStore = Object.freeze({
    async list() {
      return directories;
    },
    async replace(next) {
      directories = Object.freeze([...next]);
    },
  });
  return { repository, browser: createManagedWorkspaceBrowser({ repository, directoryStore }) };
}

describe("managed workspace browser directories", () => {
  it("persists empty directories and exposes recursive capabilities", async () => {
    const { browser } = setup();

    const created = await browser.createDirectory("notes");
    const listed = await browser.list();

    expect(created).toMatchObject({ ok: true, value: { path: "notes", kind: "directory" } });
    expect(listed).toMatchObject({ ok: true, value: [{ path: "notes", kind: "directory" }] });
    expect(browser.capabilities).toMatchObject({
      createDirectory: true,
      renameDirectory: true,
      moveDirectory: true,
      copyDirectory: true,
      removeDirectory: true,
    });
  });

  it("recursively copies and moves directories while preserving file contents", async () => {
    const { browser, repository } = setup();
    await browser.createDirectory("notes");
    await browser.createDirectory("archive");
    await browser.createFile("notes/readme.md", "# Readme");

    const copied = await browser.copy("notes", "notes-copy");
    const moved = await browser.move("notes", "archive/notes");
    const copiedFile = await repository.read("notes-copy/readme.md");
    const movedFile = await repository.read("archive/notes/readme.md");
    const oldFile = await repository.read("notes/readme.md");

    expect(copied).toMatchObject({ ok: true, value: { path: "notes-copy" } });
    expect(moved).toMatchObject({ ok: true, value: { path: "archive/notes" } });
    expect(copiedFile).toMatchObject({ ok: true, value: { markdown: "# Readme" } });
    expect(movedFile).toMatchObject({ ok: true, value: { markdown: "# Readme" } });
    expect(oldFile).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("removes a directory tree and rejects collisions or recursive destinations", async () => {
    const { browser, repository } = setup();
    await browser.createDirectory("notes");
    await browser.createDirectory("occupied");
    await browser.createFile("notes/readme.md", "# Readme");

    const collision = await browser.copy("notes", "occupied");
    const recursive = await browser.move("notes", "notes/nested");
    const removed = await browser.remove("notes", "permanent");
    const file = await repository.read("notes/readme.md");

    expect(collision).toMatchObject({ ok: false, error: { code: "ALREADY_EXISTS" } });
    expect(recursive).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
    expect(removed).toEqual({ ok: true, value: undefined });
    expect(file).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
