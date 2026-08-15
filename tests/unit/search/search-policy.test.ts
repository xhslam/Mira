import { describe, expect, test } from "vitest";

import {
  createSearchSnippet,
  isSearchableWorkspacePath,
  toFtsQuery,
} from "../../../src/search/search-policy";

describe("search policy", () => {
  test.each([".env", ".git/config", "secrets/private.key", "certs/site.pem", "token.p12"])(
    "excludes sensitive path %s from content indexing",
    (path) => expect(isSearchableWorkspacePath(path)).toBe(false),
  );

  test("allows ordinary visible text files", () => {
    expect(isSearchableWorkspacePath("notes/roadmap.md")).toBe(true);
  });

  test("builds a parameter value instead of executable FTS syntax", () => {
    expect(toFtsQuery('release OR "private"*')).toBe('"release"* AND "OR"* AND "private"*');
  });

  test("returns bounded context and the one-based matching line", () => {
    expect(createSearchSnippet("first\nalpha release plan\nlast", "release", 24)).toEqual({
      snippet: "alpha release plan",
      line: 2,
    });
  });
});
