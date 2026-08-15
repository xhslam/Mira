# CodeMirror IME Spike

Status: **IMPLEMENTED - physical composition acceptance deferred**

## Device And System

- Emulator: Android 16/API 36, sdk_gphone64_x86_64.
- Installed IME: Gboard/LatinIME, English subtype only.
- Physical Android and iOS devices: not tested.
- Chinese Pinyin, Japanese, Korean, hardware keyboard, and dictation: not tested.

## Minimum Reproduction

- Editor: src/editor-kernel/editor-kernel.dom.tsx
- Native bridge: src/editor-bridge/editor-message.ts
- Incremental change logic: src/editor-bridge/text-change.ts
- Artifact: artifacts/spikes/phase1-source-smoke.png
- UI hierarchy: artifacts/spikes/phase1-source-smoke.xml
- Current bridge regression artifacts: artifacts/spikes/phase1-switch-first-restored.png and artifacts/spikes/phase1-switch-second-restored.png

## Steps

1. Installed the current release APK on the API 36 emulator.
2. Restored a journaled document.
3. Selected Source mode.
4. Focused CodeMirror and injected SourceSmoke with ADB key events.
5. Closed the keyboard and inspected text, character count, and save state.

## Results

- CodeMirror accepted the edit at the selected cursor position.
- Native state changed from 16 to 27 characters.
- The write reached verified Saved.
- After the identity-aware bridge fix, Source mode created and saved BridgeSecond731 in a new revision-0 document; switching away and back restored it exactly.
- This proves source editing and bridge delivery, not IME composition correctness: ADB key injection bypasses Gboard's composition lifecycle.
- The editor kernel now buffers composing CodeMirror/Tiptap updates, suppresses intermediate bridge changes, and emits exactly the latest committed text after `compositionend`. Immutable unit tests cover update replacement, single commit, and empty/non-composing behavior.

## Required Composition Matrix

- Android physical device with current Gboard Chinese Pinyin.
- iPhone with Apple Simplified Chinese Pinyin.
- Composition start/update/end without intermediate duplicate snapshots.
- Candidate replacement, undo/redo, cursor movement, selection replacement, newline, backspace, and mode switching.
- WYSIWYG and Source modes with screen reader off/on.

## Failure Modes

- Composition text committed twice.
- Undo removes only part of a composed character sequence.
- Native rerender resets cursor or replaces newer local text.
- Switching modes commits an unfinished composition incorrectly.
- Surrogate pairs or combining marks are split at incremental offsets.

## Architecture Decision

Retain CodeMirror 6. The bridge sends minimal UTF-16 changes, ignores older native rerenders, and commits composition only at its end. CodeMirror remains release-unapproved until the physical Chinese composition matrix passes.

## Threshold Impact

No latency threshold is relaxed. Key-to-visible update remains P50 <= 50 ms and P95 <= 100 ms on a mid-range physical device.

## Data Safety Invariants

- Composition must never be represented as a successful file save until the native revision is accepted and verified.
- Rejected revisions keep the editor content visible and surface a bridge error.
- Invalid or stale changes cannot alter native document state.
