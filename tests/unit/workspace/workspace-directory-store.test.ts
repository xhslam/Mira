import { describe, expect, it } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import type { VaultStorage } from "../../../src/workspace/vault-storage";
import { createWorkspaceDirectoryStore } from "../../../src/workspace/workspace-directory-store";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

function path(value: string) {
  const parsed = parseWorkspacePath(value);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

function storage(): VaultStorage {
  let files: ReadonlyMap<string, string> = new Map();
  return Object.freeze({
    async read(key: string) {
      return files.get(key) ?? null;
    },
    async write(key: string, value: string) {
      files = new Map([...files, [key, value]]);
    },
    async move() {},
    async remove(key: string) {
      files = new Map([...files].filter(([candidate]) => candidate !== key));
    },
    async exists(key: string) {
      return files.has(key);
    },
  });
}

describe("workspace directory store", () => {
  it("persists sorted, unique, immutable directory paths", async () => {
    const store = createWorkspaceDirectoryStore(storage(), WORKSPACE_ID);

    await store.replace([path("zeta"), path("docs/api"), path("docs/api")]);
    const listed = await store.list();

    expect(listed).toEqual(["docs/api", "zeta"]);
    expect(Object.isFrozen(listed)).toBe(true);
  });

  it("rejects malformed persisted catalogs instead of trusting paths", async () => {
    const vault = storage();
    await vault.write(
      `workspace-directories/${WORKSPACE_ID}.json`,
      JSON.stringify({ version: 1, paths: ["../outside"] }),
    );

    await expect(createWorkspaceDirectoryStore(vault, WORKSPACE_ID).list()).rejects.toThrow(
      "Invalid directory catalog path",
    );
  });
});
