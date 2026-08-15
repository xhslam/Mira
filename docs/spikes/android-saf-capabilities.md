# Android SAF Capabilities Spike

Status: **IMPLEMENTED - physical provider acceptance deferred**

## Device And System

- Emulator: Medium_Phone_API_36.0
- Device model: sdk_gphone64_x86_64
- Android: 16, API 36
- Resolution/density: 1080 x 2400 at 420 dpi
- Physical Android device: not connected

## Minimum Reproduction

Repository branch: codex/vmark-mobile-upgrade. Build the release APK with Expo prebuild and Gradle, then inspect it with AAPT from Android SDK build-tools 36.0.0.

## Steps

1. Built the release package from the current branch.
2. Installed it on the API 36 emulator.
3. Inspected merged permissions with AAPT.
4. Audited source for ACTION_OPEN_DOCUMENT_TREE, persisted URI permissions, and a content-resolver repository.

## Results

- APK SHA-256: C4D99CA85841110568362215CEA61E4268DB85B5E9B904E3508D1A68576F8503.
- APK size: 80,624,016 bytes (76.889 MiB).
- The packaged WebView editor contains exactly one current JavaScript bundle, one matching source map, and one HTML entry; stale hashed bundle generations were removed before assembly.
- Declared permission is limited to the app-local dynamic-receiver permission.
- No Internet, legacy external-storage, media, camera, microphone, or overlay permission is present.
- Managed app-private storage works. Expo 57's `Directory.pickDirectoryAsync` starts Android `ACTION_OPEN_DOCUMENT_TREE` and calls `takePersistableUriPermission`; the picker, persisted workspace catalog, grant restoration/reauthorization, and `createExpoWorkspaceAdapter` are connected to the app services. Provider operations expose explicit read/write/create/remove capabilities and preserve recovery state on failure.
- Unit/contract coverage exercises picker cancellation, duplicate grants, invalid/revoked grants, capability-limited operations, browsing, and write-back behavior. Physical SAF provider behavior remains deferred.
- A virtual SD card notification is not evidence of SAF capability.

## Failure Modes To Exercise

- Picker cancellation and duplicate tree selection.
- Persisted grant revoked between launches.
- Read-only, offline, slow, and non-atomic providers.
- Rename/move unsupported or implemented as copy/delete.
- Document ID changes while URI remains stable.
- Provider returns cyclic, malformed, or unexpectedly large listings.

## Architecture Decision

Use the Expo 57 SAF implementation of ACTION_OPEN_DOCUMENT_TREE and persisted URI grants behind the provider-neutral workspace adapter. Capabilities are returned per workspace and unsupported actions stay hidden.

Broad storage permissions are not an acceptable fallback.

## Threshold Impact

The 1,000-entry first-screen target remains P50 <= 300 ms and P95 <= 600 ms on a physical mid-range Android device. Provider enumeration should stream pages into immutable snapshots; it must not block editor saves.

## Data Safety Invariants

- Every URI operation must remain below the persisted tree grant.
- Grant loss must be explicit and recoverable.
- Provider write failure must preserve the recovery journal and never display success.
- Remove-workspace deletes only the app record, never provider content.
