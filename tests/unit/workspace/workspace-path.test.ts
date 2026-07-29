import { describe, expect, it } from "vitest";

import { parseDocumentId, parseSessionId, parseWorkspaceId } from "../../../src/domain/identifiers";
import { parseWorkspacePath } from "../../../src/workspace/workspace-path";

describe("parseWorkspacePath", () => {
  it("accepts a portable relative path", () => {
    const result = parseWorkspacePath("notes/day.md");

    expect(result).toEqual({ ok: true, value: "notes/day.md" });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("normalizes Unicode to NFC without changing the input", () => {
    const input = "notes/e\u0301.md";

    const result = parseWorkspacePath(input);

    expect(result).toEqual({ ok: true, value: "notes/é.md" });
    expect(input).toBe("notes/e\u0301.md");
  });

  it.each([
    [undefined, "PATH_TYPE", null],
    ["", "PATH_EMPTY", ""],
    ["/notes/day.md", "PATH_ABSOLUTE", "/notes/day.md"],
    ["C:/notes/day.md", "PATH_DRIVE_PREFIX", "C:/notes/day.md"],
    ["notes\\day.md", "PATH_BACKSLASH", "notes\\day.md"],
    ["notes/da\0y.md", "PATH_NUL", "notes/da\0y.md"],
    ["notes/./day.md", "PATH_DOT_SEGMENT", "notes/./day.md"],
    ["../secret.md", "PATH_TRAVERSAL", "../secret.md"],
    ["notes/../secret.md", "PATH_TRAVERSAL", "notes/../secret.md"],
    ["notes//day.md", "PATH_REPEATED_SEPARATOR", "notes//day.md"],
    ["notes/", "PATH_TRAILING_SEPARATOR", "notes/"],
  ])("rejects %j with %s", (input, code, errorInput) => {
    const result = parseWorkspacePath(input);

    expect(result).toEqual({ ok: false, error: { code, input: errorInput } });
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) {
      expect(Object.isFrozen(result.error)).toBe(true);
    }
  });
});

describe("opaque identifiers", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  it.each([parseWorkspaceId, parseDocumentId, parseSessionId])(
    "accepts canonical UUIDs and freezes the result",
    (parseIdentifier) => {
      const result = parseIdentifier(uuid);

      expect(result).toEqual({ ok: true, value: uuid });
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it.each([parseWorkspaceId, parseDocumentId, parseSessionId])(
    "rejects malformed identifiers without throwing",
    (parseIdentifier) => {
      const result = parseIdentifier("not-a-uuid");

      expect(result.ok).toBe(false);
      expect(Object.isFrozen(result)).toBe(true);
      if (!result.ok) {
        expect(Object.isFrozen(result.error)).toBe(true);
      }
    },
  );
});
