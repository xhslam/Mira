import { describe, expect, test, vi } from "vitest";

import { createAiWorkspaceToolRuntime } from "../../../src/ai/workspace-tool-runtime";
import type { DocumentId } from "../../../src/domain/identifiers";
import { success } from "../../../src/domain/result";

const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000" as DocumentId;
const RESULT_ID = "223e4567-e89b-42d3-a456-426614174000";

function createRuntime(allowWholeWorkspaceSearch: boolean) {
  const repository = {
    read: vi.fn(async (path: string) =>
      success({ documentId: DOCUMENT_ID, path, markdown: `content:${path}`, contentHash: "hash" }),
    ),
  };
  const search = {
    search: vi.fn(async () => ({
      query: "roadmap",
      indexState: "ready" as const,
      results: [
        {
          id: "index-result",
          kind: "content" as const,
          documentId: DOCUMENT_ID,
          path: "plans/roadmap.md",
          title: "Roadmap",
          snippet: "matched excerpt",
          line: 4,
          timestamp: null,
        },
      ],
    })),
  };
  return {
    repository,
    search,
    runtime: createAiWorkspaceToolRuntime({
      repository: repository as never,
      search: search as never,
      allowWholeWorkspaceSearch,
      authorizedPaths: ["current.md", "manual.md"],
      createId: () => RESULT_ID,
    }),
  };
}

describe("AI workspace tool runtime", () => {
  test("does not expose or execute whole-workspace search without permission", async () => {
    const { runtime, search } = createRuntime(false);

    expect(runtime.definitions.map((tool) => tool.name)).toEqual(["read_note"]);
    await expect(
      runtime.execute({ id: "call", name: "search_workspace", argumentsJson: '{"query":"x"}' }),
    ).resolves.toMatchObject({
      ok: false,
      content: expect.stringContaining("PERMISSION_REQUIRED"),
    });
    expect(search.search).not.toHaveBeenCalled();
  });

  test("reads only the current note and notes manually selected by the user", async () => {
    const { runtime, repository } = createRuntime(false);

    expect(
      await runtime.execute({
        id: "allowed",
        name: "read_note",
        argumentsJson: '{"path":"manual.md"}',
      }),
    ).toMatchObject({ ok: true });
    expect(
      await runtime.execute({
        id: "denied",
        name: "read_note",
        argumentsJson: '{"path":"private.md"}',
      }),
    ).toMatchObject({ ok: false, content: expect.stringContaining("NOTE_NOT_AUTHORIZED") });
    expect(repository.read).toHaveBeenCalledTimes(1);
  });

  test("grants a search result only for the lifetime of one runtime", async () => {
    const first = createRuntime(true);
    const searchResult = await first.runtime.execute({
      id: "search",
      name: "search_workspace",
      argumentsJson: '{"query":"roadmap"}',
    });
    expect(searchResult).toMatchObject({ ok: true });
    expect(JSON.parse(searchResult.content)).toMatchObject({
      results: [{ resultId: RESULT_ID, path: "plans/roadmap.md" }],
    });
    expect(
      await first.runtime.execute({
        id: "read",
        name: "read_note",
        argumentsJson: JSON.stringify({ resultId: RESULT_ID }),
      }),
    ).toMatchObject({ ok: true });

    const second = createRuntime(true);
    expect(
      await second.runtime.execute({
        id: "read-again",
        name: "read_note",
        argumentsJson: JSON.stringify({ resultId: RESULT_ID }),
      }),
    ).toMatchObject({ ok: false, content: expect.stringContaining("NOTE_NOT_AUTHORIZED") });
    expect(second.repository.read).not.toHaveBeenCalled();
  });

  test("rejects a search grant when the document identity changed", async () => {
    const { runtime, repository } = createRuntime(true);
    await runtime.execute({
      id: "search",
      name: "search_workspace",
      argumentsJson: '{"query":"roadmap"}',
    });
    repository.read.mockResolvedValueOnce(
      success({
        documentId: "323e4567-e89b-42d3-a456-426614174000" as DocumentId,
        path: "plans/roadmap.md",
        markdown: "replacement",
        contentHash: "new-hash",
      }),
    );

    await expect(
      runtime.execute({
        id: "read",
        name: "read_note",
        argumentsJson: JSON.stringify({ resultId: RESULT_ID }),
      }),
    ).resolves.toMatchObject({ ok: false, content: expect.stringContaining("RESULT_STALE") });
  });

  test("turns a requested write into a review proposal without writing the repository", async () => {
    const { repository, search } = createRuntime(false);
    const createReplaceProposal = vi.fn(async () => RESULT_ID);
    const runtime = createAiWorkspaceToolRuntime({
      repository: repository as never,
      search: search as never,
      allowWholeWorkspaceSearch: false,
      authorizedPaths: ["current.md"],
      createId: () => RESULT_ID,
      writableNotes: [
        {
          path: "current.md",
          baseRevision: "editor:document:3",
          baseHash: "hash",
          baseContent: "before",
        },
      ],
      createReplaceProposal,
    });

    expect(runtime.definitions.map((tool) => tool.name)).toContain("propose_note_update");
    const toolResult = await runtime.execute({
      id: "propose",
      name: "propose_note_update",
      argumentsJson: JSON.stringify({
        path: "current.md",
        content: "after",
        explanation: "Improve clarity",
      }),
    });

    expect(toolResult).toMatchObject({ ok: true, audit: { resultCode: "proposal-created" } });
    expect(JSON.parse(toolResult.content)).toMatchObject({
      proposalId: RESULT_ID,
      state: "pending_review",
    });
    expect(createReplaceProposal).toHaveBeenCalledWith(
      expect.objectContaining({ baseContent: "before", content: "after" }),
    );
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository).not.toHaveProperty("writeVerified");
  });
});
