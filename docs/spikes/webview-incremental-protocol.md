# WebView Incremental Protocol Spike

Status: **IMPLEMENTED - forced-crash device evidence deferred**

## Device And System

- Host benchmark: Windows 11, Node 22.21.1.
- Android smoke: API 36 emulator with current release APK.
- APK SHA-256: C4D99CA85841110568362215CEA61E4268DB85B5E9B904E3508D1A68576F8503; size: 80,624,016 bytes (76.889 MiB).
- Physical-device WebView crash and background-flush tests: not run.

## Minimum Reproduction

- src/editor-bridge/text-change.ts
- src/editor-bridge/editor-message.ts
- src/editor-kernel/editor-kernel.dom.tsx
- src/app/editor-renderer-recovery.ts
- src/app/workspace-state.ts
- tests/unit/editor-bridge/text-change.test.ts
- tests/unit/editor-bridge/editor-message.test.ts
- tests/unit/editor-bridge/editor-flush.test.ts
- tests/unit/app/workspace-state.test.ts
- artifacts/spikes/phase1-switch-first-restored.png
- artifacts/spikes/phase1-switch-first-restored.xml
- artifacts/spikes/phase1-switch-second-restored.png
- artifacts/spikes/phase1-switch-second-restored.xml
- artifacts/spikes/phase1-flush-background.xml
- artifacts/spikes/phase1-flush-confirmed.png
- artifacts/spikes/phase1-flush-confirmed.xml
- artifacts/spikes/phase1-clean-release-cold.xml
- artifacts/spikes/phase1-clean-release-background.xml
- artifacts/spikes/phase1-clean-release-save.png
- artifacts/spikes/phase1-clean-release-save.xml

Run the editor-bridge and workspace-state unit tests, then npm run spike:phase1.

## Steps And Result

The initial audit failed: every edit emitted editor.snapshot with the complete Markdown document.

The spike then implemented:

- document.change messages with ordered UTF-16 ranges;
- minimal common-prefix/common-suffix edit generation;
- strict schema, protocol, identity, revision, count, and UTF-8 payload validation;
- strict, deeply immutable schemas for every required protocol message family;
- immutable native change application;
- out-of-range/overlap rejection;
- an identity-aware base guard that rejects older props for the same document but accepts a new document at revision 0.
- a correlated background/manual-save flush that drains queued changes before native persistence and refuses to report Saved on timeout.

For a one-character edit in 500 KiB, serialized envelope size fell from 512,253 bytes to 292 bytes, a 99.94% reduction. Source-mode editing reached verified save on the API 36 emulator. A two-document regression smoke then created and saved BridgeSecond731, switched to the older 27-character document, and switched back; both exact contents and Saved states remained paired with the correct tabs, with no bridge error.

The flush build then inserted Flush731 in Source mode, moved the app to the background, and resumed with the exact 23-character text BridgeSeFlush731cond731 at Saved. Save now completed through the same request/session/document/revision-correlated acknowledgement without a bridge or flush error.

The clean release package contains exactly one hashed DOM JavaScript bundle, one matching source map, and one HTML entry. Reinstalling that exact artifact preserved BridgeSeFlush731cond731 through force-stop/cold launch, background/resume, and Save now. Android renderer-process-gone and iOS content-process-terminated callbacks now remount from native Document Session state, wait for a newly validated editor.ready, cap automatic remounts at three, and expose Retry editor after exhaustion. Runtime proof of a forced isolated-renderer death remains open because the production API 36 image denies renderer kill and adb root, while trim-memory did not terminate Chromium.

## Remaining Protocol Work

All approved message names have strict schemas. The Phase 1 Markdown path connects editor readiness, typed document-open props, incremental changes, selection changes, diagnostics, correlated save/flush, and bounded renderer recovery. Export messages are owned by their later format/export feature paths. Forced renderer-crash recovery still needs runtime proof on a rootable emulator or physical-device workflow.

## Failure Modes

- Missing/reordered revision.
- Range outside the current native document.
- More than 1,000 operations or more than 2 MiB inserted bytes.
- Native acknowledgement arrives after a newer local edit.
- WebView dies with an unflushed composition.

## Architecture Decision

Adopt incremental document.change as the edit transport and a correlated document.saveRequested acknowledgement as the persistence barrier. Retain complete snapshots only for bounded initialization/recovery until document.open is connected. Never inject arbitrary JavaScript strings.

## Threshold Impact

The bridge no longer dominates the 500 KiB key budget on the host benchmark. Device P50/P95 remains unapproved until traced on physical hardware.

## Data Safety Invariants

- Every message is schema-, protocol-, session-, document-, and revision-checked.
- Invalid changes leave native state untouched.
- A missing or mismatched flush acknowledgement blocks verified save and surfaces Recovery only.
- The WebView never owns filesystem access or the only copy of a draft.
