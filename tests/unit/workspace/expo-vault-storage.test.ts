import { describe, expect, test } from "vitest";

import { createExpoVaultStorage } from "../../../src/workspace/expo-vault-storage";

function createFileSystem() {
  const calls: string[] = [];
  const values = new Map<string, string>();
  const directories = new Set(["file:///private"]);
  return {
    calls,
    values,
    api: {
      documentDirectory: "file:///private/",
      async getInfoAsync(uri: string) {
        return { exists: values.has(uri), isDirectory: false };
      },
      async readAsStringAsync(uri: string) {
        const value = values.get(uri);
        if (value === undefined) throw new Error("missing");
        return value;
      },
      async writeAsStringAsync(uri: string, contents: string) {
        const parent = uri.slice(0, uri.lastIndexOf("/"));
        if (!directories.has(parent)) throw new Error("missing parent directory");
        calls.push(`write:${uri}`);
        values.set(uri, contents);
      },
      async makeDirectoryAsync(uri: string) {
        calls.push(`mkdir:${uri}`);
        directories.add(uri);
      },
      async moveAsync({ from, to }: { from: string; to: string }) {
        const value = values.get(from);
        if (value === undefined) throw new Error("missing");
        values.delete(from);
        values.set(to, value);
      },
      async deleteAsync(uri: string) {
        values.delete(uri);
      },
    },
  };
}

describe("Expo vault storage", () => {
  test("stores files only below the app-private vault root", async () => {
    const fileSystem = createFileSystem();
    const storage = createExpoVaultStorage(fileSystem.api);

    await storage.write("documents/folder/note.md", "body");

    expect(fileSystem.values.get("file:///private/vmark-mobile/documents/folder/note.md")).toBe(
      "body",
    );
    expect(fileSystem.calls).toContain("mkdir:file:///private/vmark-mobile/documents/folder");
  });

  test("returns null for a missing file and makes remove idempotent", async () => {
    const storage = createExpoVaultStorage(createFileSystem().api);

    expect(await storage.read("documents/missing.md")).toBeNull();
    await expect(storage.remove("documents/missing.md")).resolves.toBeUndefined();
  });

  test("creates the private vault root before writing top-level metadata", async () => {
    const fileSystem = createFileSystem();
    const storage = createExpoVaultStorage(fileSystem.api);

    await storage.write("catalog.json", "{}");

    expect(fileSystem.calls).toEqual([
      "mkdir:file:///private/vmark-mobile",
      "write:file:///private/vmark-mobile/catalog.json",
    ]);
  });

  test.each(["../outside", "/absolute", "C:/drive", "folder\\note"])(
    "rejects unsafe internal path %s",
    async (path) => {
      const storage = createExpoVaultStorage(createFileSystem().api);

      await expect(storage.write(path, "unsafe")).rejects.toThrow("Unsafe vault path");
    },
  );
});
