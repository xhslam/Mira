# Android Release Checklist

**Last updated:** 2026-08-15

- [ ] Every required product-status row is implemented, not placeholder or partial.
- [ ] Format, lint, strict typecheck, unit, integration, and E2E checks pass from the final source snapshot.
- [ ] `expo prebuild --clean` reproduces native identity, icons, orientation, backup and permission policy.
- [ ] `npm run android:release` completes and verifies one DOM JavaScript bundle, one matching source map, and one HTML entry in every release asset stage.
- [ ] Release APK contains the native and verified DOM bundles and requires no Metro server.
- [ ] Final manifest contains only the expected Internet permission for direct AI-provider HTTPS access, with no overlay, camera, microphone, or broad-storage permission.
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
