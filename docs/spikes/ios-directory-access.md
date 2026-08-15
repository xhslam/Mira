# iOS Directory Access Spike

Status: **IMPLEMENTED - native build/device acceptance deferred**

## Device And System

- Host: macOS 26.5.2, Apple Silicon.
- Apple tooling: Command Line Tools only; full Xcode, Simulator, and iOS signing are unavailable.
- iOS device: none connected.

## Minimum Reproduction

Repository branch: codex/vmark-mobile-upgrade.

Relevant implementation boundary:

- modules/inkstone-workspace-access/ios/InkstoneWorkspaceAccessModule.swift
- src/workspace/workspace-grant-service.ts
- src/workspace/expo-workspace-grant-service.ts
- src/app/app-services.ts

The Expo local module creates security-scoped bookmark data, resolves and refreshes stale bookmarks, starts scoped access for the restored directory, and releases active scopes when the module is destroyed. The provider-neutral grant service persists only a versioned grant payload and maps malformed/revoked grants to explicit reauthorization.

## Steps

1. Added the local Expo Swift module and TypeScript wrapper.
2. Connected directory selection, bookmark creation, persisted restoration, stale refresh, and runtime workspace URI resolution.
3. Added grant-service tests for creation, restoration, stale refresh, malformed data, and revoked access.
4. Verified Expo Apple autolinking discovers `inkstone-workspace-access`.

## Results

- The implementation and host-side contract tests are complete.
- Expo Apple autolinking discovers the module and its Swift pod.
- Swift compilation and authorize/restart/write-back cannot be claimed without full Xcode and a device; that acceptance gate is intentionally deferred.

## Failure Modes To Exercise On macOS

- User cancels directory selection.
- Bookmark data is malformed, stale, or revoked.
- Security-scoped resource access fails.
- Provider is read-only, offline, or does not support replace/move.
- Access stops while a document is dirty.
- Two saved records resolve to the same provider directory.

## Architecture Decision

Keep WorkspaceRepository provider-neutral. Implement iOS linked workspaces behind a native adapter that owns document-picker authorization, serialized security-scoped bookmark data, scoped-access lifetimes, and capability reporting. UI code must never receive raw provider handles.

The architecture is implemented. It remains release-unapproved until one iPhone and one iPad/simulator run the complete authorize, write, process restart, restore, and write sequence.

## Threshold Impact

No implementation-document threshold is relaxed. The restore target remains P50 <= 500 ms and P95 <= 1 s, measured on hardware. Until measured, linked iOS workspaces remain unavailable rather than falling back to an unverified copy.

## Data Safety Invariants

- A stale grant must show reauthorization, never create an empty replacement workspace.
- The app must not write outside the selected directory.
- Failed or capability-limited writes must not display Saved.
- The app-managed recovery journal remains required before provider writes.
