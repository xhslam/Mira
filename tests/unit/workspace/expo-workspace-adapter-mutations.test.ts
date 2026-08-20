import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => {
  type MockEntry = MockDirectory | MockFile;

  class MockDirectory {
    readonly kind = "directory";
    readonly children = new Map<string, MockEntry>();
    name: string;
    parent: MockDirectory | null;

    constructor(parentOrUri: MockDirectory | string, name?: string) {
      this.parent = typeof parentOrUri === "string" ? null : parentOrUri;
      this.name = name ?? (typeof parentOrUri === "string" ? "root" : "directory");
    }

    get uri(): string {
      return this.parent ? `${this.parent.uri}/${this.name}` : "content://provider/tree/notes";
    }

    list(): MockEntry[] {
      return [...this.children.values()];
    }

    info() {
      return { modificationTime: 1_753_910_400_000 };
    }

    createDirectory(name: string): MockDirectory {
      if (this.children.has(name)) throw new Error("already exists");
      const child = new MockDirectory(this, name);
      this.children.set(name, child);
      return child;
    }

    createFile(name: string, type: string | null): MockFile {
      if (this.children.has(name)) throw new Error("already exists");
      const child = new MockFile(this, name, type);
      this.children.set(name, child);
      return child;
    }

    rename(name: string): void {
      if (!this.parent) throw new Error("unsupported");
      if (this.parent.children.has(name)) throw new Error("already exists");
      this.parent.children.delete(this.name);
      this.name = name;
      this.parent.children.set(name, this);
    }

    async copy(destination: MockEntry): Promise<void> {
      if (!destination.parent) throw new Error("not found");
      if (destination.parent.children.has(destination.name)) throw new Error("already exists");
      destination.parent.children.set(
        destination.name,
        cloneDirectory(this, destination.parent, destination.name),
      );
    }

    async move(destination: MockEntry): Promise<void> {
      if (!this.parent || !destination.parent) throw new Error("not found");
      if (destination.parent.children.has(destination.name)) throw new Error("already exists");
      this.parent.children.delete(this.name);
      this.parent = destination.parent;
      this.name = destination.name;
      this.parent.children.set(this.name, this);
    }

    delete(): void {
      this.parent?.children.delete(this.name);
    }
  }

  class MockFile {
    readonly kind = "file";
    name: string;
    parent: MockDirectory | null;
    type: string;
    value = "";

    constructor(
      parentOrUri: MockDirectory | string,
      name?: string,
      type: string | null = "text/plain",
    ) {
      this.parent = typeof parentOrUri === "string" ? null : parentOrUri;
      this.name = name ?? "file";
      this.type = type ?? "";
    }

    get uri(): string {
      return this.parent ? `${this.parent.uri}/${this.name}` : "file:///detached";
    }

    get size(): number {
      return new TextEncoder().encode(this.value).byteLength;
    }

    get lastModified(): number {
      return 1_753_910_400_000;
    }

    info() {
      return { size: this.size, modificationTime: this.lastModified };
    }

    text(): Promise<string> {
      return Promise.resolve(this.value);
    }

    write(content: string): void {
      this.value = content;
    }

    rename(name: string): void {
      if (!this.parent) throw new Error("unsupported");
      if (this.parent.children.has(name)) throw new Error("already exists");
      this.parent.children.delete(this.name);
      this.name = name;
      this.parent.children.set(name, this);
    }

    async copy(destination: MockEntry): Promise<void> {
      if (!destination.parent) throw new Error("not found");
      if (destination.parent.children.has(destination.name)) throw new Error("already exists");
      const copy = new MockFile(destination.parent, destination.name, this.type);
      copy.value = this.value;
      destination.parent.children.set(destination.name, copy);
    }

    async move(destination: MockEntry): Promise<void> {
      if (!this.parent || !destination.parent) throw new Error("not found");
      if (destination.parent.children.has(destination.name)) throw new Error("already exists");
      this.parent.children.delete(this.name);
      this.parent = destination.parent;
      this.name = destination.name;
      this.parent.children.set(this.name, this);
    }

    delete(): void {
      this.parent?.children.delete(this.name);
    }
  }

  function cloneDirectory(
    source: MockDirectory,
    parent: MockDirectory,
    name: string,
  ): MockDirectory {
    const copy = new MockDirectory(parent, name);
    for (const child of source.children.values()) {
      if (child instanceof MockDirectory) {
        copy.children.set(child.name, cloneDirectory(child, copy, child.name));
      } else {
        const file = new MockFile(copy, child.name, child.type);
        file.value = child.value;
        copy.children.set(child.name, file);
      }
    }
    return copy;
  }

  return { Directory: MockDirectory, File: MockFile };
});

import { Directory } from "expo-file-system";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { createExpoWorkspaceAdapter } from "../../../src/workspace/expo-workspace-adapter";
import { LINKED_CAPABILITIES } from "../../../src/workspace/linked-workspace-capabilities";
import type { WorkspaceGrant } from "../../../src/workspace/workspace-adapter";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const grant: WorkspaceGrant = Object.freeze({
  workspaceId: WORKSPACE_ID,
  provider: "android-saf",
  displayName: "Notes",
  locationSummary: "Documents/Notes",
  serializedGrant: "content://provider/tree/notes",
  status: "authorized",
  createdAt: "2026-08-01T00:00:00.000Z",
  lastOpenedAt: null,
});

function path(value: string) {
  const parsed = parseWorkspacePath(value);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

describe("Expo linked-workspace mutations", () => {
  it("renames, recursively copies, and moves entries within the authorized tree", async () => {
    const root = new Directory("content://provider/tree/notes");
    const docs = root.createDirectory("docs");
    const archive = root.createDirectory("archive");
    docs.createFile("readme.md", "text/markdown").write("# Readme");
    const adapter = createExpoWorkspaceAdapter(
      root,
      grant,
      LINKED_CAPABILITIES,
      async (value) => value,
    );

    const renamed = await adapter.rename(path("docs/readme.md"), path("docs/guide.md"));
    const copied = await adapter.copy(path("docs"), path("docs-copy"));
    const moved = await adapter.move(path("docs/guide.md"), path("archive/guide.md"));
    const copiedChildren = await adapter.list(path("docs-copy"));
    const archiveChildren = await adapter.list(path("archive"));

    expect(renamed).toMatchObject({ ok: true, value: { path: "docs/guide.md" } });
    expect(copied).toMatchObject({ ok: true, value: { path: "docs-copy", kind: "directory" } });
    expect(moved).toMatchObject({ ok: true, value: { path: "archive/guide.md" } });
    expect(copiedChildren).toMatchObject({ ok: true, value: [{ path: "docs-copy/guide.md" }] });
    expect(archiveChildren).toMatchObject({ ok: true, value: [{ path: "archive/guide.md" }] });
    expect(archive.name).toBe("archive");
  });

  it("rejects collisions and placing a directory inside itself without mutation", async () => {
    const root = new Directory("content://provider/tree/notes");
    const docs = root.createDirectory("docs");
    docs.createFile("one.md", "text/markdown");
    docs.createFile("two.md", "text/markdown");
    const adapter = createExpoWorkspaceAdapter(
      root,
      grant,
      LINKED_CAPABILITIES,
      async (value) => value,
    );

    const collision = await adapter.rename(path("docs/one.md"), path("docs/two.md"));
    const recursive = await adapter.copy(path("docs"), path("docs/nested"));

    expect(collision).toMatchObject({ ok: false, error: { code: "ALREADY_EXISTS" } });
    expect(recursive).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
    expect(docs.list().map((entry) => entry.name)).toEqual(["one.md", "two.md"]);
  });
});
