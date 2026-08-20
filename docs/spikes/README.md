# Phase 1 Spike Index

Phase 1 implementation status: **HOST/CODE COMPLETE; PHYSICAL-DEVICE GATE DEFERRED BY OWNER**.

`npm run spike:phase1` now runs the complete repeatable host audit: unit tests, strict TypeScript, lint, incremental-protocol and bundled-Mermaid benchmarks, iOS bookmark-module autolinking discovery, Android bundle export, and the captured Android accessibility-hierarchy audit. The remaining items are device/human acceptance evidence, not missing Phase 1 application code.

| Spike                        | Implementation | Deferred acceptance gate                                       |
| ---------------------------- | -------------- | -------------------------------------------------------------- |
| iOS directory access         | Complete       | Native compile and authorize/restart/write-back on iPhone/iPad |
| Android SAF capabilities     | Complete       | Physical document-provider matrix                              |
| CodeMirror IME               | Complete       | Physical Chinese/Japanese/Korean composition matrix            |
| Large-file performance       | Complete       | Render/memory P50/P95 on physical Android/iOS                  |
| WebView incremental protocol | Complete       | Forced isolated-renderer death on a controllable device        |
| Mermaid stress               | Complete       | Physical render/export P50/P95 and memory                      |
| Recovery after kill          | Complete       | Physical process/renderer termination matrix                   |
| Editor accessibility         | Complete       | Human TalkBack and VoiceOver walkthrough                       |

This status does not waive or claim the physical-device gate. It records the owner's decision to continue without running it now. Before release, execute the deferred matrix and attach the resulting device artifacts to these reports.
