# Product Requirements

The authoritative product design is [VMark-aligned Mobile Native Markdown Notes](../docs/superpowers/specs/2026-07-30-vmark-mobile-native-markdown-notes-design.md).

## Foundation Milestone

Foundation establishes a bootable Expo 57 application and pure TypeScript contracts for:

- portable workspace paths and opaque identities;
- immutable document session revisions;
- strict, size-bounded editor snapshot messages;
- provider-independent, verified repository operations;
- byte-for-byte Markdown source preservation;
- an editor-first mobile composition root.

Foundation is complete when formatting, linting, strict type checking, unit/contract tests, and Android source export pass. It deliberately does not satisfy the product design's release criteria for native persistence, a functional editor, APK generation, installation, or device smoke testing.
