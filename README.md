# VMark Mobile Foundation

This directory contains the Expo 57 foundation for an Android-first, local-only Markdown notes app. The current screen is a non-interactive editor workspace shell. The domain layer already defines validated workspace paths, immutable document sessions, a strict editor bridge envelope, a provider-neutral repository contract, and lossless source bytes.

## Requirements

- PowerShell 7 (`pwsh`)
- Node.js 22 and npm 10
- Java 17 for later Android native builds

## Setup And Checks

Run from `vmark-mobile/`:

```powershell
npm ci
npm start
npm run format:check
npm run lint
npm run typecheck
npm test
npx expo export --platform android
```

`npm start` launches Metro for source preview. `expo export` produces a JavaScript/Hermes bundle in `dist/`; it does not produce or install an APK.

## Current Boundaries

- Identity: `Markdown Notes Dev` and `dev.local.vmarkmobile` are development-only. Public naming and the stable package ID remain release gates.
- Privacy: application source has no account, analytics, backend, or runtime network call. Metro and npm may use the local development network and package registry.
- Storage: Foundation includes only an in-memory repository contract harness. It has no private-vault persistence or Android Storage Access Framework adapter.
- Editing: the visible canvas is not editable yet. There is no WebView editor, autosave, recovery draft, search, or attachment flow.
- Packaging: no APK has been built or installed. `adb` is not currently available on `PATH`.

The next milestone is the safe editing vertical slice: one real Markdown document, editor bridge integration, recovery-first verified persistence, and Android installation evidence.
