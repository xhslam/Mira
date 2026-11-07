# Android Release Checklist

**Last updated:** 2026-11-05

- [ ] Every required product-status row is implemented, not placeholder or partial.
- [ ] Format, lint, strict typecheck, unit, integration, and E2E checks pass from the final source snapshot.
- [ ] `expo prebuild --clean` reproduces native identity, icons, orientation, backup and permission policy.
- [ ] `npm run android:release` completes and verifies one DOM JavaScript bundle, one matching source map, and one HTML entry in every release asset stage.
- [ ] Release APK contains the native and verified DOM bundles and requires no Metro server.
- [ ] Final manifest contains only the expected Internet permission for user-configured AI-provider and optional paired-worker HTTPS access, with no overlay, camera, microphone, or broad-storage permission.
- [ ] APK package/version, signer class, timestamp, size, and SHA-256 are recorded.
- [ ] Exact APK installs on the named emulator/device and cold-starts with Metro stopped.
- [ ] Create/edit/all modes/save/force-stop/reopen/search/drawer/history/conflict and AI proposal smoke journeys pass.
- [ ] DeepSeek/OpenAI-compatible streaming, secure-key restart, native web citations, whole-workspace permission denial, cancellation, and latest-only automation catch-up pass with test credentials.
- [ ] Phone, tablet, landscape, keyboard, large-font, and TalkBack layouts are inspected.
- [ ] Light and dark themes render every screen with readable contrast; the theme preference persists across launches.
- [ ] Math regression tests cover inline/block `$`, `$$`, `\(`, `\[`, exact escaped-delimiter pairing, currency false positives, matrix row breaks, malformed source and the 16,384-character ceiling.
- [ ] The physical-device mixed-escape fixture renders every formula with zero `data-math-error` nodes in WYSIWYG and reading modes.
- [ ] Switching WYSIWYG, Source and Reading modes leaves the source document SHA-256 unchanged.
- [ ] Release DOM assets contain KaTeX WOFF2 fonts and formulas retain script, fraction, radical, delimiter and superscript glyphs with Metro disconnected.
- [ ] KaTeX remains untrusted and bounded (`trust: false`, `maxExpand`, `maxSize`); invalid formulas degrade to safe text with a stable error code.
- [ ] The final release evidence and any new incident are appended to [`maintenance-history.md`](maintenance-history.md) before tagging.
- [ ] Privacy, provenance, known limitations, and signing status match the artifact.

## Personal Agent / drawing retirement release gate

- [ ] Four destinations and sidebar agree; startup/workspace reactivation default to Personal Agent.
- [ ] Today, commitments, delegation draft/confirmation/pause, result coverage, history conversation and model settings work on phone/tablet and large fonts.
- [ ] English coach opens from Learning, successful pause precedes return, failed saves retain the draft, and saved expressions open sentence practice.
- [ ] Both legacy drawing suffixes open read-only source, cannot unlock or write via native snapshots/history/conflict paths, and share original bytes. Original hashes remain unchanged.
- [ ] Legacy recovery drafts (including missing originals) can be reopened, closed without save deadlock and explicitly exported; neither source nor recovery is deleted.
- [ ] Export/release has no Excalidraw runtime/font dependency; KaTeX, unique DOM bundle, source map and security checks still pass.
- [ ] Agent writes fail visibly on storage exhaustion; a damaged primary requires explicit recovery, retains quarantined originals and never reactivates pauses/unknown delivery.
- [ ] Omission checks use only the declared sources, preserve uncertainty and require candidate confirmation; absent mailbox authorization is never presented as a checked mailbox.
- [ ] Pausing/changing scope during an in-flight model request persists immediately and rejects late unauthorized publication.
- [ ] Worker is explicitly provisioned and paired over HTTPS; workspace denial and revoked credentials fail closed. No native network policy was weakened for setup.
- [ ] Sync visibly discloses item/path/delegation upload, omits original notes/Provider keys/unconfirmed candidates, persists before ack and recovers unknown ack after restart.
- [ ] Completed/paused changes reach the worker after sync; failed offline cancellation is visible. Uninstall/disconnect does not falsely claim to revoke a still-running server.
- [ ] Worker daily/DST/restart/lease/retry/capacity/clock-rollback and recent failed runs are verified on a long-running host.
- [ ] App result reception is not labelled system push or read receipt; real email/notification validation remains blocked until those integrations exist.
