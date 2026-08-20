# Inkstone Architecture

**Last updated:** 2026-08-15

## Runtime Layers

```text
React Native workspace shell
  -> immutable workspace/session state
  -> repository, recovery, and history contracts
  -> Expo app-private filesystem adapter

Bundled Expo DOM WebView
  -> Tiptap WYSIWYG
  -> CodeMirror Source and Source Peek
  -> validated revision bridge -> native workspace state
```

The WebView receives no filesystem handle. It loads bundled code, rejects arbitrary navigation, uses a restrictive CSP, and sends versioned snapshots that native code validates for identity, revision order, shape, and a 2 MiB UTF-8 limit.

## Lossless Math Rendering

Markdown math uses a bounded exact-pair tokenizer rather than a cross-line regular expression. Tiptap
math nodes retain the original Markdown `raw` value as their serialization source. Common provider escape
layers, nested math delimiters and line-level Markdown contamination are repaired only in a temporary
render copy; editor mode changes and KaTeX rendering never rewrite the note.

KaTeX runs offline with bundled WOFF2 fonts, HTML plus MathML output, `trust: false`, bounded macro
expansion and visual size, and stable error codes for empty, oversized, unsupported or invalid formulas.
Inline and display formulas have mobile overflow containment. The accepted invariants and physical-device
failure evidence are recorded in [ADR-006](adr/ADR-006-lossless-math-rendering.md) and
[INC-2026-08-15](incidents/INC-2026-08-15-markdown-math-rendering.md).

## Persistence

`PrivateVaultRepository` stores Markdown files plus a catalog of opaque document IDs and confirmed hashes. Writes use pending and backup files, read-back verification, and rollback. Expo's filesystem API does not expose a proven atomic replace primitive, so the repository correctly reports `atomicReplace: false`; recovery drafts remain the crash-safety boundary.

Recovery drafts store the latest dirty native revision. They are removed only after verified save. History stores immutable verified states separately, throttles autosave snapshots, and prunes by age, per-document count, and global bytes. History failure degrades history only and never changes a verified file save into failure.

SQLite is derived/application state, never document truth. Idempotent migrations create workspace, file index, Unicode FTS5, history, editor session, backup, and bounded search-query tables. Repository and history decorators update the index only after successful source writes. Workspace startup runs an integrity check, deletes a corrupt derived database, and rebuilds current file and history rows from filesystem-backed repositories. Sensitive/hidden paths and certificate/key files are excluded; code files index filenames only by default. Editor-session rows contain identity, view, selection and dirty state but no document body or recovery blob.

`.vmbak` archives are versioned ZIP files with `manifest.json`, `files/`, and `checksums.json`. Restore preflight enforces entry and expanded-byte ceilings, normalized workspace paths, manifest count, version, and SHA-256 for every file before touching the target. Restore uses fail, replace, or collision-free keep-both and records inverse operations so a later failure rolls back earlier creates/replacements. Manual backups use random app cache plus the system share sheet. Automatic backup is opt-in to a system-selected directory, checked on launch/foreground rather than promising exact background execution, records outcome metadata in SQLite, and removes only generated archives exceeding age/count retention. The current `WorkspaceRepository` is editable-text scoped, so binary attachment backup remains an explicit product boundary.

## State Rules

- Values crossing module boundaries are parsed and frozen.
- A save advances the base hash only after repository verification.
- One workspace write runs at a time; edits during a write schedule a newest-revision follow-up.
- External modification pauses autosave while recovery continues.
- History restore first saves dirty current text, then opens the chosen version as a new dirty revision.

## Editor Focus Ownership

The editor WebView and the native shell split focus responsibility explicitly:

- **DOM focus lives in the kernel only.** No bridge path blurs the editor. The flush path used to call `document.activeElement.blur()`, which on Android detaches the WebView from the native window-focus system; the next tap then flashed the keyboard and lost focus ("first tap works, later taps fail"). Flushes now commit any pending IME composition explicitly and drain the revision queue without touching focus.
- **Keyboard visibility lives in the native shell.** `Keyboard.dismiss()` runs only on explicit user actions (hide-keyboard button, opening the drawer/search/AI overlay, switching documents, switching tabs, toggling editor mode). Keyboard state is not the same as edit state: autosave, content sync, and backgrounding never dismiss the keyboard or exit editing.
- **Selection ownership switches with focus.** While the kernel is focused, the editor owns selection: incoming native selections are echoes and are ignored unless content was replaced. While unfocused, the native shell owns selection (document open, mode switch, search navigation, restore).
- **Editor WebView containers are never detached.** Inactive tab destinations stay attached as a 1x1 touch-transparent frame instead of `display: none`, because unmounting a WebView on Android also destroys its focus/keyboard association.
- The kernel records an opt-in, sequence-numbered focus event stream (`enableEditorFocusDiagnostics()`) for device-level triage of focus regressions; it is disabled in production.

