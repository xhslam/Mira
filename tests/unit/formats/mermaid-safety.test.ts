import { describe, expect, it } from "vitest";

import {
  checkMermaidSourceLimits,
  isStaleRender,
  MERMAID_LIMITS,
} from "../../../src/formats/mermaid/limits";
import {
  checkSvgSafety,
  hasForbiddenSvgAttr,
  hasForbiddenSvgTag,
  sanitizeSvgStyleValue,
} from "../../../src/formats/mermaid/svg-safety";

describe("mermaid source limits", () => {
  it("allows ordinary diagrams", () => {
    const source = "flowchart TD\n  A[Start] --> B[End]\n";
    expect(checkMermaidSourceLimits(source)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("rejects oversized sources by byte length", () => {
    const source = "A --> B\n".repeat(MERMAID_LIMITS.maxSourceBytes / 8 + 1);
    const result = checkMermaidSourceLimits(source);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("byte");
  });

  it("rejects diagrams declaring too many nodes", () => {
    const lines = Array.from(
      { length: MERMAID_LIMITS.maxNodes + 1 },
      (_, index) => `N${index}[Node ${index}]`,
    );
    const source = `flowchart TD\n${lines.join("\n")}\n`;
    const result = checkMermaidSourceLimits(source);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("nodes");
  });

  it("rejects diagrams with too many edges", () => {
    const source = "flowchart TD\n" + "A --> B\n".repeat(MERMAID_LIMITS.maxEdges + 1);
    const result = checkMermaidSourceLimits(source);
    expect(result.allowed).toBe(false);
  });

  it("detects stale renders by id", () => {
    expect(isStaleRender(1, 2)).toBe(true);
    expect(isStaleRender(2, 2)).toBe(false);
  });
});

describe("svg safety", () => {
  it("flags script tags", () => {
    expect(hasForbiddenSvgTag("<svg><script>alert(1)</script></svg>")).toBe(true);
    expect(hasForbiddenSvgTag("<svg><g></g></svg>")).toBe(false);
  });

  it("flags event handler attributes", () => {
    expect(hasForbiddenSvgAttr('<svg onclick="x()"></svg>')).toBe(true);
    expect(hasForbiddenSvgAttr('<svg onerror="x()"></svg>')).toBe(true);
    expect(hasForbiddenSvgAttr('<svg fill="red"></svg>')).toBe(false);
  });

  it("sanitizes dangerous CSS style patterns", () => {
    expect(sanitizeSvgStyleValue("width:100px")).toEqual({
      sanitized: "width:100px",
      blocked: false,
    });
    const expression = sanitizeSvgStyleValue("width: expression(alert(1))");
    expect(expression.blocked).toBe(true);
    expect(expression.sanitized).not.toContain("expression");

    const javascript = sanitizeSvgStyleValue("background: url(javascript:alert(1))");
    expect(javascript.blocked).toBe(true);
  });

  it("combines tag, attribute, and style checks", () => {
    expect(checkSvgSafety("<svg><script></script></svg>").dangerous).toBe(true);
    expect(checkSvgSafety('<svg fill="red"><rect /></svg>').dangerous).toBe(false);
  });
});
