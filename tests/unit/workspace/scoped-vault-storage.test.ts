import { describe, expect, it, vi } from "vitest";

import { createScopedVaultStorage } from "../../../src/workspace/scoped-vault-storage";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

function createStorage(): VaultStorage {
  return Object.freeze({
    read: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
  });
}

describe("scoped vault storage", () => {
  it("prefixes every operation without changing caller paths", async () => {
    const storage = createStorage();
    const scoped = createScopedVaultStorage(
      storage,
      "workspace-state/123e4567-e89b-42d3-a456-426614174000",
    );

    await scoped.read("recovery-drafts.json");
    await scoped.write("history/index.json", "contents");
    await scoped.move("pending.json", "saved.json");
    await scoped.remove("old.json");
    await scoped.exists("current.json");

    expect(storage.read).toHaveBeenCalledWith(
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/recovery-drafts.json",
    );
    expect(storage.write).toHaveBeenCalledWith(
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/history/index.json",
      "contents",
    );
    expect(storage.move).toHaveBeenCalledWith(
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/pending.json",
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/saved.json",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/old.json",
    );
    expect(storage.exists).toHaveBeenCalledWith(
      "workspace-state/123e4567-e89b-42d3-a456-426614174000/current.json",
    );
  });

  it.each(["", "/absolute", "../outside", "scope/../outside", "scope//nested", "scope/"])(
    "rejects an unsafe prefix: %s",
    (prefix) => {
      expect(() => createScopedVaultStorage(createStorage(), prefix)).toThrow(
        "Invalid scoped vault prefix",
      );
    },
  );

  it("rejects unsafe operation paths before calling the underlying storage", async () => {
    const storage = createStorage();
    const scoped = createScopedVaultStorage(storage, "workspace-state/id");

    await expect(scoped.read("../outside")).rejects.toThrow("Invalid scoped vault path");
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("returns an immutable scoped adapter", () => {
    expect(Object.isFrozen(createScopedVaultStorage(createStorage(), "workspace-state/id"))).toBe(
      true,
    );
  });
});
