// @vitest-environment jsdom
import { describe, expect, test } from "vitest";

import { highlightCodeParts, renderHighlightedCode } from "../../../src/formats/code-highlight";

describe("code syntax highlighting", () => {
  test("classifies supported language tokens without changing source text", () => {
    const source = "const answer: number = 42;";
    const parts = highlightCodeParts(source, "ts");

    expect(parts.map((part) => part.text).join("")).toBe(source);
    expect(parts.some((part) => part.classes.includes("tok-keyword"))).toBe(true);
    expect(parts.some((part) => part.classes.includes("tok-number"))).toBe(true);
    expect(Object.isFrozen(parts)).toBe(true);
  });

  test("renders unknown languages as inert text", () => {
    const target = document.createElement("code");
    renderHighlightedCode(target, '<script>alert("x")</script>', "unknown-language");

    expect(target.querySelector("script")).toBeNull();
    expect(target.textContent).toBe('<script>alert("x")</script>');
  });
});
