// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import {
  createExtendedMarkdownExtensions,
  EXTENDED_MARKDOWN_FIXTURE,
} from "../../../src/editor-kernel/extended-markdown";
import { HighlightedCodeBlock } from "../../../src/editor-kernel/highlighted-code-block";

const editors: Editor[] = [];

function createEditor(markdown: string): Editor {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      HighlightedCodeBlock,
      Markdown.configure({ indentation: { style: "space", size: 2 } }),
      Image.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      ...createExtendedMarkdownExtensions(),
    ],
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});

describe("extended Markdown WYSIWYG round trip", () => {
  it("starts an empty document with an editable paragraph instead of frontmatter", () => {
    const editor = createEditor("");

    expect(editor.view.dom.querySelector("[data-frontmatter]")).toBeNull();
    expect(editor.view.dom.querySelector("p")).not.toBeNull();
    expect(editor.getMarkdown()).toBe("");
  });

  it("preserves frontmatter, Wiki links, math, Mermaid, and footnotes after an edit", () => {
    const editor = createEditor(EXTENDED_MARKDOWN_FIXTURE);

    editor.commands.insertContentAt(editor.state.doc.content.size, "Added paragraph");
    const output = editor.getMarkdown();

    expect(output).toContain("---\ntitle: Demo\ntags: [one, two]\n---");
    expect(output).toContain("[[Page Name]]");
    expect(output).toContain("[[target|Custom label]]");
    expect(output).toContain("![[System.excalidraw|640x360]]");
    expect(output).toContain("$x^2$");
    expect(output).toContain("$$\nE=mc^2\n$$");
    expect(output).toContain("```mermaid\ngraph TD; A-->B\n```");
    expect(output).toContain("note[^1]");
    expect(output).toContain("[^1]: Footnote text.");
  });

  it("renders semantic, accessible nodes instead of escaped source text", () => {
    const editor = createEditor(EXTENDED_MARKDOWN_FIXTURE);
    const root = editor.view.dom;

    expect(root.querySelector("[data-frontmatter]")).not.toBeNull();
    expect(root.querySelectorAll(".wiki-link")).toHaveLength(2);
    expect(root.querySelector("[data-wiki-embed]")?.getAttribute("data-wiki-link")).toBe(
      "System.excalidraw",
    );
    expect(root.querySelector("[data-math-inline]")).not.toBeNull();
    expect(root.querySelector("[data-math-block]")).not.toBeNull();
    expect(root.querySelector("[data-mermaid-fence]")).not.toBeNull();
    expect(root.querySelector("[data-footnote-reference]")).not.toBeNull();
    expect(root.querySelector("[data-footnote-definition]")).not.toBeNull();
  });

  it("renders common LaTeX delimiters and preserves their source", () => {
    const markdown = "Inline \\(x^2\\) and display:\n\\[\\frac{1}{2}\\]\n";
    const editor = createEditor(markdown);
    const root = editor.view.dom;

    expect(root.querySelectorAll("[data-math-inline]")).toHaveLength(1);
    expect(root.querySelectorAll("[data-math-block]")).toHaveLength(1);
    expect(root.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(editor.getMarkdown()).toContain("\\(x^2\\)");
    expect(editor.getMarkdown()).toContain("\\[\\frac{1}{2}\\]");
  });

  it("renders display delimiters embedded in prose as inline math", () => {
    const markdown = String.raw`最后它又问“\[0,\pi\] 上的平均值”，恰好只需要`;
    const editor = createEditor(markdown);
    const root = editor.view.dom;
    const inline = root.querySelector<HTMLElement>("[data-math-inline]");

    expect(root.querySelector("[data-math-block]")).toBeNull();
    expect(inline?.querySelector(".katex")).not.toBeNull();
    expect(inline?.textContent).toContain("π");
    expect(editor.getMarkdown()).toContain(String.raw`\[0,\pi\]`);
  });

  it("unwraps redundant math delimiters nested inside inline math", () => {
    const markdown = String.raw`最后它又问“\\(\[0,\\pi\]\\) 上的平均值”，恰好只需要`;
    const editor = createEditor(markdown);
    const inline = editor.view.dom.querySelector<HTMLElement>("[data-math-inline]");

    expect(inline?.querySelector(".katex-error")).toBeNull();
    expect(inline?.querySelector(".katex")).not.toBeNull();
    expect(inline?.textContent).toContain("π");
    expect(editor.getMarkdown()).toContain(String.raw`\\(\[0,\\pi\]\\)`);
  });

  it("renders model output with a redundant escape layer without rewriting the note", () => {
    const markdown = String.raw`对，但更准确地说：

后面这个 \\(\\int\_0^x f(x-t)\\,dt\\) 看起来很复杂。

\\\[
\\boxed{\\int\_0^x f(x-t)\\,dt=\\int\_0^x f(u)\\,du}
\\\]
`;
    const editor = createEditor(markdown);
    const root = editor.view.dom;
    const inline = root.querySelector<HTMLElement>("[data-math-inline]");
    const block = root.querySelector<HTMLElement>("[data-math-block]");

    expect(inline?.querySelector(".katex")).not.toBeNull();
    expect(block?.querySelector(".katex-display")).not.toBeNull();
    expect(inline?.getAttribute("aria-label")).toContain("\\\\int\\_0^x");
    expect(inline?.textContent).toContain("∫");
    expect(block?.textContent).toContain("∫");
    expect(editor.getMarkdown()).toContain(String.raw`\\(\\int\_0^x`);
    expect(editor.getMarkdown()).toContain(String.raw`\\\[
\\boxed`);
  });

  it("keeps a highlighted fenced code block editable and serializable", () => {
    const editor = createEditor("```ts\nconst value: number = 1;\n```");
    const code = editor.view.dom.querySelector("pre code");

    expect(code?.querySelector(".tok-keyword")).not.toBeNull();
    expect(editor.getMarkdown()).toContain("```ts\nconst value: number = 1;\n```");

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "\nreturn value;");
    expect(editor.getMarkdown()).toContain("return value;");
  });

  it("supports complete table row and column mutations", () => {
    const editor = createEditor("Start");
    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true);
    expect(editor.commands.addRowAfter()).toBe(true);
    expect(editor.commands.addColumnAfter()).toBe(true);
    expect(editor.view.dom.querySelectorAll("tr")).toHaveLength(3);
    expect(editor.view.dom.querySelector("tr")?.children).toHaveLength(3);
    expect(editor.getMarkdown()).toMatch(/\|\s+\|\s+\|\s+\|/);

    expect(editor.commands.deleteRow()).toBe(true);
    expect(editor.commands.deleteColumn()).toBe(true);
    expect(editor.view.dom.querySelectorAll("tr")).toHaveLength(2);
    expect(editor.view.dom.querySelector("tr")?.children).toHaveLength(2);
    expect(editor.commands.deleteTable()).toBe(true);
    expect(editor.view.dom.querySelector("table")).toBeNull();
  });
});
