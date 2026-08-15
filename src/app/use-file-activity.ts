import { useCallback, useEffect, useMemo, useState } from "react";

import type { FileEntry } from "../workspace/workspace-adapter";
import type { AppServices } from "./app-services";
import { EMPTY_FILE_ACTIVITY, type FileActivity } from "./file-activity-store";

export function useFileActivity(
  services: AppServices,
  browserEntries: readonly FileEntry[],
  activePath: string | undefined,
) {
  const [activity, setActivity] = useState<FileActivity>(EMPTY_FILE_ACTIVITY);
  const [error, setError] = useState<string | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const workspaceId = services.activeWorkspace.grant.workspaceId;

  useEffect(() => {
    let active = true;
    void services.fileActivityStore.load().then((result) => {
      if (!active) return;
      if (result.ok) {
        setActivity(result.value);
        setError(null);
      } else {
        setActivity(EMPTY_FILE_ACTIVITY);
        setError(result.error.message);
      }
      setLoadedWorkspaceId(workspaceId);
    });
    return () => {
      active = false;
    };
  }, [services, workspaceId]);

  useEffect(() => {
    if (
      activePath === undefined ||
      loadedWorkspaceId !== workspaceId ||
      !browserEntries.some((entry) => entry.kind === "file" && entry.path === activePath)
    ) {
      return;
    }
    let active = true;
    void services.fileActivityStore
      .recordOpened(activePath, new Date().toISOString())
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setActivity(result.value);
          setError(null);
        } else setError(result.error.message);
      });
    return () => {
      active = false;
    };
  }, [activePath, browserEntries, loadedWorkspaceId, services, workspaceId]);

  const onPathMoved = useCallback(
    async (from: string, to: string) => {
      const result = await services.fileActivityStore.movePath(from, to);
      if (result.ok) {
        setActivity(result.value);
        setError(null);
      } else setError(result.error.message);
    },
    [services],
  );

  const onPathRemoved = useCallback(
    async (path: string) => {
      const result = await services.fileActivityStore.removePath(path);
      if (result.ok) {
        setActivity(result.value);
        setError(null);
      } else setError(result.error.message);
    },
    [services],
  );

  const setFavorite = useCallback(
    async (entry: FileEntry, favorite: boolean): Promise<boolean> => {
      if (entry.kind !== "file") return false;
      const result = await services.fileActivityStore.setFavorite(entry.path, favorite);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setActivity(result.value);
      setError(null);
      return true;
    },
    [services],
  );

  return useMemo(
    () => ({
      activity: loadedWorkspaceId === workspaceId ? activity : EMPTY_FILE_ACTIVITY,
      error: loadedWorkspaceId === workspaceId ? error : null,
      onPathMoved,
      onPathRemoved,
      setFavorite,
    }),
    [activity, error, loadedWorkspaceId, onPathMoved, onPathRemoved, setFavorite, workspaceId],
  );
}
