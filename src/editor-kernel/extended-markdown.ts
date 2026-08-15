import { Node, type Extensions, type MarkdownToken } from "@tiptap/core";
import katex from "katex";
import "katex/dist/katex.min.css";
import mermaid from "mermaid";

import { renderMermaidDiagram } from "../formats/mermaid/renderer";
import {
  findMathBlockStart,
  findMathInlineStart,
  MAX_RENDERABLE_MATH_LENGTH,
  normalizeLatexForRendering,
  tokenizeMathBlock,
  tokenizeMathInline,
} from "./math-markdown";

type RawToken = MarkdownToken & Readonly<{ raw?: string; source?: string; target?: string }>;

function rawAttribute() {
  return { isRequired: true, default: undefined } as const;
}

function rawBlockNode(
  name: string,
  className: string,
  tokenizer: Readonly<{
    start: (source: string) => number;
    match: (source: string) => RegExpMatchArray | null;
    label: (raw: string) => string;
  }>,
) {
  const dataAttribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  return Node.create({
    name,
    priority: 1_100,
    group: "block",
    atom: true,
    isolating: true,
    selectable: true,
    addAttributes() {
      return { raw: rawAttribute() };
    },
    parseHTML() {
      return [{ tag: `div[${dataAttribute}]` }];
    },
    renderHTML({ node }) {
      const raw = typeof node.attrs.raw === "string" ? node.attrs.raw : "";
      return [
        "div",
        {
          [dataAttribute]: "",
          class: className,
          role: "group",
          "aria-label": tokenizer.label(raw),
        },
        ["pre", {}, raw],
      ];
    },
    markdownTokenName: name,
    markdownTokenizer: {
      name,
      level: "block",
      start: tokenizer.start,
      tokenize(source) {
        const match = tokenizer.match(source);
        if (!match) return undefined;
        return { type: name, raw: match[0], source: match[0] };
      },
    },
    parseMarkdown(token: RawToken, helpers) {
      return helpers.createNode(name, { raw: token.source ?? token.raw ?? "" });
    },
    renderMarkdown(node) {
      return typeof node.attrs?.raw === "string" ? node.attrs.raw.trimEnd() : "";
    },
  });
}

const Frontmatter = rawBlockNode("frontmatter", "extended-block frontmatter-block", {
  start: (source) => /^---\s*$/m.exec(source)?.index ?? -1,
  match: (source) => source.match(/^---[\t ]*\n[\s\S]*?\n---[\t ]*(?:\n|$)/),
  label: () => "YAML frontmatter. Switch to Source mode to edit.",
});

let mermaidNodeId = 0;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
  fontFamily: "inherit",
  maxEdges: 1_000,
});

