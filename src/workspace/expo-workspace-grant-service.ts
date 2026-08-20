import { Directory } from "expo-file-system";
import { Platform } from "react-native";
import {
  createWorkspaceBookmark,
  isWorkspaceBookmarkAvailable,
  resolveWorkspaceBookmark,
} from "inkstone-workspace-access";

import type { WorkspaceId } from "../domain/identifiers";
import { createWorkspaceGrantService, type WorkspaceGrantService } from "./workspace-grant-service";

export function createExpoWorkspaceGrantService(
  createWorkspaceId: () => WorkspaceId,
): WorkspaceGrantService {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("Linked workspace authorization is only available on Android and iOS");
  }

  return createWorkspaceGrantService({
    platform: Platform.OS,
    createWorkspaceId,
    now: () => new Date().toISOString(),
    pickDirectory: async (initialUri) => {
      const directory = await Directory.pickDirectoryAsync(initialUri);
      return Object.freeze({ uri: directory.uri, name: directory.name });
    },
    inspectDirectory: async (uri) => new Directory(uri).exists,
    ...(Platform.OS === "ios" && isWorkspaceBookmarkAvailable()
      ? {
          createBookmark: createWorkspaceBookmark,
          resolveBookmark: (bookmark: string) => {
            const resolved = resolveWorkspaceBookmark(bookmark);
            return Object.freeze({
              uri: resolved.uri,
              serializedBookmark: resolved.serializedBookmark,
            });
          },
        }
      : {}),
  });
}
