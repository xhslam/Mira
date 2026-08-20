# Mermaid Stress Test Spike

Status: **IMPLEMENTED - physical render/export benchmark deferred**

## Device And System

- Host: macOS 26.5.2, Apple Silicon, Node 24.15.0.
- Android emulator evidence: API 36.
- Mermaid 11.16.0 is bundled offline.
- Physical Android/iOS devices: not tested.

## Minimum Reproduction

`src/formats/mermaid/renderer.ts` renders through an injected SVG renderer with limits (256 KiB, 500 nodes, 1,000 edges, 2,000-char labels), a 2 s timeout race, a stale-render guard, and SVG sanitization enforced before output reaches the DOM. `src/formats/mermaid/mermaid-preview.tsx` supplies bundled `mermaid.render` inside the DOM WebView, configures Mermaid's own edge limit to the same 1,000-edge boundary, and keeps the last valid preview on failure. Run `npm run spike:phase1:bench` for actual parser measurements.

## Required Fixture Matrix

- Normal flowchart, sequence, class, state, ER, and Gantt diagrams.
- Malformed syntax and deeply nested input.
- Maximum text, node, and edge boundaries plus one-over-limit cases.
- Links, callbacks, HTML labels, SVG event handlers, foreignObject, and external URLs.
- Cancellation, 2-second timeout, rotation, repeated rendering, and export.
- PNG/SVG output followed by SVG whitelist sanitization.

## Current Results

- Renderer, limit checks, 2 s timeout, stale-render guard, and SVG sanitization are implemented and unit-tested.
- Host parser means for ordinary diagrams range from 0.2443 ms to 1.6559 ms. The exact 500-node/1,000-edge boundary parses in a 63.3325 ms mean (67.4754 ms maximum in the recorded run).
- Physical full render/layout/export latency, memory, and sanitization remain unmeasured.
- The malicious Mermaid/SVG release gate requires the physical-device stress run.

## Failure Modes

- Script/event execution or external navigation.
- Main-thread freeze, runaway layout, or WebView out-of-memory.
- Late render overwrites a newer source revision.
- Unsafe SVG survives export sanitization.

## Architecture Decision

Do not add a preview placeholder or CDN renderer. Phase 5 must bundle Mermaid offline inside an isolated WebView/worker, force strict security, enforce measured text/node/edge limits, cancel stale renders, stop at two seconds, and sanitize exported SVG independently.

## Threshold Impact

The implementation-document target remains P50 <= 500 ms and P95 <= 1 s for ordinary diagrams, with a hard 2-second abort. Limits will be selected from device measurements, not weakened to make pathological fixtures pass.

## Data Safety Invariants

- Diagram source is inert text.
- No click callback, script, external resource, arbitrary navigation, or filesystem bridge.
- Timeout/failure preserves the last valid preview and never changes source content.
