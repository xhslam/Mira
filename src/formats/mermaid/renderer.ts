import { failure, type Result, success } from "../../domain/result";
import { checkMermaidSourceLimits, createRenderTimeout, MERMAID_LIMITS } from "./limits";
import { checkSvgSafety } from "./svg-safety";

export type MermaidRenderErrorCode =
  "LIMIT_EXCEEDED" | "RENDER_TIMEOUT" | "RENDER_FAILED" | "UNSAFE_OUTPUT" | "STALE_RENDER";

export type MermaidRenderError = Readonly<{
  code: MermaidRenderErrorCode;
  reason: string;
}>;

export type MermaidSvgRenderer = (source: string) => Promise<string>;

export type RenderMermaidDiagramOptions = Readonly<{
  renderId: number;
  latestRenderId: number;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = MERMAID_LIMITS.renderTimeoutMs;

function renderError(
  code: MermaidRenderErrorCode,
  reason: string,
): Result<never, MermaidRenderError> {
  return failure(Object.freeze({ code, reason }));
}

/**
 * Renders a Mermaid diagram through an injected renderer with every spike
 * invariant enforced in sequence:
 *
 * 1. Source limits are checked before any rendering work starts.
 * 2. Rendering races a 2 s timeout and never blocks the main thread.
 * 3. Stale renders (a newer source revision superseded this one) are discarded.
 * 4. The resulting SVG is checked against the tag/attribute/style safety rules.
 *
 * The renderer itself is injected so this module stays runnable in Node tests;
 * the DOM WebView provides `mermaid.render` as the production implementation.
 */
export async function renderMermaidDiagram(
  source: string,
  renderer: MermaidSvgRenderer,
  options: RenderMermaidDiagramOptions,
): Promise<Result<string, MermaidRenderError>> {
  const limits = checkMermaidSourceLimits(source);
  if (!limits.allowed) {
    return renderError(
      "LIMIT_EXCEEDED",
      limits.reason ?? "Diagram source exceeds the Mermaid safety limits.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let svg: string;
  try {
    svg = await Promise.race([renderer(source), createRenderTimeout(timeoutMs)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mermaid rendering failed.";
    if (/timeout/i.test(message)) {
      return renderError("RENDER_TIMEOUT", message);
    }
    return renderError("RENDER_FAILED", message);
  }

  if (options.renderId !== options.latestRenderId) {
    return renderError("STALE_RENDER", "A newer source revision superseded this render.");
  }

  const safety = checkSvgSafety(svg);
  if (safety.dangerous) {
    return renderError(
      "UNSAFE_OUTPUT",
      "The rendered diagram contained blocked SVG content and was discarded.",
    );
  }

  return success(svg);
}
