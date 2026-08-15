import { describe, expect, it, vi } from "vitest";

import type { DocumentId } from "../../../src/domain/identifiers";
import { failure, success } from "../../../src/domain/result";
import {
  createAdapterShareSource,
  createRepositoryShareSource,
} from "../../../src/workspace/workspace-share-source";
import { parseWorkspacePath, type WorkspacePath } from "../../../src/workspace/workspace-path";
import type { WorkspaceRepository } from "../../../src/workspace/workspace-repository";
import type { WorkspaceAdapterError } from "../../../src/workspace/workspace-adapter";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;

function path(input: string): WorkspacePath {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

describe("workspace share sources", () => {
  it("writes a verified managed document to the temporary destination", async () => {
    const read = vi.fn(async () =>
      success(
        Object.freeze({
          documentId: DOCUMENT_ID,
          path: path("notes.md"),
          markdown: "# Notes\n",
          contentHash: "hash:notes",
        }),
      ),
    );
    const repository = Object.freeze({ read }) as unknown as WorkspaceRepository;
    const writeText = vi.fn(async () => undefined);
    const source = createRepositoryShareSource(repository, writeText);

    const result = await source.exportFile(path("notes.md"), { uri: "file:///cache/notes.md" });

    expect(result).toEqual({
      ok: true,
      value: { uri: "file:///cache/notes.md", contentType: "text/markdown" },
    });
    expect(writeText).toHaveBeenCalledWith("file:///cache/notes.md", "# Notes\n");
  });

  it("maps managed read and cache write failures explicitly", async () => {
    const missing = createRepositoryShareSource(
      Object.freeze({
        read: async () =>
          failure(Object.freeze({ code: "NOT_FOUND" as const, path: "missing.md" })),
      }) as unknown as WorkspaceRepository,
      vi.fn(),
    );
    const writeFailure = createRepositoryShareSource(
      Object.freeze({
        read: async () =>
          success(
            Object.freeze({
              documentId: DOCUMENT_ID,
              path: path("notes.md"),
              markdown: "notes",
              contentHash: "hash",
            }),
          ),
      }) as unknown as WorkspaceRepository,
      async () => {
        throw new Error("disk full");
      },
    );

    await expect(
      missing.exportFile(path("missing.md"), { uri: "file:///cache/file" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    await expect(
      writeFailure.exportFile(path("notes.md"), { uri: "file:///cache/file" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "IO_FAILURE" },
    });
  });

  it("copies a linked binary file directly to cache without reading its body", async () => {
    const copyFile = vi.fn(async () =>
      success(Object.freeze({ uri: "file:///cache/image.png", contentType: "image/png" })),
    ) as unknown as (
      path: WorkspacePath,
      destinationUri: string,
    ) => Promise<
      | ReturnType<typeof success<{ uri: string; contentType: string }>>
      | { ok: false; error: WorkspaceAdapterError }
    >;
    const source = createAdapterShareSource(copyFile);

    const result = await source.exportFile(path("images/image.png"), {
      uri: "file:///cache/image.png",
    });

    expect(result).toEqual({
      ok: true,
      value: { uri: "file:///cache/image.png", contentType: "image/png" },
    });
    expect(copyFile).toHaveBeenCalledWith(path("images/image.png"), "file:///cache/image.png");
  });
});
