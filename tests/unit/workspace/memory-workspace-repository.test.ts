import { describe, expect, it } from "vitest";

import { parseDocumentId, type DocumentId } from "../../../src/domain/identifiers";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";
import { workspaceRepositoryContract } from "../../contracts/workspace-repository.contract";

function testDocumentId(index: number): DocumentId {
  const suffix = index.toString().padStart(12, "0");
  const result = parseDocumentId(`123e4567-e89b-42d3-a456-${suffix}`);
  if (!result.ok) {
    throw new Error("invalid generated document ID in test");
  }
  return result.value;
}

function createRepository() {
  let nextId = 1;

  return createMemoryWorkspaceRepository({
    capabilities: {
      atomicReplace: true,
      persistedExternalGrants: false,
    },
    createId: () => testDocumentId(nextId++),
    hashMarkdown: async (markdown) => `verified:${markdown}`,
  });
}

workspaceRepositoryContract("memory", createRepository);

describe("memory workspace repository", () => {
  it("publishes immutable provider capabilities", () => {
    const repository = createRepository();

    expect(repository.capabilities).toEqual({
      atomicReplace: true,
      persistedExternalGrants: false,
    });
    expect(Object.isFrozen(repository.capabilities)).toBe(true);
  });

  it("contains hashing failures as typed errors", async () => {
    const repository = createMemoryWorkspaceRepository({
      capabilities: { atomicReplace: false, persistedExternalGrants: false },
      createId: () => testDocumentId(1),
      hashMarkdown: async () => {
        throw new Error("hash unavailable");
      },
    });

    await expect(
      repository.create({ path: "notes/failure.md", markdown: "content" }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "HASH_FAILED", path: "notes/failure.md" },
    });
    await expect(repository.list()).resolves.toEqual({ ok: true, value: [] });
  });
});
