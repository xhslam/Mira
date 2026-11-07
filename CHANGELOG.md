# Changelog

**Last updated:** 2026-09-21

## Unreleased

- Split Craft into direct manual manuscript creation and an advanced recording/AI workflow, removing the duplicate advanced mode.
- Add the Inkstone identity and reproducible application artwork.
- Add bundled Tiptap and CodeMirror editing modes with a mobile workspace shell.
- Add verified private-vault persistence, recovery drafts, autosave, persistent history, and conflict resolution.
- Lock down WebView navigation and Android release permissions.
- Enforce large-file open policy and security-profile render boundaries from the format registry.
- Add schema-checked constructors for every editor protocol message family and consume diagnostics, selection, and export requests on the native side.
- Block window.open in the editor kernel as an additional WebView navigation boundary.
- Migrate structured validators (JSON/JSONL, YAML, TOML), a collapsible structured tree model, and Mermaid source/SVG safety policies from the xiaolai/vmark reference.
- Route file opening by format: any editable text format opens in the editor with source mode, structured tree preview, and live parse diagnostics.
- Add light/dark design tokens with a persisted system/light/dark theme preference and a settings screen (appearance, editor, storage, security & privacy).
- Replace regex-only math parsing with a bounded, lossless Markdown math pipeline that supports common model escape layers, exact delimiter pairing, safe KaTeX rendering, mobile overflow, and stable error diagnostics.
- Verify 26/26 formulas from the physical-device failure document in WYSIWYG and reading modes without rewriting the note.
- Build and install a standalone Android release with bundled KaTeX fonts, verified DOM/native assets, signer-preserving replacement, and no Metro dependency.
- Add a maintenance ledger, incident postmortem, ADR, and mandatory math/release regression gates.