const MermaidFence = rawBlockNode("mermaidFence", "extended-block mermaid-fence", {
  start: (source) => /^```mermaid(?:[\t ]*)$/im.exec(source)?.index ?? -1,
  match: (source) => source.match(/^```mermaid[\t ]*\n[\s\S]*?\n```[\t ]*(?:\n|$)/i),
  label: () => "Mermaid diagram. Switch to Source mode to edit.",
}).extend({
  addNodeView() {
    return ({ node }) => {
      let active = true;
      const element = document.createElement("figure");
      element.className = "extended-block mermaid-fence";
      element.dataset.mermaidFence = "";
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", "Rendered Mermaid diagram");
      const status = document.createElement("figcaption");
      status.textContent = "Rendering Mermaid diagram…";
      element.append(status);
      const raw = String(node.attrs.raw ?? "");
      const source = raw.replace(/^```mermaid[\t ]*\n/i, "").replace(/\n```[\t ]*\n?$/i, "");
      mermaidNodeId += 1;
      const renderId = mermaidNodeId;
      void renderMermaidDiagram(
        source,
        async (diagramSource) =>
          (await mermaid.render(`inkstone-inline-mermaid-${renderId}`, diagramSource)).svg,
        { renderId, latestRenderId: renderId },
      ).then((result) => {
        if (!active) return;
        if (result.ok) {
          element.innerHTML = result.value;
        } else {
          status.textContent = result.error.reason;
          status.setAttribute("role", "alert");
        }
      });
      return {
        dom: element,
        destroy() {
          active = false;
        },
      };
    };
  },
});

type MathNodeViewNode = Readonly<{
  attrs: Readonly<Record<string, unknown>>;
  type: Readonly<{ name: string }>;
}>;

/** Keeps inline and display formulas consistent across node-view updates. */
function renderMathNode(element: HTMLElement, source: string, displayMode: boolean): void {
  element.replaceChildren();
  element.className = "math-node " + (displayMode ? "math-block" : "math-inline");
  element.dataset.mathError = "false";
  delete element.dataset.mathErrorCode;
  element.ariaLabel = "Formula: " + (source || "empty formula");
  const normalized = normalizeLatexForRendering(source);
  if (!normalized || normalized.length > MAX_RENDERABLE_MATH_LENGTH) {
    element.dataset.mathError = "true";
    element.dataset.mathErrorCode = normalized ? "formula-too-long" : "empty-formula";
    element.classList.add("math-render-fallback");
    element.textContent = source || "Empty formula";
    return;
  }
  try {
    katex.render(normalized, element, {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: true,
      trust: false,
      maxExpand: 1_000,
      maxSize: 20,
      minRuleThickness: 0.04,
      strict: "warn",
    });
    if (element.querySelector(".katex-error")) {
      element.dataset.mathError = "true";
      element.dataset.mathErrorCode = "unsupported-command";
    }
  } catch {
    element.dataset.mathError = "true";
    element.dataset.mathErrorCode = "invalid-latex";
    element.classList.add("math-render-fallback");
    element.textContent = source || "Empty formula";
  }
}

function createMathNodeView(node: MathNodeViewNode, displayMode: boolean) {
  const element = document.createElement(displayMode ? "div" : "span");
  const render = (nextNode: MathNodeViewNode): void => {
    renderMathNode(element, String(nextNode.attrs.source ?? ""), displayMode);
  };
  render(node);
  return {
    dom: element,
    update(nextNode: MathNodeViewNode): boolean {
      if (nextNode.type.name !== node.type.name) return false;
      render(nextNode);
      return true;
    },
  };
}

const MathBlock = Node.create({
  name: "mathBlock",
  priority: 1_100,
  group: "block",
  atom: true,
  isolating: true,
  addAttributes() {
    return { raw: rawAttribute(), source: rawAttribute() };
  },
  parseHTML() {
    return [{ tag: "div[data-math-block]" }];
  },
  renderHTML({ node }) {
    return [
      "div",
      {
        "data-math-block": "",
        class: "math-node math-block",
        role: "math",
        "aria-label": `Math formula: ${String(node.attrs.source ?? "")}`,
      },
      String(node.attrs.source ?? ""),
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const view = createMathNodeView(node, true);
      view.dom.dataset.mathBlock = "";
      return view;
    };
  },
  markdownTokenName: "mathBlock",
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start: findMathBlockStart,
    tokenize(source) {
      const match = tokenizeMathBlock(source);
      if (!match) return undefined;
      return { type: "mathBlock", raw: match.raw, source: match.source };
    },
  },
  parseMarkdown(token: RawToken, helpers) {
    const source = token.source ?? "";
    return helpers.createNode("mathBlock", {
      raw: token.raw ?? `$$\n${source}\n$$`,
      source,
    });
  },
  renderMarkdown(node) {
    return typeof node.attrs?.raw === "string"
      ? node.attrs.raw.trimEnd()
      : `$$\n${String(node.attrs?.source ?? "")}\n$$`;
  },
});

const FootnoteDefinition = rawBlockNode("footnoteDefinition", "extended-block footnote-block", {
  start: (source) => /^\[\^[^\]\n]+]:/m.exec(source)?.index ?? -1,
  match: (source) => source.match(/^\[\^[^\]\n]+]:[^\n]*(?:\n(?: {2,}|\t)[^\n]*)*(?:\n|$)/),
  label: (raw) => `Footnote definition: ${raw.trim()}`,
});

const WikiEmbed = Node.create({
  name: "wikiEmbed",
  priority: 1_120,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { raw: rawAttribute(), target: rawAttribute(), size: rawAttribute() };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-embed]" }];
  },
  renderHTML({ node }) {
    const target = String(node.attrs.target ?? "");
    return [
      "span",
      {
        "data-wiki-embed": "drawing",
        "data-wiki-link": target,
        "data-embed-size": String(node.attrs.size ?? ""),
        class: "wiki-embed",
        role: "link",
        tabindex: "0",
        "aria-label": `Embedded drawing ${target}`,
      },
      `◇ ${target.replace(/\.excalidraw(?:\.md)?$/i, "")}`,
    ];
  },
  markdownTokenName: "wikiEmbed",
  markdownTokenizer: {
    name: "wikiEmbed",
    level: "inline",
    start: (source) => source.indexOf("![["),
    tokenize(source) {
      const match = source.match(/^!\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?]]/);
      if (!match) return undefined;
      const target = (match[1] ?? "").trim();
      if (!target) return undefined;
      return {
        type: "wikiEmbed",
        raw: match[0],
        target,
        size: (match[2] ?? "").trim(),
      };
    },
  },
  parseMarkdown(token: RawToken, helpers) {
    return helpers.createNode("wikiEmbed", {
      raw: token.raw ?? "",
      target: token.target ?? "",
      size: token.size ?? "",
    });
  },
  renderMarkdown(node) {
    return typeof node.attrs?.raw === "string" && node.attrs.raw
      ? node.attrs.raw
      : `![[${String(node.attrs?.target ?? "")}]]`;
  },
});

const WikiLink = Node.create({
  name: "wikiLink",
  priority: 1_100,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { raw: rawAttribute(), target: rawAttribute(), label: rawAttribute() };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-link]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-wiki-link": String(node.attrs.target ?? ""),
        class: "wiki-link",
        role: "link",
        tabindex: "0",
        "aria-label": `Wiki link to ${String(node.attrs.target ?? "")}`,
      },
      String(node.attrs.label || node.attrs.target || "Wiki link"),
    ];
  },
  markdownTokenName: "wikiLink",
  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (source) => source.indexOf("[["),
    tokenize(source) {
      const match = source.match(/^\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?]]/);
      if (!match) return undefined;
      const target = (match[1] ?? "").trim();
      if (!target) return undefined;
      return {
        type: "wikiLink",
        raw: match[0],
        target,
        text: (match[2] ?? target).trim(),
      };
    },
  },
  parseMarkdown(token: RawToken, helpers) {
    return helpers.createNode("wikiLink", {
      raw: token.raw ?? "",
      target: token.target ?? "",
      label: token.text ?? token.target ?? "",
    });
  },
  renderMarkdown(node) {
    return typeof node.attrs?.raw === "string" && node.attrs.raw
      ? node.attrs.raw
      : `[[${String(node.attrs?.target ?? "")}]]`;
  },
});

const MathInline = Node.create({
  name: "mathInline",
  priority: 1_050,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { raw: rawAttribute(), source: rawAttribute() };
  },
  parseHTML() {
    return [{ tag: "span[data-math-inline]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-math-inline": "",
        class: "math-node math-inline",
        role: "math",
        "aria-label": `Math formula: ${String(node.attrs.source ?? "")}`,
      },
      String(node.attrs.source ?? ""),
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const view = createMathNodeView(node, false);
      view.dom.dataset.mathInline = "";
      return view;
    };
  },
  markdownTokenName: "mathInline",
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start: findMathInlineStart,
    tokenize(source) {
      const match = tokenizeMathInline(source);
      if (!match) return undefined;
      return {
        type: "mathInline",
        raw: match.raw,
        source: match.source,
      };
    },
  },
  parseMarkdown(token: RawToken, helpers) {
    return helpers.createNode("mathInline", {
      raw: token.raw ?? "",
      source: token.source ?? "",
    });
  },
  renderMarkdown(node) {
    return typeof node.attrs?.raw === "string" && node.attrs.raw
      ? node.attrs.raw
      : `$${String(node.attrs?.source ?? "")}$`;
  },
});

const FootnoteReference = Node.create({
  name: "footnoteReference",
  priority: 1_075,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { raw: rawAttribute(), label: rawAttribute() };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote-reference]" }];
  },
  renderHTML({ node }) {
    return [
      "sup",
      {
        "data-footnote-reference": String(node.attrs.label ?? ""),
        class: "footnote-reference",
        "aria-label": `Footnote ${String(node.attrs.label ?? "")}`,
      },
      String(node.attrs.label ?? ""),
    ];
  },
  markdownTokenName: "footnoteReference",
  markdownTokenizer: {
    name: "footnoteReference",
    level: "inline",
    start: (source) => source.search(/\[\^/),
    tokenize(source) {
      const match = source.match(/^\[\^([^\]\n]+)]/);
      if (!match) return undefined;
      return { type: "footnoteReference", raw: match[0], text: match[1] ?? "" };
    },
  },
  parseMarkdown(token: RawToken, helpers) {
    return helpers.createNode("footnoteReference", {
      raw: token.raw ?? "",
      label: token.text ?? "",
    });
  },
  renderMarkdown(node) {
    return typeof node.attrs?.raw === "string" && node.attrs.raw
      ? node.attrs.raw
      : `[^${String(node.attrs?.label ?? "")}]`;
  },
});

export function createExtendedMarkdownExtensions(): Extensions {
  return [
    Frontmatter,
    MermaidFence,
    MathBlock,
    FootnoteDefinition,
    WikiEmbed,
    WikiLink,
    FootnoteReference,
    MathInline,
  ];
}

export const EXTENDED_MARKDOWN_FIXTURE = `---
title: Demo
tags: [one, two]
---

# Extended

Wiki [[Page Name]] and [[target|Custom label]], drawing ![[System.excalidraw|640x360]], math $x^2$, and note[^1].

$$
E=mc^2
$$

\`\`\`mermaid
graph TD; A-->B
\`\`\`

[^1]: Footnote text.
`;