## Provider Boundary

The editor and UI depend on workspace contracts, not Expo filesystem details. `WorkspaceRepository` remains the managed Markdown session source of truth. Phase 2 now defines immutable `WorkspaceGrant`, `WorkspaceCapability`, `FileEntry`, `FileStat`, and command contracts. `WorkspaceCatalogStore` validates grant metadata without deleting provider files, while `WorkspaceManager` serializes authorize, restore, select, rename, pin, and remove operations, preserves stable identities for duplicate grants, and records revoked access explicitly. `createExpoWorkspaceAdapter` navigates Expo `Directory`/`File` handles with conservative provider capabilities; `createWorkspaceAdapterRepository` adds bounded traversal, deterministic linked-file IDs, expected-revision writes, and read-back verification before the document session can report success.

`WorkspaceBrowser` is separate from the Markdown-only repository. Managed browsing derives file metadata and implicit directories from verified document snapshots. Linked browsing recursively requests provider metadata without reading file bodies and fails closed above 10,000 entries or 32 levels. Create, rename, move, copy, removal, Trash, and sharing are capability-gated; the UI does not advertise theoretical platform support. Managed file creation and copy support revision-verified replace plus collision-free keep-both. Managed rename and move support keep-both, while replace remains hidden until a provider or repository can perform it transactionally without partial success.

The file drawer builds the required format groups plus a real directory tree, searches by path, and sorts by name, modification time, format, or size at every tree level. Capability-aware actions connect create, rename, move, copy, and remove. The new-entry menu supports blank files, folders when the provider allows them, and immutable offline Markdown templates; every path still goes through the same verified create and collision flow. Path-changing commands first request an editor flush and verified save, then reload the Markdown session with a new session identity while preserving or translating the active path when possible. Successful normal saves update browser metadata immutably without rescanning the provider. Non-Markdown files remain visible but are not routed into the Markdown editor.

Recent files and favorites are durable, bounded, validated file-activity metadata scoped by stable workspace ID. Opening an existing file updates its recent position without blocking the editor when metadata persistence fails. Favorite changes report persistence failures and keep the previous UI value. Rename and move translate file and directory subtrees in the activity index; removal clears the affected subtree. The drawer exposes Recent and Favorites views, a discoverable More button, and the same action menu on long press.

Expo 57's public `File` and `Directory` objects expose copy, move, and rename methods, but the Android SAF provider matrix for same-tree rename, cross-directory move, replacement, and recursive directories remains unproven on physical providers. Linked Workspace therefore keeps those mutating capabilities disabled. Sharing has a narrower verified boundary: the adapter resolves an authorized file, copies it directly to a random app-cache `file://` target without decoding binary data in JavaScript, and `expo-sharing` opens the system panel. The cache URI and MIME type are validated and the active Markdown document crosses the flush/save barrier first. Successful attachments remain in OS-managed cache for 24 hours so receiving apps can read them after the chooser returns; failed shares clean up immediately, and later shares prune only expired `inkstone-share-*` files. The app does not enable `expo-sharing`'s optional incoming-share extension.

The immutable format registry is the only source of extension/MIME capability selection. The current linked repository factory intentionally exposes only Markdown because the production UI still has a Markdown editor; structured data, Mermaid, code, unknown-text, and binary adapters are registered but are not routed into an incompatible editor. Android SAF URI persistence comes from Expo's `ACTION_OPEN_DOCUMENT_TREE` implementation. The workspace picker and production linked-workspace activation are connected, with repository and scoped-recovery preflight before startup or selection reports readiness. Physical Android SAF verification remains a release gate. iOS Expo directory access is explicitly session-only, so a native security-scoped bookmark service is still required before claiming iOS linked-workspace persistence.
