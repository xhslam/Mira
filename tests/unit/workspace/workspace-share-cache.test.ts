import { describe, expect, it, vi } from "vitest";

import {
  SHARE_CACHE_PREFIX,
  SHARE_CACHE_RETENTION_MS,
  cleanupExpiredShareCache,
} from "../../../src/workspace/workspace-share-cache";

describe("workspace share cache", () => {
  it("removes only expired generated share files", () => {
    const now = 1_000_000_000;
    const expiredDelete = vi.fn();
    const freshDelete = vi.fn();
    const unrelatedDelete = vi.fn();
    const unknownTimeDelete = vi.fn();
    const entries = Object.freeze([
      Object.freeze({
        kind: "file" as const,
        name: `${SHARE_CACHE_PREFIX}old-note.md`,
        lastModified: now - SHARE_CACHE_RETENTION_MS - 1,
        delete: expiredDelete,
      }),
      Object.freeze({
        kind: "file" as const,
        name: `${SHARE_CACHE_PREFIX}fresh-note.md`,
        lastModified: now - SHARE_CACHE_RETENTION_MS + 1,
        delete: freshDelete,
      }),
      Object.freeze({
        kind: "file" as const,
        name: "other-cache-file",
        lastModified: 0,
        delete: unrelatedDelete,
      }),
      Object.freeze({
        kind: "file" as const,
        name: `${SHARE_CACHE_PREFIX}unknown.md`,
        lastModified: null,
        delete: unknownTimeDelete,
      }),
      Object.freeze({
        kind: "directory" as const,
        name: `${SHARE_CACHE_PREFIX}folder`,
        lastModified: 0,
        delete: vi.fn(),
      }),
    ]);

    cleanupExpiredShareCache(entries, now);

    expect(expiredDelete).toHaveBeenCalledOnce();
    expect(freshDelete).not.toHaveBeenCalled();
    expect(unrelatedDelete).not.toHaveBeenCalled();
    expect(unknownTimeDelete).not.toHaveBeenCalled();
  });
});
