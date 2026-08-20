import { describe, expect, test, vi } from "vitest";

import type { DocumentId, WorkspaceId } from "../../../src/domain/identifiers";
import { success } from "../../../src/domain/result";
import type { SearchIndex } from "../../../src/search/search-index";
import { createWorkspaceSearch } from "../../../src/search/workspace-search";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;
const DOCUMENT_ID = "223e4567-e89b-42d3-a456-426614174000" as DocumentId;

describe("workspace search", () => {
  test("adds matching recent activity without exposing file content", async () => {
    const index = {
      search: vi.fn(async () => ({ query: "plan", results: [], indexState: "ready" })),
    } as unknown as SearchIndex;
    const activity = {
      load: vi.fn(async () =>
        success({
          version: 1,
          recent: [{ path: "plan.md", openedAt: "2026-08-01T00:00:00.000Z" }],
          favorites: [],
        }),
      ),
    } as never;
    const repository = {
      list: vi.fn(async () =>
        success([
          { documentId: DOCUMENT_ID, path: "plan.md", markdown: "secret", contentHash: "hash" },
        ]),
      ),
    } as never;

    const result = await createWorkspaceSearch(index, activity, repository, WORKSPACE_ID).search(
      "plan",
      "all",
    );

    expect(result.results).toEqual([expect.objectContaining({ kind: "recent", path: "plan.md" })]);
    expect(result.results[0]).not.toHaveProperty("content");
  });

  test("records, lists, and clears local query history", async () => {
    const index = {
      search: vi.fn(async () => ({ query: "plan", results: [], indexState: "ready" })),
    } as unknown as SearchIndex;
    const recordSearchQuery = vi.fn();
    const clearSearchQueries = vi.fn();
    const store = {
      recordSearchQuery,
      listSearchQueries: vi.fn(async () => [
        { query: "plan", scope: "all", searchedAt: "2026-08-01T00:00:00.000Z" },
      ]),
      clearSearchQueries,
    } as never;
    const activity = {
      load: vi.fn(async () => success({ version: 1, recent: [], favorites: [] })),
    } as never;
    const repository = { list: vi.fn(async () => success([])) } as never;
    const search = createWorkspaceSearch(index, activity, repository, WORKSPACE_ID, store);

    await search.search("plan", "all");
    expect(await search.recentQueries()).toHaveLength(1);
    await search.clearRecentQueries();
    expect(recordSearchQuery).toHaveBeenCalledOnce();
    expect(clearSearchQueries).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  test("keeps searching when optional query history persistence fails", async () => {
    const index = {
      search: vi.fn(async () => ({ query: "plan", results: [], indexState: "ready" })),
    } as unknown as SearchIndex;
    const store = {
      recordSearchQuery: vi.fn(async () => {
        throw new Error("disk full");
      }),
    } as never;
    const activity = {
      load: vi.fn(async () => success({ version: 1, recent: [], favorites: [] })),
    } as never;
    const repository = { list: vi.fn(async () => success([])) } as never;

    await expect(
      createWorkspaceSearch(index, activity, repository, WORKSPACE_ID, store).search("plan", "all"),
    ).resolves.toMatchObject({ query: "plan" });
  });
});
