export const SHARE_CACHE_PREFIX = "inkstone-share-";
export const SHARE_CACHE_RETENTION_MS = 24 * 60 * 60 * 1_000;

export type ShareCacheEntry = Readonly<{
  kind: "file" | "directory";
  name: string;
  lastModified: number | null;
  delete: () => void;
}>;

export function cleanupExpiredShareCache(entries: readonly ShareCacheEntry[], now: number): void {
  const cutoff = now - SHARE_CACHE_RETENTION_MS;
  for (const entry of entries) {
    if (
      entry.kind === "file" &&
      entry.name.startsWith(SHARE_CACHE_PREFIX) &&
      entry.lastModified !== null &&
      entry.lastModified <= cutoff
    ) {
      entry.delete();
    }
  }
}
