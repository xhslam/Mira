import { describe, expect, it } from "vitest";

import {
  findMathBlockStart,
  findMathInlineStart,
  MAX_RENDERABLE_MATH_LENGTH,
  normalizeLatexForRendering,
  tokenizeMathBlock,
  tokenizeMathInline,
} from "../../../src/editor-kernel/math-markdown";

describe("math Markdown tokenizer", () => {
  it("parses same-line and multiline display formulas", () => {
    expect(tokenizeMathBlock("$$E=mc^2$$\nNext")).toEqual({
      raw: "$$E=mc^2$$\n",
      source: "E=mc^2",
    });
    expect(tokenizeMathBlock("$$\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\n$$\n")).toEqual({
      raw: "$$\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\n$$\n",
      source: "\\begin{aligned}a&=b\\\\c&=d\\end{aligned}",
    });
    expect(findMathBlockStart("text\n$$x$$\n")).toBe(5);
  });

  it("pairs the exact escaped display delimiter and does not close on nested brackets", () => {
    const markdown = String.raw`\\\[
\\boxed{\\mathcal L\[te^{-t}\]=\\frac{1}{(s+1)^2}}
\\\]
After`;
    const match = tokenizeMathBlock(markdown);

    expect(match?.source).toContain(String.raw`\\mathcal L\[te^{-t}\]`);
    expect(match?.raw).not.toContain("After");
  });

  it("requires a multiline display closer to occupy its own line", () => {
    const markdown = String.raw`\[
\boxed{\mathcal L\[te^{-t}\]=\frac{1}{(s+1)^2}}
\]
After`;
    const match = tokenizeMathBlock(markdown);

    expect(match?.source).toContain(String.raw`\mathcal L\[te^{-t}\]`);
    expect(match?.source).toContain(String.raw`\frac{1}{(s+1)^2}`);
    expect(match?.raw).not.toContain("After");
  });

  it("parses inline dollar and backslash delimiters without consuming escaped dollars", () => {
    expect(tokenizeMathInline("$x^2$ after")).toEqual({ raw: "$x^2$", source: "x^2" });
    expect(tokenizeMathInline(String.raw`\(x+1\) after`)).toEqual({
      raw: String.raw`\(x+1\)`,
      source: "x+1",
    });
    expect(findMathInlineStart(String.raw`price \$5 then \(x\)`)).toBe(15);
  });

  it("does not interpret ordinary currency or incomplete delimiters as formulas", () => {
    expect(tokenizeMathInline("$5 and $10")).toBeNull();
    expect(tokenizeMathInline("$ unfinished")).toBeNull();
    expect(tokenizeMathInline("$x without close")).toBeNull();
    expect(tokenizeMathBlock("$$ unfinished")).toBeNull();
  });

  it("caps formula scans so hostile input cannot create an unbounded render", () => {
    const oversized = `$${"x".repeat(MAX_RENDERABLE_MATH_LENGTH + 1)}$`;
    expect(tokenizeMathInline(oversized)).toBeNull();
  });
});

describe("LaTeX render normalization", () => {
  it("repairs provider escaping and nested delimiter brackets without rewriting semantics", () => {
    expect(
      normalizeLatexForRendering(String.raw`\\boxed{\\mathcal L\[te^{-t}\]=\\frac{1}{(s+1)^2}}`),
    ).toBe(String.raw`\boxed{\mathcal L[te^{-t}]=\frac{1}{(s+1)^2}}`);
  });

  it("unwraps redundant outer delimiters and preserves matrix row separators", () => {
    expect(normalizeLatexForRendering(String.raw`\\(\[0,\\pi\]\\)`)).toBe(String.raw`[0,\pi]`);
    expect(normalizeLatexForRendering(String.raw`\begin{matrix}a\\b\\[6pt]c\end{matrix}`)).toBe(
      String.raw`\begin{matrix}a\\b\\[6pt]c\end{matrix}`,
    );
  });

  it("removes line-level Markdown leaked into a display formula render copy", () => {
    const source = String.raw`\\mathcal L\[t\]
=============

# \\frac{1!}{s^2}

\\frac1{s^2}`;

    expect(normalizeLatexForRendering(source)).toBe(String.raw`\mathcal L[t]


\frac{1!}{s^2}

\frac1{s^2}`);
  });
});
