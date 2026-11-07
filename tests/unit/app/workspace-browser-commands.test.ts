import { describe, expect, it, vi } from "vitest";

import { browserCommandSuccess } from "../../../src/app/browser-command";
import { useWorkspaceBrowserCommands } from "../../../src/app/use-workspace-browser-commands";
import { createWorkspaceState } from "../../../src/app/workspace-state";
import type { DocumentId, SessionId } from "../../../src/domain/identifiers";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";
import { createRepositoryWorkspaceBrowser } from "../../../src/workspace/workspace-browser";
import type { FileEntry } from "../../../src/workspace/workspace-adapter";

vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));

function setup() {
  const blankDocumentId = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
  const state = createWorkspaceState({
    documents: [],
    recoveryDrafts: [],
    sessionId: "test-session" as SessionId,
    blankDocumentId,
  });
  const repository = createMemoryWorkspaceRepository({
    capabilities: { atomicReplace: true, persistedExternalGrants: false },
    createId: () => "123e4567-e89b-42d3-a456-426614174002" as DocumentId,
    hashMarkdown: async (markdown) => `hash:${markdown}`,
  });
  const browser = createRepositoryWorkspaceBrowser(repository);
  const reloadWorkspace = vi.fn(async () => browserCommandSuccess());
  const onPathMoved = vi.fn(async () => undefined);
  const commands = useWorkspaceBrowserCommands({
    services: { browser },
    getState: () => state,
    prepareWorkspaceSwitch: async () => true,
    saveWithSource: async () => undefined,
    reloadWorkspace,
    refreshBrowser: async () => undefined,
    onPathMoved,
    onPathRemoved: async () => undefined,
  });
  const entry: FileEntry = {
    path: "Untitled.md" as FileEntry["path"],
    name: "Untitled.md",
    kind: "file",
    size: null,
    modifiedAt: null,
    contentType: null,
  };
  return { commands, blankDocumentId, entry, repository, reloadWorkspace, onPathMoved };
}

describe("workspace rename command", () => {
  it("creates a blank note at the requested name without a placeholder file", async () => {
    const { commands, blankDocumentId, entry, repository, reloadWorkspace, onPathMoved } = setup();
    await expect(
      commands.renameBrowserEntry(entry, "Named.md", "fail", blankDocumentId),
    ).resolves.toMatchObject({ ok: true });
    await expect(repository.read("Named.md")).resolves.toMatchObject({
      ok: true,
      value: { markdown: "" },
    });
    await expect(repository.read("Untitled.md")).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(reloadWorkspace).toHaveBeenCalledWith(undefined, undefined, {
      from: "Untitled.md",
      to: "Named.md",
    });
    expect(onPathMoved).not.toHaveBeenCalled();
  });

  it("keeps an existing file and the draft safe if the requested name is occupied", async () => {
    const { commands, blankDocumentId, entry, repository, reloadWorkspace } = setup();
    await repository.create({ path: "Named.md" as FileEntry["path"], markdown: "existing" });
    await expect(
      commands.renameBrowserEntry(entry, "Named.md", "fail", blankDocumentId),
    ).resolves.toMatchObject({ ok: false, errorCode: "ALREADY_EXISTS" });
    await expect(repository.read("Named.md")).resolves.toMatchObject({
      ok: true,
      value: { markdown: "existing" },
    });
    expect(reloadWorkspace).not.toHaveBeenCalled();
  });
});
