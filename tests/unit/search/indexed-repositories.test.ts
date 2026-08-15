import { describe, expect, test, vi } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import type { SearchIndex } from "../../../src/search/search-index";
import { createIndexedWorkspaceRepository } from "../../../src/search/indexed-workspace-repository";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const DOCUMENT_ID = "223e4567-e89b-42d3-a456-426614174000" as DocumentId;

function searchIndex(): SearchIndex {
  return Object.freeze({
    initialize: vi.fn(),
    replaceWorkspace: vi.fn(),
    upsertDocument: vi.fn(),
    removeDocument: vi.fn(),
    upsertHistory: vi.fn(),
    removeHistory: vi.fn(),
    replaceDocumentHistory: vi.fn(),
    clearWorkspaceHistory: vi.fn(),
    search: vi.fn(),
    rebuild: vi.fn(),
    verify: vi.fn(),
  }) as unknown as SearchIndex;
}

describe("indexed workspace repository", () => {
  test("updates the derived index after verified create, write, rename and remove", async () => {
    const index = searchIndex();
    const base = createMemoryWorkspaceRepository({
      capabilities: { atomicReplace: true, persistedExternalGrants: false },
      createId: () => DOCUMENT_ID,
      hashMarkdown: async (content) => `hash:${content}`,
    });
    const repository = createIndexedWorkspaceRepository(base, index, WORKSPACE_ID);
    const created = await repository.create({ path: "note.md", markdown: "one" });
    if (!created.ok) throw new Error("create failed");
    await repository.writeVerified({
      path: "note.md",
      expectedBaseHash: created.value.contentHash,
      markdown: "two",
    });
    await repository.rename({ from: "note.md", to: "renamed.md" });
    await repository.remove("renamed.md");

    expect(index.upsertDocument).toHaveBeenCalledTimes(3);
    expect(index.removeDocument).toHaveBeenCalledWith(WORKSPACE_ID, DOCUMENT_ID);
  });

  test("rebuilds the workspace from source-of-truth files", async () => {
    const index = searchIndex();
    const base = createMemoryWorkspaceRepository({
      capabilities: { atomicReplace: true, persistedExternalGrants: false },
      createId: () => DOCUMENT_ID,
      hashMarkdown: async (content) => `hash:${content}`,
    });
    await base.create({ path: "note.md", markdown: "source" });
    const repository = createIndexedWorkspaceRepository(base, index, WORKSPACE_ID);
    await repository.synchronizeSearchIndex();
    expect(index.rebuild).toHaveBeenCalledWith(WORKSPACE_ID, [
      expect.objectContaining({ content: "source" }),
    ]);
  });

  test("does not turn a verified file save into failure when derived indexing fails", async () => {
    const index = searchIndex();
    vi.mocked(index.upsertDocument).mockRejectedValue(new Error("corrupt index"));
    const base = createMemoryWorkspaceRepository({
      capabilities: { atomicReplace: true, persistedExternalGrants: false },
      createId: () => DOCUMENT_ID,
      hashMarkdown: async (content) => `hash:${content}`,
    });
    const repository = createIndexedWorkspaceRepository(base, index, WORKSPACE_ID);

    await expect(repository.create({ path: "saved.md", markdown: "safe" })).resolves.toMatchObject({
      ok: true,
    });
    await expect(base.read("saved.md")).resolves.toMatchObject({
      ok: true,
      value: { markdown: "safe" },
    });
  });
});
