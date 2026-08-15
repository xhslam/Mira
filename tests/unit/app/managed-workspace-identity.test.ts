import { describe, expect, it } from "vitest";

import { translate } from "../../../src/app/i18n";
import {
  MANAGED_WORKSPACE_DEFAULT_LOCATION,
  MANAGED_WORKSPACE_DEFAULT_NAME,
  resolveWorkspaceLocation,
  resolveWorkspaceName,
} from "../../../src/app/managed-workspace-identity";
import type { WorkspaceGrant } from "../../../src/workspace/workspace-adapter";

const zh = (key: Parameters<typeof translate>[1]) => translate("zh-CN", key);
const en = (key: Parameters<typeof translate>[1]) => translate("en", key);

function grant(overrides: Partial<WorkspaceGrant>): WorkspaceGrant {
  return Object.freeze({
    workspaceId: "workspace-1" as WorkspaceGrant["workspaceId"],
    provider: "managed",
    displayName: MANAGED_WORKSPACE_DEFAULT_NAME,
    locationSummary: MANAGED_WORKSPACE_DEFAULT_LOCATION,
    serializedGrant: "managed://private-vault",
    status: "authorized",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: null,
    ...overrides,
  });
}

describe("managed workspace identity", () => {
  it("localizes the built-in managed workspace name and location", () => {
    const record = grant({});
    expect(resolveWorkspaceName(record, zh)).toBe("应用管理的工作区");
    expect(resolveWorkspaceLocation(record, zh)).toBe("本机 Inkstone 私有存储");
    expect(resolveWorkspaceName(record, en)).toBe(MANAGED_WORKSPACE_DEFAULT_NAME);
    expect(resolveWorkspaceLocation(record, en)).toBe(MANAGED_WORKSPACE_DEFAULT_LOCATION);
  });

  it("preserves a user rename instead of overwriting it with a translation", () => {
    const renamed = grant({ displayName: "我的笔记" });
    expect(resolveWorkspaceName(renamed, zh)).toBe("我的笔记");
    expect(resolveWorkspaceName(renamed, en)).toBe("我的笔记");
  });

  it("never rewrites names for linked folders the user chose", () => {
    const linked = grant({
      provider: "android-saf",
      displayName: MANAGED_WORKSPACE_DEFAULT_NAME,
      locationSummary: "content://com.android.externalstorage/tree/primary%3ANotes",
    });
    expect(resolveWorkspaceName(linked, zh)).toBe(MANAGED_WORKSPACE_DEFAULT_NAME);
    expect(resolveWorkspaceLocation(linked, zh)).toBe(
      "content://com.android.externalstorage/tree/primary%3ANotes",
    );
  });
});
