import { describe, expect, it } from "vitest";

import type { WorkspaceAdapter } from "../../../src/workspace/workspace-adapter";
import { parseWorkspaceCommand } from "../../../src/workspace/workspace-commands";
import { executeWorkspaceCommand } from "../../../src/workspace/workspace-commands";

function createReadOnlyAdapter(): WorkspaceAdapter {
  const unsupported = async () => {
    throw new Error("must not be called");
  };
  return Object.freeze({
    grant: Object.freeze({
      workspaceId: "123e4567-e89b-42d3-a456-426614174000",
      provider: "managed",
      displayName: "Read-only",
      locationSummary: "test",
      serializedGrant: "managed://test",
      status: "authorized",
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: null,
    }),
    capabilities: Object.freeze({
      read: true,
      write: false,
      atomicReplace: false,
      create: false,
      rename: false,
      move: false,
      copy: false,
      remove: false,
      trash: false,
      watch: false,
      share: false,
    }),
    list: unsupported,
    stat: unsupported,
    readText: unsupported,
    writeTextAtomic: unsupported,
    createFile: unsupported,
    createDirectory: unsupported,
    rename: unsupported,
    move: unsupported,
    copy: unsupported,
    remove: unsupported,
    exportFile: unsupported,
  }) as unknown as WorkspaceAdapter;
}

describe("workspace commands", () => {
  it("accepts a typed write command and freezes it", () => {
    const result = parseWorkspaceCommand({
      type: "write-text",
      path: "notes/today.md",
      content: "# Today",
      expectedRevision: "rev-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        type: "write-text",
        path: "notes/today.md",
        content: "# Today",
        expectedRevision: "rev-1",
      },
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("rejects unknown fields at the command boundary", () => {
    const result = parseWorkspaceCommand({
      type: "remove",
      path: "notes/today.md",
      mode: "permanent",
      extra: "ignored?",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_COMMAND", message: "Invalid workspace command" },
    });
  });

  it("rejects absolute and traversal paths", () => {
    const absolute = parseWorkspaceCommand({
      type: "create-file",
      path: "/tmp/escape.md",
      content: "bad",
    });
    const traversal = parseWorkspaceCommand({
      type: "rename",
      from: "notes/today.md",
      to: "../escape.md",
    });

    expect(absolute).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
    expect(traversal).toMatchObject({ ok: false, error: { code: "INVALID_PATH" } });
  });

  it("returns an explicit unsupported result before invoking a provider operation", async () => {
    const result = await executeWorkspaceCommand(createReadOnlyAdapter(), {
      type: "write-text",
      path: "notes/today.md",
      content: "blocked",
      expectedRevision: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED", path: "notes/today.md" },
    });
  });
});
