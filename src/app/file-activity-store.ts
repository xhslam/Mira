import { z } from "zod";

import type { WorkspaceId } from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import type { VaultStorage } from "../workspace/vault-storage";
import { parseWorkspacePath, type WorkspacePath } from "../workspace/workspace-path";

export const FILE_ACTIVITY_RECENT_LIMIT = 50;

export type RecentFileActivity = Readonly<{
  path: WorkspacePath;
  openedAt: string;
}>;

export type FileActivity = Readonly<{
  version: 1;
  recent: readonly RecentFileActivity[];
  favorites: readonly WorkspacePath[];
}>;

export type FileActivityError = Readonly<{
  code: "INVALID_DATA" | "INVALID_PATH" | "IO_FAILURE";
  message: string;
}>;

export type FileActivityStore = Readonly<{
  load(): Promise<Result<FileActivity, FileActivityError>>;
  recordOpened(path: string, openedAt: string): Promise<Result<FileActivity, FileActivityError>>;
  setFavorite(path: string, favorite: boolean): Promise<Result<FileActivity, FileActivityError>>;
  movePath(from: string, to: string): Promise<Result<FileActivity, FileActivityError>>;
  removePath(path: string): Promise<Result<FileActivity, FileActivityError>>;
}>;

const recentFileSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    openedAt: z.string().datetime(),
  })
  .strict();
const fileActivitySchema = z
  .object({
    version: z.literal(1),
    recent: z.array(recentFileSchema).max(FILE_ACTIVITY_RECENT_LIMIT),
    favorites: z.array(z.string().min(1).max(4_096)).max(10_000),
  })
  .strict();

export const EMPTY_FILE_ACTIVITY: FileActivity = Object.freeze({
  version: 1,
  recent: Object.freeze([]),
  favorites: Object.freeze([]),
});

function activityError(
  code: FileActivityError["code"],
  message: string,
): Result<never, FileActivityError> {
  return failure(Object.freeze({ code, message }));
}

function freezeActivity(activity: FileActivity): FileActivity {
  return Object.freeze({
    version: 1,
    recent: Object.freeze(activity.recent.map((item) => Object.freeze({ ...item }))),
    favorites: Object.freeze([...activity.favorites]),
  });
}

function parsePath(input: string): Result<WorkspacePath, FileActivityError> {
  const parsed = parseWorkspacePath(input);
  return parsed.ok
    ? success(parsed.value)
    : activityError("INVALID_PATH", "File activity contains an invalid workspace path");
}

function parseActivity(input: unknown): Result<FileActivity, FileActivityError> {
  const parsed = fileActivitySchema.safeParse(input);
  if (!parsed.success) return activityError("INVALID_DATA", "File activity data is invalid");
  const recent: RecentFileActivity[] = [];
  for (const item of parsed.data.recent) {
    const path = parsePath(item.path);
    if (!path.ok) return activityError("INVALID_DATA", "Recent file activity has an invalid path");
    recent.push(Object.freeze({ path: path.value, openedAt: item.openedAt }));
  }
  const favorites: WorkspacePath[] = [];
  for (const item of parsed.data.favorites) {
    const path = parsePath(item);
    if (!path.ok)
      return activityError("INVALID_DATA", "Favorite file activity has an invalid path");
    if (!favorites.includes(path.value)) favorites.push(path.value);
  }
  return success(freezeActivity({ version: 1, recent, favorites }));
}

function pathWithin(path: WorkspacePath, root: WorkspacePath): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function translatedPath(
  path: WorkspacePath,
  from: WorkspacePath,
  to: WorkspacePath,
): WorkspacePath {
  if (path === from) return to;
  const parsed = parseWorkspacePath(`${to}${path.slice(from.length)}`);
  if (!parsed.ok) throw new Error("Translated file activity path is invalid");
  return parsed.value;
}

function uniqueRecent(items: readonly RecentFileActivity[]): readonly RecentFileActivity[] {
  return items.filter(
    (item, index) => items.findIndex((candidate) => candidate.path === item.path) === index,
  );
}

function uniquePaths(items: readonly WorkspacePath[]): readonly WorkspacePath[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

export function createFileActivityStore(
  storage: VaultStorage,
  workspaceId: WorkspaceId,
): FileActivityStore {
  const storagePath = `workspace-state/${workspaceId}/file-activity.json`;
  let pending: Promise<void> = Promise.resolve();

  async function loadCurrent(): Promise<Result<FileActivity, FileActivityError>> {
    let raw: string | null;
    try {
      raw = await storage.read(storagePath);
    } catch {
      return activityError("IO_FAILURE", "File activity could not be read");
    }
    if (raw === null) return success(EMPTY_FILE_ACTIVITY);
    try {
      return parseActivity(JSON.parse(raw) as unknown);
    } catch {
      return activityError("INVALID_DATA", "File activity is not valid JSON");
    }
  }

  function update(
    transform: (current: FileActivity) => FileActivity,
  ): Promise<Result<FileActivity, FileActivityError>> {
    const operation = pending.then(async () => {
      const loaded = await loadCurrent();
      if (!loaded.ok) return loaded;
      const next = freezeActivity(transform(loaded.value));
      try {
        await storage.write(storagePath, JSON.stringify(next));
        return success(next);
      } catch {
        return activityError("IO_FAILURE", "File activity could not be saved");
      }
    });
    pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  return Object.freeze({
    async load() {
      await pending;
      return loadCurrent();
    },
    async recordOpened(path, openedAt) {
      const parsedPath = parsePath(path);
      if (!parsedPath.ok) return parsedPath;
      if (Number.isNaN(Date.parse(openedAt))) {
        return activityError("INVALID_DATA", "Recent file activity has an invalid timestamp");
      }
      return update((current) => ({
        ...current,
        recent: [
          { path: parsedPath.value, openedAt: new Date(openedAt).toISOString() },
          ...current.recent.filter((item) => item.path !== parsedPath.value),
        ].slice(0, FILE_ACTIVITY_RECENT_LIMIT),
      }));
    },
    async setFavorite(path, favorite) {
      const parsedPath = parsePath(path);
      if (!parsedPath.ok) return parsedPath;
      return update((current) => ({
        ...current,
        favorites: favorite
          ? current.favorites.includes(parsedPath.value)
            ? current.favorites
            : [...current.favorites, parsedPath.value]
          : current.favorites.filter((item) => item !== parsedPath.value),
      }));
    },
    async movePath(from, to) {
      const source = parsePath(from);
      if (!source.ok) return source;
      const destination = parsePath(to);
      if (!destination.ok) return destination;
      return update((current) => ({
        ...current,
        recent: uniqueRecent(
          current.recent.map((item) =>
            pathWithin(item.path, source.value)
              ? { ...item, path: translatedPath(item.path, source.value, destination.value) }
              : item,
          ),
        ),
        favorites: uniquePaths(
          current.favorites.map((item) =>
            pathWithin(item, source.value)
              ? translatedPath(item, source.value, destination.value)
              : item,
          ),
        ),
      }));
    },
    async removePath(path) {
      const parsedPath = parsePath(path);
      if (!parsedPath.ok) return parsedPath;
      return update((current) => ({
        ...current,
        recent: current.recent.filter((item) => !pathWithin(item.path, parsedPath.value)),
        favorites: current.favorites.filter((item) => !pathWithin(item, parsedPath.value)),
      }));
    },
  });
}
