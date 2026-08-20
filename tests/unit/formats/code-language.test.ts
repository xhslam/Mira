import { describe, expect, it } from "vitest";

import { codeLanguageForPath, codeLanguageIdForPath } from "../../../src/formats/code-language";

describe("codeLanguageIdForPath", () => {
  it.each([
    ["src/app.ts", "typescript"],
    ["component.TSX", "typescript"],
    ["index.jsx", "javascript"],
    ["tool.py", "python"],
    ["main.rs", "rust"],
    ["server.go", "go"],
    ["theme.css", "css"],
    ["release.sh", "shell"],
    ["task.rb", "ruby"],
    ["plugin.lua", "lua"],
  ] as const)("maps %s to %s", (path, expected) => {
    expect(codeLanguageIdForPath(path)).toBe(expected);
    expect(codeLanguageForPath(path)).not.toBeNull();
  });

  it("leaves unsupported languages as safe plain text", () => {
    expect(codeLanguageIdForPath("archive.xyz")).toBeNull();
    expect(codeLanguageForPath("archive.xyz")).toBeNull();
  });
});
