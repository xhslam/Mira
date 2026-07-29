# Foundation Architecture

## Dependency Direction

```text
App.tsx -> src/app -> pure domain contracts
                         ^
platform adapters -------|
```

The React Native composition root owns presentation and later platform lifecycle integration. Pure TypeScript modules own state and boundary semantics. Domain modules do not import React Native, Expo filesystem APIs, Android APIs, or Node-only modules.

## Modules

- `src/domain`: frozen `Result` values and validated opaque identifiers.
- `src/workspace/workspace-path.ts`: portable relative-path validation and NFC normalization.
- `src/session`: immutable editor snapshot transitions and confirmed-save state.
- `src/editor-bridge`: protocol v1 schema validation, identity binding, revision ordering, and the 2 MiB UTF-8 limit.
- `src/workspace/*repository.ts`: storage-provider contract and deterministic memory harness.
- `src/markdown`: exact source bytes, decoded Markdown, line-ending metadata, and injected hashing.
- `src/app`: the non-interactive editor-first shell.

The memory repository is test infrastructure, not production storage. A private-vault adapter and a later SAF adapter must implement the same contract without leaking provider names into editor UI code. The WebView editor will receive no filesystem authority; native code will parse messages and own verified saves.
