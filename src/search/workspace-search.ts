import type { WorkspaceId } from "../domain/identifiers";
import type { FileActivityStore } from "../app/file-activity-store";
import type { Phase6Store, SearchQueryRecord } from "../phase6/phase6-store";
import type { WorkspaceRepository } from "../workspace/workspace-repository";
import type { SearchIndex, SearchResponse, SearchResult, SearchScope } from "./search-index";

export type WorkspaceSearch = Readonly<{
  search(query: string, scope: SearchScope, limit?: number): Promise<SearchResponse>;
  recentQueries(limit?: number): Promise<readonly SearchQueryRecord[]>;
  clearRecentQueries(): Promise<void>;
}>;

export function createWorkspaceSearch(
  index: SearchIndex,
  activity: FileActivityStore,
  repository: WorkspaceRepository,
  workspaceId: WorkspaceId,
  store?: Phase6Store,
): WorkspaceSearch {
  return Object.freeze({
    async search(query: string, scope: SearchScope, limit = 50) {
      if (query.trim() && store) {
        try {
          await store.recordSearchQuery(
            workspaceId,
            Object.freeze({ query: query.trim(), scope, searchedAt: new Date().toISOString() }),
          );
        } catch {
          // Query history is optional metadata and must not make workspace search unavailable.
        }
      }
      const indexed = await index.search(workspaceId, query, scope, limit);
      if (scope !== "all" || query.trim().length === 0) return indexed;
      const [loadedActivity, listed] = await Promise.all([activity.load(), repository.list()]);
      if (!loadedActivity.ok || !listed.ok) return indexed;
      const normalized = query.toLocaleLowerCase();
      const recent: SearchResult[] = loadedActivity.value.recent.flatMap((item) => {
        if (!item.path.toLocaleLowerCase().includes(normalized)) return [];
        const document = listed.value.find((candidate) => candidate.path === item.path);
        if (!document) return [];
        return [
          Object.freeze({
            id: `recent:${document.documentId}`,
            kind: "recent" as const,
            documentId: document.documentId,
            path: item.path,
            title: item.path,
            snippet: "Recently opened",
            line: null,
            timestamp: item.openedAt,
          }),
        ];
      });
      return Object.freeze({
        ...indexed,
        results: Object.freeze([...indexed.results, ...recent].slice(0, limit)),
      });
    },
    async recentQueries(limit = 20) {
      if (!store) return Object.freeze([]);
      try {
        return await store.listSearchQueries(workspaceId, limit);
      } catch {
        return Object.freeze([]);
      }
    },
    async clearRecentQueries() {
      if (store) {
        try {
          await store.clearSearchQueries(workspaceId);
        } catch {
          // Clearing optional query history cannot affect indexed search.
        }
      }
    },
  });
}
