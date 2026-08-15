# Large File Performance Spike

Status: **IMPLEMENTED - rendered physical-device benchmark deferred**

## Device And System

- Host: macOS 26.5.2, Apple Silicon.
- Runtime: Node 24.15.0, Vitest 4.1.10.
- Android physical-device editor measurements: not available.

## Minimum Reproduction

Run npm run spike:phase1. Benchmark source is tests/spikes/protocol.bench.ts.

## Results

Latest host run:

| Operation                              |       Mean |        P99 |
| -------------------------------------- | ---------: | ---------: |
| Derive one-character change in 500 KiB |  2.0364 ms |  2.1894 ms |
| Apply one-character change in 500 KiB  |  0.0481 ms |  0.4432 ms |
| Derive one-character change in 5 MiB   | 20.6732 ms | 20.8074 ms |
| Validate one-character bridge message  |  0.0038 ms |  0.0052 ms |

These numbers cover the native/WebView change boundary only. They do not measure Tiptap parsing, CodeMirror layout, WebView memory, keyboard latency, or provider I/O.

## Missing Measurements

- 500 KiB Markdown Source open and WYSIWYG open on physical Android/iOS.
- 1, 5, 20, and 21 MiB policy transitions.
- Peak JavaScript/native memory and recovery-journal write duration.
- Scroll, search, rotation, background/foreground, and mode-switch behavior.

## Failure Modes

- Full-document rerender on each native acknowledgement.
- Main-thread pause while deriving or applying a change.
- WebView process termination under memory pressure.
- Recovery write amplification for multi-megabyte drafts.
- A large file bypasses the format registry and opens in WYSIWYG.

## Architecture Decision

Keep the implementation-document size policy unchanged:

- below 1 MiB: normal applicable views;
- 1-5 MiB: source by default, WYSIWYG opt-in;
- 5-20 MiB: confirmed source/streaming only;
- 20 MiB or more: no full mobile edit.

The Format Registry owns this policy and the workspace open command enforces it before reading: 1-5 MiB defaults to source, 5-20 MiB requires explicit confirmation and source/stream mode, and files above 20 MiB are rejected without changing content.

## Threshold Impact

Host protocol results fit within the 50 ms key budget, but they are insufficient to approve device performance. All published P50/P95 targets remain unchanged.

## Data Safety Invariants

- Size rejection must not truncate or rewrite the source file.
- Recovery and save errors remain explicit.
- Large input must not bypass the 2 MiB inbound bridge payload limit.
