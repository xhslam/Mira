export const MERMAID_LIMITS = Object.freeze({
  maxSourceBytes: 256 * 1024,
  maxNodes: 500,
  maxEdges: 1_000,
  maxTextPerNode: 2_000,
  renderTimeoutMs: 2_000,
} as const);

export type MermaidLimitCheck = Readonly<{
  allowed: boolean;
  reason: string | null;
}>;

export function checkMermaidSourceLimits(source: string): MermaidLimitCheck {
  const sourceBytes = new TextEncoder().encode(source).byteLength;
  if (sourceBytes > MERMAID_LIMITS.maxSourceBytes) {
    return Object.freeze({
      allowed: false,
      reason: `Diagram source exceeds the ${MERMAID_LIMITS.maxSourceBytes}-byte limit.`,
    });
  }

  const nodeMatches = source.match(
    /(?:^\s*(?:[A-Za-z_][\w-]*|"[^"]*")\s*(?:\[|\(|\{|>--|-->|---|-\.->|==>|--x|-.->))/gm,
  );
  if ((nodeMatches?.length ?? 0) > MERMAID_LIMITS.maxNodes) {
    return Object.freeze({
      allowed: false,
      reason: `Diagram declares more than ${MERMAID_LIMITS.maxNodes} nodes.`,
    });
  }

  const edgeMatches = source.match(/(?:-->|---|-.->|-\.->|==>|--x|==x)/g);
  if ((edgeMatches?.length ?? 0) > MERMAID_LIMITS.maxEdges) {
    return Object.freeze({
      allowed: false,
      reason: `Diagram declares more than ${MERMAID_LIMITS.maxEdges} edges.`,
    });
  }

  const longestLabel = Math.max(
    ...source
      .split(/\r?\n/)
      .map((line) => line.trim().length)
      .concat([0]),
  );
  if (longestLabel > MERMAID_LIMITS.maxTextPerNode) {
    return Object.freeze({
      allowed: false,
      reason: `A single diagram label exceeds ${MERMAID_LIMITS.maxTextPerNode} characters.`,
    });
  }

  return Object.freeze({ allowed: true, reason: null });
}

export function createRenderTimeout(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Mermaid render exceeded the ${ms}ms timeout`));
    }, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

export function isStaleRender(renderId: number, latestId: number): boolean {
  return renderId !== latestId;
}
