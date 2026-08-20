import { describe, expect, it, vi } from "vitest";

import { failure, success } from "../../../src/domain/result";
import {
  createWorkspaceFileShare,
  type WorkspaceShareSource,
} from "../../../src/workspace/workspace-file-share";
import { parseWorkspacePath, type WorkspacePath } from "../../../src/workspace/workspace-path";

function path(input: string): WorkspacePath {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

function source(
  exportFile: WorkspaceShareSource["exportFile"] = vi.fn(async (_path, destination) =>
    success(Object.freeze({ uri: destination.uri, contentType: "text/markdown" })),
  ),
): WorkspaceShareSource {
  return Object.freeze({ exportFile });
}

describe("workspace file share", () => {
  it("exports to a random cache path, shares with MIME metadata, and removes the temporary file", async () => {
    const exportFile = vi.fn(async (_path: WorkspacePath, destination: { uri: string }) =>
      success(Object.freeze({ uri: destination.uri, contentType: "text/markdown" })),
    );
    const share = vi.fn(async () => undefined);
    const remove = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(exportFile),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "random-id",
      isAvailable: async () => true,
      share,
      remove,
      cleanupExpired: vi.fn(async () => undefined),
    });

    const result = await service.share(path("notes/Plan 2026.md"), "Plan 2026.md");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(exportFile).toHaveBeenCalledWith(path("notes/Plan 2026.md"), {
      uri: "file:///cache/inkstone-share-random-id-Plan_2026.md",
    });
    expect(share).toHaveBeenCalledWith("file:///cache/inkstone-share-random-id-Plan_2026.md", {
      dialogTitle: "Share Plan 2026.md",
      mimeType: "text/markdown",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unavailable sharing before exporting", async () => {
    const exportFile = vi.fn();
    const service = createWorkspaceFileShare({
      source: source(exportFile),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => false,
      share: vi.fn(),
      remove: vi.fn(),
      cleanupExpired: vi.fn(async () => undefined),
    });

    const result = await service.share(path("notes.md"), "notes.md");

    expect(result).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
    expect(exportFile).not.toHaveBeenCalled();
  });

  it("preserves source errors and does not call the system panel", async () => {
    const share = vi.fn();
    const remove = vi.fn();
    const service = createWorkspaceFileShare({
      source: source(async () =>
        failure(
          Object.freeze({
            code: "PERMISSION_REVOKED" as const,
            path: "notes.md",
            message: "Workspace access was revoked",
          }),
        ),
      ),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share,
      remove,
      cleanupExpired: vi.fn(async () => undefined),
    });

    const result = await service.share(path("notes.md"), "notes.md");

    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_REVOKED" } });
    expect(share).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("reports system panel failures and still cleans the temporary file", async () => {
    const remove = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share: async () => {
        throw new Error("panel failed");
      },
      remove,
      cleanupExpired: vi.fn(async () => undefined),
    });

    const result = await service.share(path("notes.md"), "notes.md");

    expect(result).toMatchObject({ ok: false, error: { code: "SHARE_FAILED" } });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("rejects an exported URI outside the generated cache target", async () => {
    const share = vi.fn();
    const remove = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(async () =>
        success(Object.freeze({ uri: "content://other/file", contentType: "text/plain" })),
      ),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share,
      remove,
      cleanupExpired: vi.fn(async () => undefined),
    });

    const result = await service.share(path("notes.md"), "notes.md");

    expect(result).toMatchObject({ ok: false, error: { code: "IO_FAILURE" } });
    expect(share).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("file:///cache/inkstone-share-id-notes.md");
  });

  it("uses a safe generic MIME type when provider metadata is invalid", async () => {
    const share = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(async (_path, destination) =>
        success(Object.freeze({ uri: destination.uri, contentType: "bad\r\ntype" })),
      ),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share,
      remove: vi.fn(async () => undefined),
      cleanupExpired: vi.fn(async () => undefined),
    });

    await service.share(path("asset.bin"), "asset.bin");

    expect(share).toHaveBeenCalledWith(expect.any(String), {
      dialogTitle: "Share asset.bin",
      mimeType: "application/octet-stream",
    });
  });

  it("sanitizes control characters in the system dialog title", async () => {
    const share = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share,
      remove: vi.fn(async () => undefined),
      cleanupExpired: vi.fn(async () => undefined),
    });

    await service.share(path("safe.md"), "bad\r\nname.md");

    expect(share).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dialogTitle: "Share bad name.md" }),
    );
  });

  it("retains a successfully shared file even when expired-cache cleanup fails", async () => {
    const share = vi.fn(async () => undefined);
    const service = createWorkspaceFileShare({
      source: source(),
      cacheDirectoryUri: "file:///cache/",
      createId: () => "id",
      isAvailable: async () => true,
      share,
      remove: vi.fn(async () => undefined),
      cleanupExpired: async () => {
        throw new Error("cleanup failed");
      },
    });

    const result = await service.share(path("notes.md"), "notes.md");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(share).toHaveBeenCalledOnce();
  });

  it("rejects invalid cache configuration and generated identities", async () => {
    const options = {
      source: source(),
      createId: () => "../escape",
      isAvailable: async () => true,
      share: vi.fn(),
      remove: vi.fn(),
      cleanupExpired: vi.fn(async () => undefined),
    };

    expect(() =>
      createWorkspaceFileShare({ ...options, cacheDirectoryUri: "content://cache" }),
    ).toThrow(/cache/i);
    const service = createWorkspaceFileShare({ ...options, cacheDirectoryUri: "file:///cache/" });
    await expect(service.share(path("notes.md"), "notes.md")).resolves.toMatchObject({
      ok: false,
      error: { code: "IO_FAILURE", message: expect.stringMatching(/identity/i) },
    });
  });
});
