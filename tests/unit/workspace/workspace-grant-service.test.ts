import { describe, expect, it } from "vitest";

import type { WorkspaceId } from "../../../src/domain/identifiers";
import {
  createWorkspaceGrantService,
  workspaceGrantRuntimeUri,
  type WorkspaceGrantServiceOptions,
} from "../../../src/workspace/workspace-grant-service";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000" as WorkspaceId;

function createOptions(
  platform: WorkspaceGrantServiceOptions["platform"],
  inspectDirectory: WorkspaceGrantServiceOptions["inspectDirectory"] = async () => true,
): WorkspaceGrantServiceOptions {
  return Object.freeze({
    platform,
    createWorkspaceId: () => WORKSPACE_ID,
    now: () => "2026-07-31T00:00:00.000Z",
    pickDirectory: async () => ({
      uri: platform === "android" ? "content://provider/tree/1" : "file:///notes",
      name: "Notes",
    }),
    inspectDirectory,
  });
}

describe("workspace grant service", () => {
  it("creates an Android SAF grant and restores it after a restart", async () => {
    const service = createWorkspaceGrantService(createOptions("android"));
    const authorized = await service.authorize();

    expect(authorized).toMatchObject({
      ok: true,
      value: { provider: "android-saf", serializedGrant: "content://provider/tree/1" },
    });
    if (!authorized.ok) return;

    const restored = await service.restore(authorized.value);

    expect(restored).toMatchObject({ ok: true, value: { status: "authorized" } });
  });

  it("reports revoked Android grants without creating an empty workspace", async () => {
    const service = createWorkspaceGrantService(createOptions("android", async () => false));
    const authorized = await service.authorize();
    if (!authorized.ok) throw new Error("authorization failed");

    const restored = await service.restore(authorized.value);

    expect(restored).toMatchObject({ ok: false, error: { code: "PERMISSION_REVOKED" } });
  });

  it("does not pretend an iOS session URI is a durable bookmark", async () => {
    const service = createWorkspaceGrantService(createOptions("ios"));
    const authorized = await service.authorize();

    expect(authorized).toMatchObject({ ok: false, error: { code: "BOOKMARK_REQUIRED" } });
  });

  it("serializes, restores, and refreshes an iOS security-scoped bookmark", async () => {
    const service = createWorkspaceGrantService(
      Object.freeze({
        ...createOptions("ios"),
        createBookmark: () => "bookmark-v1",
        resolveBookmark: (bookmark: string) =>
          Object.freeze({
            uri: bookmark === "bookmark-v1" ? "file:///restored-notes" : "",
            serializedBookmark: "bookmark-v2",
          }),
      }),
    );

    const authorized = await service.authorize();
    expect(authorized).toMatchObject({ ok: true, value: { provider: "ios-bookmark" } });
    if (!authorized.ok) return;
    expect(workspaceGrantRuntimeUri(authorized.value)).toBe("file:///notes");

    const restored = await service.restore(authorized.value);

    expect(restored).toMatchObject({ ok: true, value: { status: "authorized" } });
    if (restored.ok) {
      expect(workspaceGrantRuntimeUri(restored.value)).toBe("file:///restored-notes");
      expect(restored.value.serializedGrant).toContain("bookmark-v2");
    }
  });

  it("requires reauthorization when an iOS bookmark no longer resolves", async () => {
    const service = createWorkspaceGrantService(
      Object.freeze({
        ...createOptions("ios"),
        createBookmark: () => "bookmark-v1",
        resolveBookmark: () => {
          throw new Error("stale bookmark");
        },
      }),
    );
    const authorized = await service.authorize();
    if (!authorized.ok) throw new Error("authorization failed");

    expect(await service.restore(authorized.value)).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_REVOKED" },
    });
  });

  it("rejects a provider grant restored on the wrong platform", async () => {
    const service = createWorkspaceGrantService(createOptions("android"));
    const result = await service.restore({
      workspaceId: WORKSPACE_ID,
      provider: "ios-bookmark",
      displayName: "Notes",
      locationSummary: "Notes",
      serializedGrant: "file:///notes",
      status: "authorized",
      createdAt: "2026-07-31T00:00:00.000Z",
      lastOpenedAt: null,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_GRANT" } });
  });
});
