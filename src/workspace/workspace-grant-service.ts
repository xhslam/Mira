import { failure, type Result, success } from "../domain/result";
import type { WorkspaceGrant, WorkspaceProvider } from "./workspace-adapter";

export type WorkspaceGrantErrorCode =
  | "AUTHORIZATION_CANCELLED"
  | "BOOKMARK_REQUIRED"
  | "PERMISSION_REVOKED"
  | "INVALID_GRANT"
  | "IO_FAILURE";

export type WorkspaceGrantError = Readonly<{
  code: WorkspaceGrantErrorCode;
  message: string;
}>;

export type WorkspaceGrantServiceOptions = Readonly<{
  platform: "android" | "ios";
  createWorkspaceId: () => WorkspaceGrant["workspaceId"];
  now: () => string;
  pickDirectory: (initialUri?: string) => Promise<Readonly<{ uri: string; name: string }>>;
  inspectDirectory: (uri: string) => Promise<boolean>;
  createBookmark?: (uri: string) => string;
  resolveBookmark?: (
    serializedBookmark: string,
  ) => Readonly<{ uri: string; serializedBookmark: string }>;
}>;

export type WorkspaceGrantService = Readonly<{
  authorize(initialUri?: string): Promise<Result<WorkspaceGrant, WorkspaceGrantError>>;
  restore(grant: WorkspaceGrant): Promise<Result<WorkspaceGrant, WorkspaceGrantError>>;
}>;

function grantError(
  code: WorkspaceGrantErrorCode,
  message: string,
): Result<never, WorkspaceGrantError> {
  return failure(Object.freeze({ code, message }));
}

function providerFor(platform: WorkspaceGrantServiceOptions["platform"]): WorkspaceProvider {
  return platform === "android" ? "android-saf" : "ios-bookmark";
}

type IosSerializedGrant = Readonly<{ version: 1; uri: string; bookmark: string }>;

function serializeIosGrant(uri: string, bookmark: string): string {
  if (!uri.startsWith("file://") || bookmark.length === 0) {
    throw new Error("Invalid iOS workspace bookmark");
  }
  return JSON.stringify(Object.freeze({ version: 1, uri, bookmark } satisfies IosSerializedGrant));
}

function parseIosGrant(serializedGrant: string): IosSerializedGrant | null {
  try {
    const parsed = JSON.parse(serializedGrant) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      typeof record.uri !== "string" ||
      !record.uri.startsWith("file://") ||
      typeof record.bookmark !== "string" ||
      record.bookmark.length === 0
    ) {
      return null;
    }
    return Object.freeze({ version: 1, uri: record.uri, bookmark: record.bookmark });
  } catch {
    return null;
  }
}

export function workspaceGrantRuntimeUri(grant: WorkspaceGrant): string | null {
  return grant.provider === "ios-bookmark"
    ? (parseIosGrant(grant.serializedGrant)?.uri ?? null)
    : grant.serializedGrant;
}

function createGrant(
  options: WorkspaceGrantServiceOptions,
  picked: Readonly<{ uri: string; name: string }>,
): Result<WorkspaceGrant, WorkspaceGrantError> {
  const validUri =
    options.platform === "android"
      ? /^content:\/\//i.test(picked.uri)
      : /^file:\/\//i.test(picked.uri);
  if (!validUri || picked.uri.length > 16_384 || picked.name.trim().length === 0) {
    return grantError("INVALID_GRANT", "The selected workspace grant is invalid");
  }
  const now = options.now();
  const createBookmark = options.createBookmark;
  if (options.platform === "ios" && !createBookmark) {
    return grantError("BOOKMARK_REQUIRED", "Native iOS workspace bookmarks are unavailable");
  }
  let serializedGrant = picked.uri;
  if (options.platform === "ios") {
    if (!createBookmark) {
      return grantError("BOOKMARK_REQUIRED", "Native iOS workspace bookmarks are unavailable");
    }
    try {
      serializedGrant = serializeIosGrant(picked.uri, createBookmark(picked.uri));
    } catch {
      return grantError("BOOKMARK_REQUIRED", "The selected folder bookmark could not be created");
    }
  }
  return success(
    Object.freeze({
      workspaceId: options.createWorkspaceId(),
      provider: providerFor(options.platform),
      displayName: picked.name.trim().slice(0, 200),
      locationSummary: picked.name.trim().slice(0, 500),
      serializedGrant,
      status: "authorized",
      createdAt: now,
      lastOpenedAt: now,
    }),
  );
}

export function createWorkspaceGrantService(
  options: WorkspaceGrantServiceOptions,
): WorkspaceGrantService {
  return Object.freeze({
    async authorize(initialUri) {
      try {
        return createGrant(options, await options.pickDirectory(initialUri));
      } catch {
        return grantError("AUTHORIZATION_CANCELLED", "Workspace authorization was cancelled");
      }
    },

    async restore(grant) {
      if (grant.provider !== providerFor(options.platform)) {
        return grantError("INVALID_GRANT", "This workspace grant belongs to another platform");
      }
      if (options.platform === "ios") {
        const persisted = parseIosGrant(grant.serializedGrant);
        if (!persisted || !options.resolveBookmark) {
          return grantError(
            "BOOKMARK_REQUIRED",
            "iOS linked workspaces require a native security-scoped bookmark service",
          );
        }
        try {
          const resolved = options.resolveBookmark(persisted.bookmark);
          if (!(await options.inspectDirectory(resolved.uri))) {
            return grantError(
              "PERMISSION_REVOKED",
              "Workspace access needs to be authorized again",
            );
          }
          return success(
            Object.freeze({
              ...grant,
              serializedGrant: serializeIosGrant(resolved.uri, resolved.serializedBookmark),
              status: "authorized",
              lastOpenedAt: options.now(),
            }),
          );
        } catch {
          return grantError("PERMISSION_REVOKED", "Workspace access needs to be authorized again");
        }
      }
      if (grant.serializedGrant.length === 0) {
        return grantError("INVALID_GRANT", "The persisted workspace grant is empty");
      }
      if (!/^content:\/\//i.test(grant.serializedGrant)) {
        return grantError("INVALID_GRANT", "The persisted Android grant is not a content URI");
      }
      try {
        const available = await options.inspectDirectory(grant.serializedGrant);
        if (!available) {
          return grantError("PERMISSION_REVOKED", "Workspace access needs to be authorized again");
        }
        return success(
          Object.freeze({
            ...grant,
            status: "authorized",
            lastOpenedAt: options.now(),
          }),
        );
      } catch {
        return grantError("IO_FAILURE", "The persisted workspace grant could not be checked");
      }
    },
  });
}
