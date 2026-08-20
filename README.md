# Inkstone

Inkstone is an Android-first, local-first Markdown notes app built with Expo 57 and React Native. Its root screen is a touch-oriented editor workspace inspired by VMark's information architecture, with an independent name, icon, and visual identity.

## Current Product

- Bundled local Tiptap WYSIWYG editor and CodeMirror Source / Source Peek modes.
- Bundled offline Excalidraw canvas with Apple Pencil/touch input, iPad layouts, automatic recovery,
  standard `.excalidraw` import/export, and Obsidian-compatible `.excalidraw.md` files whose text is
  searchable alongside Markdown notes.
- App-private `.md` workspace with stable document IDs, verified read-back saves, recovery drafts, autosave, tabs, outline, and full-text session search.
- Persistent verified history with manual/autosave sources, five-minute autosave throttling, 30-day/100-version/256 MiB retention, preview, and non-destructive restore.
- External-change detection with local/external preview, load-external, and collision-free save-copy actions.
- Locked-down WebView navigation, sanitized rendered HTML, inert remote-media placeholders, and explicit system-browser confirmation.
- Phone and iPad/tablet layout, landscape and split-view support, safe areas, keyboard accessory
  controls, and 44-48 dp touch targets.
- Optional direct-to-provider AI chat for DeepSeek and other OpenAI-compatible APIs, with OS-secured keys, explicit note context, review-only writes, catch-up automations, and provider-native web search.
- All 13 VMark AI Genie transformations with their official prompt behavior, searchable quick actions, streaming suggestions, and segmented diff review.

Inkstone supports its app-managed private vault and mounted platform folders, system-picked local attachments, extended Markdown editing/rendering, and persistent themes. Backlinks/graph and HTML/PDF/bundle export remain product-scope gaps; see [Product Status](docs/product-status.md). The project must not be described as a complete public release until the listed device release gates pass.

## Requirements

- Node.js 22 and npm 10
- PowerShell 7
- Java 17 and Android SDK for native builds

## Develop And Verify

```powershell
npm ci
npm start
npm run format:check
npm run lint
npm run typecheck
npm test
npm run export:android -- --clear
```

The standalone app permits HTTPS networking only for user-configured AI providers. It has no Inkstone backend, telemetry, advertising SDK, or independent web-search service. Notes are sent only as current or manually selected context unless the separate whole-workspace AI permission is enabled.

## Android Package

Generated `android/` output is intentionally ignored. Regenerate it from `app.config.ts` before a native build so identity, icons, orientation, backup policy, keyboard behavior, and blocked permissions are reproducible:

```powershell
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

Inkstone has no account, analytics, advertising SDK, or Inkstone-operated backend. AI is optional and uses API credentials supplied by the user. See [Privacy](docs/privacy.md), [Architecture](docs/architecture.md), [Maintenance History](docs/maintenance-history.md), and [Release Checklist](docs/release-checklist.md).
