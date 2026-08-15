import { describe, expect, it } from "vitest";

import { nextEditorMode } from "../../../src/app/editor-mode-cycle";

describe("nextEditorMode", () => {
  it("cycles Markdown through rich text, source, and reading modes", () => {
    expect(nextEditorMode("wysiwyg", "markdown")).toBe("source");
    expect(nextEditorMode("source", "markdown")).toBe("reading");
    expect(nextEditorMode("reading", "markdown")).toBe("wysiwyg");
  });

  it("keeps the structured-data cycle unchanged", () => {
    expect(nextEditorMode("tree", "json")).toBe("table");
    expect(nextEditorMode("table", "yaml")).toBe("source");
    expect(nextEditorMode("source", "toml")).toBe("tree");
  });
});
