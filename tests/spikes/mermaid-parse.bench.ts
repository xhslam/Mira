// @vitest-environment jsdom

import mermaid from "mermaid";
import { bench, describe } from "vitest";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  maxEdges: 1_000,
});

const ordinaryDiagrams = Object.freeze({
  flowchart: "flowchart LR\n  A[Open] --> B{Valid?}\n  B -->|Yes| C[Edit]\n  B -->|No| D[Report]",
  sequence:
    "sequenceDiagram\n  participant App\n  participant Editor\n  App->>Editor: document.open\n  Editor-->>App: editor.ready",
  class:
    "classDiagram\n  class Document {\n    +string id\n    +save()\n  }\n  Document <|-- MarkdownDocument",
  state:
    "stateDiagram-v2\n  [*] --> Loading\n  Loading --> Ready\n  Ready --> Saving\n  Saving --> Ready",
  er: "erDiagram\n  WORKSPACE ||--o{ DOCUMENT : contains\n  DOCUMENT ||--o{ REVISION : has",
  gantt:
    "gantt\n  title Phase 1\n  dateFormat YYYY-MM-DD\n  section Host\n  Audit :done, 2026-08-01, 1d",
});

function stressFlowchart(nodeCount: number, edgeCount: number): string {
  const nodes = Array.from({ length: nodeCount }, (_, index) => `  N${index}[Node ${index}]`);
  const edges = Array.from({ length: edgeCount }, (_, index) => {
    const from = index % nodeCount;
    const to = (index * 17 + 1) % nodeCount;
    return `  N${from} --> N${to}`;
  });
  return ["flowchart LR", ...nodes, ...edges].join("\n");
}

describe("bundled Mermaid parser", () => {
  for (const [name, source] of Object.entries(ordinaryDiagrams)) {
    bench(`parse ordinary ${name}`, async () => {
      await mermaid.parse(source);
    });
  }

  const maximumSupportedGraph = stressFlowchart(500, 1_000);

  bench(
    "parse the 500-node/1,000-edge boundary",
    async () => {
      await mermaid.parse(maximumSupportedGraph);
    },
    { iterations: 1, warmupIterations: 0 },
  );
});
