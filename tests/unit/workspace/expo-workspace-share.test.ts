import { beforeEach, describe, expect, it, vi } from "vitest";

const fileSystem = vi.hoisted(() => {
  class FakeFile {
    readonly copy = vi.fn(async (_destination: { uri: string }) => undefined);
    readonly text = vi.fn(async () => "must not be read");
    readonly name: string;
    readonly uri: string;
    readonly type: string;
    readonly size = 24;
    readonly lastModified = 1_754_006_400_000;

    constructor(uri: string) {
      this.uri = uri;
      this.name = uri.split("/").at(-1) ?? uri;
      this.type = uri.endsWith(".png") ? "image/png" : "application/octet-stream";
    }

    info() {
      return { exists: true, uri: this.uri, size: this.size, modificationTime: this.lastModified };
    }
  }

  class FakeDirectory {
    children: readonly (FakeDirectory | FakeFile)[] = Object.freeze([]);
    readonly name: string;
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
      this.name = uri.split("/").at(-1) ?? uri;
    }

    list() {
      return [...this.children];
    }

    info() {
      return { exists: true, uri: this.uri };
    }
  }

  return { FakeFile, FakeDirectory };
});

vi.mock("expo-file-system", () => ({
  File: fileSystem.FakeFile,
  Directory: fileSystem.FakeDirectory,
}));

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { createExpoWorkspaceAdapter } from "../../../src/workspace/expo-workspace-adapter";
import { LINKED_CAPABILITIES } from "../../../src/workspace/linked-workspace-capabilities";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

function grant() {
  return Object.freeze({
    workspaceId: WORKSPACE_ID,
    provider: "android-saf" as const,
    displayName: "Notes",
    locationSummary: "Notes",
    serializedGrant: "content://provider/tree/notes",
    status: "authorized" as const,
    createdAt: "2026-08-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
  });
}

describe("Expo linked workspace sharing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies binary content from the authorized tree to local cache without decoding it", async () => {
    const root = new fileSystem.FakeDirectory("content://provider/tree/notes");
    const images = new fileSystem.FakeDirectory("content://provider/tree/notes/images");
    const image = new fileSystem.FakeFile("content://provider/tree/notes/images/photo.png");
    images.children = Object.freeze([image]);
    root.children = Object.freeze([images]);
    const adapter = createExpoWorkspaceAdapter(
      root as never,
      grant(),
      LINKED_CAPABILITIES,
      vi.fn(async () => "hash"),
    );
    const target = parseWorkspacePath("images/photo.png");
    if (!target.ok) throw new Error("Invalid test path");

    const result = await adapter.exportFile(target.value, "file:///cache/random-photo.png");

    expect(result).toEqual({
      ok: true,
      value: { uri: "file:///cache/random-photo.png", contentType: "image/png" },
    });
    expect(image.copy).toHaveBeenCalledOnce();
    expect(image.copy.mock.calls[0]?.[0]).toMatchObject({ uri: "file:///cache/random-photo.png" });
    expect(image.text).not.toHaveBeenCalled();
  });

  it("rejects directories and non-local destinations before copying", async () => {
    const root = new fileSystem.FakeDirectory("content://provider/tree/notes");
    const folder = new fileSystem.FakeDirectory("content://provider/tree/notes/images");
    root.children = Object.freeze([folder]);
    const adapter = createExpoWorkspaceAdapter(
      root as never,
      grant(),
      LINKED_CAPABILITIES,
      vi.fn(async () => "hash"),
    );
    const target = parseWorkspacePath("images");
    if (!target.ok) throw new Error("Invalid test path");

    const directory = await adapter.exportFile(target.value, "file:///cache/images");
    const externalTarget = await adapter.exportFile(target.value, "content://other/cache");

    expect(directory).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(externalTarget).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
  });
});
