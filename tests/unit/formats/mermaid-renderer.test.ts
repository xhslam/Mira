import { describe, expect, it, vi } from "vitest";

import {
  renderMermaidDiagram,
  type MermaidSvgRenderer,
} from "../../../src/formats/mermaid/renderer";

function rendererReturning(svg: string): MermaidSvgRenderer {
  return vi.fn(async () => svg);
}

const OPTIONS = Object.freeze({ renderId: 1, latestRenderId: 1 });

describe("renderMermaidDiagram", () => {
  it("returns the sanitized SVG for a valid diagram", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>';
    const renderer = rendererReturning(svg);
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, OPTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(svg);
  });

  it("rejects oversized diagram sources before rendering", async () => {
    const renderer = vi.fn(async () => "");
    const huge = "flowchart TD\n" + "  A".repeat(200_000);
    const result = await renderMermaidDiagram(huge, renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
    expect(renderer).not.toHaveBeenCalled();
  });

  it("fails fast when the source declares too many nodes", async () => {
    const renderer = vi.fn(async () => "");
    const source = Array.from({ length: 600 }, (_, index) => `  N${index}[node ${index}]`).join(
      "\n",
    );
    const result = await renderMermaidDiagram(`flowchart TD\n${source}`, renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });

  it("rejects output that carries a forbidden SVG tag", async () => {
    const renderer = rendererReturning(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_OUTPUT");
  });

  it("rejects output that carries a forbidden attribute", async () => {
    const renderer = rendererReturning(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onload="alert(1)" /></svg>',
    );
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_OUTPUT");
  });

  it("propagates renderer failures as RENDER_FAILED", async () => {
    const renderer: MermaidSvgRenderer = vi.fn(async () => {
      throw new Error("syntax exploded");
    });
    const result = await renderMermaidDiagram("flowchart TD\n  A --", renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RENDER_FAILED");
  });

  it("maps timeout-style renderer failures to RENDER_TIMEOUT", async () => {
    const renderer: MermaidSvgRenderer = vi.fn(async () => {
      throw new Error("Mermaid render exceeded the 2000ms timeout");
    });
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RENDER_TIMEOUT");
  });

  it("discards stale renders superseded by a newer source", async () => {
    const renderer = rendererReturning('<svg xmlns="http://www.w3.org/2000/svg" />');
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, {
      renderId: 2,
      latestRenderId: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STALE_RENDER");
  });

  it("keeps results immutable", async () => {
    const renderer = rendererReturning('<svg xmlns="http://www.w3.org/2000/svg" />');
    const result = await renderMermaidDiagram("flowchart TD\n  A --> B", renderer, OPTIONS);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
