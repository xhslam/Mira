import { describe, expect, test } from "vitest";

import {
  countMarkdownText,
  extractMarkdownOutline,
  findMarkdownBlockRange,
  markdownCursorPosition,
  renderedBlockMarkdownOffset,
} from "../../../src/editor-kernel/editor-kernel-state";

describe("Markdown block range", () => {
  test("selects the enclosing paragraph without neighboring blocks", () => {
    const markdown = "# Title\n\nFirst line\nsecond line\n\n- one\n- two\n";

    expect(findMarkdownBlockRange(markdown, markdown.indexOf("second"))).toEqual({
      from: 9,
      to: 31,
      markdown: "First line\nsecond line",
    });
  });

  test("keeps a fenced code block together", () => {
    const markdown = "Before\n\n```ts\nconst value = 1;\n```\n\nAfter";

    expect(findMarkdownBlockRange(markdown, markdown.indexOf("value"))).toEqual({
      from: 8,
      to: 34,
      markdown: "```ts\nconst value = 1;\n```",
    });
  });
});

describe("Markdown document metadata", () => {
  test("extracts a stable heading outline", () => {
    expect(extractMarkdownOutline("# One\ntext\n## Two\n```md\n# ignored\n```\n### Three")).toEqual(
      [
        { level: 1, text: "One", offset: 0 },
        { level: 2, text: "Two", offset: 11 },
        { level: 3, text: "Three", offset: 38 },
      ],
    );
  });

  test("counts Latin words, CJK characters, and non-whitespace characters", () => {
    expect(countMarkdownText("Hello world\n你好，世界")).toEqual({
      words: 6,
      characters: 15,
    });
  });

  test("reports one-based line and column for the native status bar", () => {
    expect(markdownCursorPosition("one\ntwo", 6)).toEqual({ line: 2, column: 3, offset: 6 });
  });

  test("maps rendered block text back to its Markdown offset", () => {
    const markdown = "# Title\n\nParagraph with **bold text**.\n\n- one\n- two";
    expect(renderedBlockMarkdownOffset(markdown, "Paragraph with bold text.", 0)).toBe(9);
    expect(renderedBlockMarkdownOffset(markdown, "one", markdown.length)).toBe(40);
  });
});
