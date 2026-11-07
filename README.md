# Mira

Mira is an Android-first, local-first personal-agent workspace built with Expo 57 and React Native. The primary navigation is **Personal Agent → 学习 → 笔记 → 设置**, with Personal Agent as the default destination. The existing installed native identity is retained to avoid an unintended data migration.

## Current Product

- Personal Agent: persistent commitments, explicit recurring-delegation drafts and confirmation, on-demand omission review, source coverage, evidence-backed candidates, snooze/correction/completion, result history and conversations.
- An independent, optional [Node 24 worker](services/agent-worker/README.md) with authenticated workspace-scoped synchronization, daily timezone scheduling, restart recovery and durable App-result delivery. It reviews only uploaded, approved item snapshots; it is not a deployed cloud service.
- Learning resources, sentence practice and English coach. English coach now belongs to Learning rather than the former AI/Markdown mode switch.
- Local Tiptap WYSIWYG, CodeMirror source/Source Peek, lossless Markdown/math, structured-text and Mermaid support, verified saves, recovery/history, search and backups.
- Optional direct-to-provider AI with OS-secured keys, explicit note context, separately authorized workspace search and review-only note proposals. Existing provider profiles and conversation data remain accessible.
- The drawing feature and Excalidraw runtime are retired. Existing `.excalidraw`/`.excalidraw.md` files are preserved as read-only source and can be shared without rewriting. Old recovery drafts remain accessible through the editor's “绘图恢复草稿” action and can be exported as verified plain text.

**Current boundaries:** no connected mailbox/message/calendar account, no system push delivery, no automatic cloud deployment and no guaranteed mobile background timing. Without a configured worker, recurring checks run only when the App opens/returns to the foreground. Worker results explicitly state their uploaded-snapshot timestamp. Chat does not itself create a running delegation or mark an item done; those operations require the Agent controls.

See [Product Status](docs/product-status.md), [Architecture](docs/architecture.md) and [Privacy](docs/privacy.md). Source tests and an Android bundle export do not substitute for an APK or physical-device acceptance.

## Requirements

- Node.js 24 and npm (Node 24 is required for the optional native TypeScript/SQLite worker)
- Java 17 and Android SDK for native builds

## Develop And Verify

```sh
npm ci
npm start
npm run format:check
npm run lint
npm run typecheck
npm test
npm run export:android -- --clear
```

The App uses user-configured HTTPS AI providers and, only after explicit pairing/sync, a user-configured HTTPS worker. There is no Mira-operated backend, telemetry or advertising SDK. Only selected note context goes to an AI provider; worker synchronization sends approved item metadata/delegations, not note bodies or provider keys. Loopback HTTP is accepted by the client for local development only and does not relax native network policy.

## Android Package

Generated `android/` output is intentionally ignored. Regenerate it from `app.config.ts` before a native build so identity, icons, orientation, backup policy, keyboard behavior, and blocked permissions are reproducible:

```sh
npx expo prebuild --platform android --clean --no-install
npm run android:release
```

The release command removes only generated DOM-component asset directories before bundling, forces a fresh Expo embed, and fails unless the generated, merged, and compressed release stages each contain exactly one JavaScript bundle, one matching source map, and one HTML entry. This prevents incremental Gradle builds from packaging obsolete hashed editor bundles.

Inspect and install only the fresh APK produced by that source snapshot. A locally generated release variant uses development signing unless a production keystore is supplied; packaging alone does not prove product completeness or device behavior.

`npm run android` and `app-debug.apk` are development-only: they intentionally load JavaScript from
Metro and will show “Unable to load script” when the phone cannot reach port 8081. For an offline,
standalone phone install, use `npm run android:release` and install
`android/app/build/outputs/apk/release/app-release.apk`. The release script forces production mode,
disables DOM bundle splitting, auto-detects a compatible Android Studio/Gradle JDK when `JAVA_HOME`
is unset, and verifies that both the native bundle and the embedded editor bundle are present before
accepting the APK.

## Storage And Recovery

Private notes and metadata live below the application's document directory. Each edit is acknowledged in native state immediately, a recovery draft is written after 750 ms idle, and a verified workspace save begins after two seconds idle. A note is shown as `Saved` only after read-back hash verification. Clearing app data or uninstalling removes the private vault and supplemental history.

Mira has no account, analytics, advertising SDK, or Mira-operated backend. AI is optional and uses API credentials supplied by the user. See [Privacy](docs/privacy.md), [Architecture](docs/architecture.md), [Maintenance History](docs/maintenance-history.md), and [Release Checklist](docs/release-checklist.md).

## Agent State And Optional Worker

Agent authority is stored separately from rebuildable search SQLite in `Paths.document/personal-agent/`. A write is published only after read-back verification. Corrupt authority requires explicit recovery; original slot bytes are quarantined, delegations are paused, open items require reconfirmation and uncertain delivery is not replayed. Do not clear App data to repair it.

Worker endpoint/result cache is separate, and its credential uses OS SecureStore. Pairing only verifies the service; the UI's explicit sync uploads current approved scope and receives durable results. Edits and pauses affect a remote worker only after another successful sync. “暂停全部委托并断开” first persists and syncs pauses; offline disconnect cannot claim the remote jobs stopped. Uninstalling the App does not revoke or stop an independently hosted worker.

Worker setup and protocol: [services/agent-worker/README.md](services/agent-worker/README.md).
