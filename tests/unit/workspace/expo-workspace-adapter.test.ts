import { describe, expect, it } from "vitest";

import { LINKED_CAPABILITIES } from "../../../src/workspace/linked-workspace-capabilities";
import { createWorkspaceFileRevision } from "../../../src/workspace/workspace-file-revision";

describe("Expo workspace adapter revision", () => {
  it("advertises sharing now that files are copied to app cache before the system panel opens", () => {
    expect(LINKED_CAPABILITIES.share).toBe(true);
  });

  it("advertises the Expo 57 provider mutation methods wired by the linked adapter", () => {
    expect(LINKED_CAPABILITIES).toMatchObject({ rename: true, move: true, copy: true });
  });
  it("changes when content changes even if provider metadata is identical", () => {
    const metadata = Object.freeze({
      providerIdentifier: "content://provider/tree/notes/document/readme",
      modifiedAt: 1_753_910_400_000,
      size: 12,
    });

    const first = createWorkspaceFileRevision({ ...metadata, contentHash: "hash:first" });
    const second = createWorkspaceFileRevision({ ...metadata, contentHash: "hash:second" });

    expect(first).not.toBe(second);
  });

  it("uses an unambiguous serialized tuple and remains deterministic", () => {
    const input = Object.freeze({
      providerIdentifier: "content://provider/document/a:b",
      modifiedAt: null,
      size: 0,
      contentHash: "0123456789abcdef",
    });

    const first = createWorkspaceFileRevision(input);
    const second = createWorkspaceFileRevision(input);

    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual([
      "content://provider/document/a:b",
      null,
      0,
      "0123456789abcdef",
    ]);
  });

  it.each([
    { providerIdentifier: "", modifiedAt: 0, size: 1, contentHash: "hash" },
    { providerIdentifier: "content://file", modifiedAt: Number.NaN, size: 1, contentHash: "hash" },
    { providerIdentifier: "content://file", modifiedAt: 0, size: -1, contentHash: "hash" },
    { providerIdentifier: "content://file", modifiedAt: 0, size: 1, contentHash: "" },
  ])("rejects invalid revision metadata", (input) => {
    expect(() => createWorkspaceFileRevision(input)).toThrow("Invalid workspace file revision");
  });
});
