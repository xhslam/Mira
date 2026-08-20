# Architecture Decision Index

**Last updated:** 2026-08-15

This index tracks decisions against the approved VMark Mobile implementation document. A proposal is not implementation evidence; each decision becomes accepted only after its phase gate and required device checks pass.

| ID      | Decision                                                  | Status                           | Current evidence / next gate                                                                                                                                                                                     |
| ------- | --------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | React Native shell with a bundled WebView editor core     | Accepted for foundation          | Incremental edits, correlated flush, API 36 process-kill recovery, bounded renderer remount, labels, and touch targets are implemented; forced renderer-death, physical IME/screen-reader, and iOS gates remain. |
| ADR-002 | The authorized filesystem is the document source of truth | Accepted for managed workspace   | The app-private repository owns Markdown content and verifies writes; SQLite is not present. Linked providers remain Phase 2 work.                                                                               |
| ADR-003 | Format capability registry                                | Proposed                         | Phase 4 must implement and contract-test the registry before non-Markdown formats are added.                                                                                                                     |
| ADR-004 | Code and diagrams are never executed                      | Accepted as a security invariant | Current Markdown WebView blocks arbitrary navigation and sanitizes rendered HTML. Mermaid and binary/code adapters remain unimplemented.                                                                         |
| ADR-005 | AI produces revision-checked proposals only               | Implemented in code              | Chat, Genies, and automations can create proposals but cannot write directly; apply rechecks note identity, source content, and editor revision. Installed-device/provider verification remains.                 |
| ADR-006 | Lossless bounded math rendering pipeline                  | Accepted                         | Exact-pair tokenization, render-only normalization, restricted KaTeX, offline fonts, 28 focused tests and 26/26 physical-device formulas pass. See [`ADR-006`](ADR-006-lossless-math-rendering.md).              |

Authoritative descriptions are in `docs/VMark-Mobile-实现文档.md`, sections 14.1-14.5. Phase sequencing and gates are in `docs/VMark-Mobile-升级对比报告.md`, section 8.
