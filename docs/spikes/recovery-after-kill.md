# Recovery After Process Kill Spike

Status: **IMPLEMENTED - physical/forced-renderer acceptance deferred**

## Device And System

- Emulator: Android 16/API 36, sdk_gphone64_x86_64.
- Recovery-test APK SHA-256 (before the identity-aware bridge fix): 730E21BDB02268D95C3761AAF86B618A20675980C944660C22B241D173AC4B30.
- Current clean release APK SHA-256: C4D99CA85841110568362215CEA61E4268DB85B5E9B904E3508D1A68576F8503; size: 80,624,016 bytes (76.889 MiB).
- Physical Android/iOS devices: not tested.

## Minimum Reproduction

- src/recovery/private-vault-recovery-store.ts
- src/app/use-editor-workspace.ts
- src/app/workspace-state.ts
- src/app/app-shell-screen.tsx
- src/app/editor-renderer-recovery.ts
- tests/unit/recovery/private-vault-recovery-store.test.ts
- tests/unit/workspace/private-vault-repository.test.ts
- artifacts/spikes/phase1-recovered.png
- artifacts/spikes/phase1-recovered-direct.png
- artifacts/spikes/phase1-clean-release-cold.xml
- artifacts/spikes/phase1-clean-release-background.xml
- artifacts/spikes/phase1-clean-release-save.png
- artifacts/spikes/phase1-clean-release-save.xml
- corresponding XML hierarchy files

## Steps

1. Cleared app data and opened the app-managed empty workspace.
2. Entered the unique text RecoverySpike731.
3. Waited 1,000 ms after input: beyond the 750 ms recovery timer but before the 2,000 ms autosave timer.
4. Force-stopped app.inkstone.markdown with ADB.
5. Cold-started the release activity.
6. Inspected the rendered text and native save state.
7. Fixed the shell after the first run showed guidance despite a valid recovery-only draft.
8. Rebuilt/reinstalled while preserving data and repeated cold start.
9. Reinstalled the clean release APK, force-stopped and cold-launched it, then repeated background/resume and Save now against the same artifact.

## Results

- Exact text restored: RecoverySpike731.
- Native status: Recovery only, proving it was not falsely reported as saved.
- After the shell fix, recovery-only state opens Files directly without an extra onboarding action.
- Current cold launch with recovery: 1,643 ms on the emulator.
- Unit tests also prove store recreation, failed-write retention, and removal only after verified save.
- The clean release restored BridgeSeFlush731cond731 at exactly 23 characters and Saved after force-stop/cold launch, background/resume, and Save now.
- Android render-process-gone and iOS content-process-terminated callbacks now remount the editor from native Document Session state, wait for a validated editor.ready, cap automatic recovery at three attempts, and expose an explicit Retry editor action after exhaustion.
- Forced renderer-death proof remains open: kill -9 against the isolated Chromium process was denied on the production emulator, adb root was unavailable, and trim-memory did not terminate the renderer.

## Remaining Tests

- Physical Android force-stop and low-storage failure.
- iOS process termination.
- Forced WebView renderer-process crash while the native process survives, on a rootable emulator or physical-device workflow.
- Kill before the 750 ms journal acknowledgement and explicit UI semantics for unconfirmed input.
- Rapid edits during an in-flight verified save are covered at the state boundary: an older save acknowledgement advances the base hash but keeps the newer revision dirty. Physical timing stress remains deferred.

## Architecture Decision

Keep native recovery storage independent from the document repository. Startup must consider both finalized documents and recovery journals. A draft is removed only after read-back verified save.

## Threshold Impact

The recovery requirement is not relaxed. Emulator evidence is useful but does not satisfy the Phase 1 physical-device gate.

## Data Safety Invariants

- Recovery-only content must be visible and labeled honestly.
- Failed saves retain the draft.
- External changes stop overwrite and enter conflict state.
- No test may treat process memory as durable evidence.
