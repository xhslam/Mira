import { describe, expect, it, vi } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import { parseDocumentId } from "../../../src/domain/identifiers";
import { deriveWorkspaceDocumentId } from "../../../src/workspace/workspace-document-id";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const OTHER_WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174001" as WorkspaceId;
const DIGEST = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function workspacePath(input: string) {
  const parsed = parseWorkspacePath(input);
  if (!parsed.ok) throw new Error("Invalid test path");
  return parsed.value;
}

describe("workspace document identity", () => {
  it("derives a stable version-5 UUID from the workspace and normalized path", async () => {
    const digest = vi.fn(async () => DIGEST);

    const first = await deriveWorkspaceDocumentId(
      WORKSPACE_ID,
      workspacePath("docs/readme.md"),
      digest,
    );
    const second = await deriveWorkspaceDocumentId(
      WORKSPACE_ID,
      workspacePath("docs/readme.md"),
      digest,
    );

    expect(first).toBe("01234567-89ab-5def-8123-456789abcdef");
    expect(second).toBe(first);
    expect(parseDocumentId(first).ok).toBe(true);
    expect(digest).toHaveBeenCalledWith(
      '["123e4567-e89b-42d3-a456-426614174000","docs/readme.md"]',
    );
  });

  it("passes different workspace and path identities to the digest boundary", async () => {
    const digest = vi.fn(async (input: string) =>
      input.includes(OTHER_WORKSPACE_ID) ? `f${DIGEST.slice(1)}` : DIGEST,
    );

    const first = await deriveWorkspaceDocumentId(WORKSPACE_ID, workspacePath("one.md"), digest);
    const second = await deriveWorkspaceDocumentId(
      OTHER_WORKSPACE_ID,
      workspacePath("two.md"),
      digest,
    );

    expect(first).not.toBe(second);
    expect(digest).toHaveBeenCalledTimes(2);
  });

  it("accepts uppercase hexadecimal digests and normalizes the UUID", async () => {
    const result = await deriveWorkspaceDocumentId(
      WORKSPACE_ID,
      workspacePath("readme.md"),
      async () => DIGEST.toUpperCase(),
    );

    expect(result).toBe("01234567-89ab-5def-8123-456789abcdef");
  });

  it.each(["", "not-hex", DIGEST.slice(1), `${DIGEST}00`])(
    "rejects an invalid digest result: %s",
    async (invalidDigest) => {
      await expect(
        deriveWorkspaceDocumentId(
          WORKSPACE_ID,
          workspacePath("readme.md"),
          async () => invalidDigest,
        ),
      ).rejects.toThrow("invalid SHA-256 digest");
    },
  );
});
