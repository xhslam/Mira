# VMark Provenance

The editor foundation was compared with a local VMark checkout at tag `v0.9.7`, commit `440ed31`. The Phase 7 AI assistant additionally vendors the 13 built-in English Genie prompt templates and their frontmatter semantics from the official `xiaolai/vmark` repository at commit `7e248a557fed26830e6496ced266ee4e967d549d`, paths `src-tauri/resources/genies/{editing,creative,structure,tools}/*.md`. Each serialized source asset is locked by a SHA-256 contract test.

The 13 prompt assets are the only VMark source copied by Phase 7. Mira's React Native UI, provider adapters, permissions, proposal logic, automation runtime, artwork, name, and visual identity remain independent. VMark's ISC notice is retained in `THIRD_PARTY_NOTICES.md` and exposed from the in-app settings screen.

The existing project `LICENSE` covers Mira's scaffold material; it is not a VMark license claim. The VMark material remains under its original ISC terms as reproduced in `THIRD_PARTY_NOTICES.md`.
