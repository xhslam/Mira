# Agent memory, references and rich text verification — 2026-11-07

## Automated checks

- 146 Vitest files, 839 tests passed, including actual SQLite memory persistence/reopen, legacy message migration, workspace isolation, evidence-backed memory tools, provider tool round trips, reference provenance, opt-out and rich-text/link boundaries.
- Strict TypeScript, Expo ESLint, repository Prettier and `git diff --check` passed.
- Android export passed after the final context-row change. The existing asset script verified the single DOM bundle and installed offline KaTeX fonts. This verifies JavaScript/DOM packaging, not a standalone APK or physical-device installation.

## Android UI checks

On the Android API 35 `paper_test_api35` emulator, the existing debug native shell loaded the current Metro source. No model credentials were configured. The context picker opened and read memory from the real local SQLite store. Manual and scripted checks exercised creation and reopening of a saved memory; the stored content remained present in the editor/list.

The user's screenshot showed a full-width memory/reference strip above the note context. The final implementation puts memory, note and web controls in one wrapping row, with equal minimum height, icon size, horizontal padding and corner radius. Android UI hierarchy bounds for the memory control were `[33,1893][314,2014]`, and the `Reference.md` note control was `[336,1893][666,2014]`: the top and bottom edges match. Narrow widths can wrap whole controls; long note paths remain single-line ellipsized text. The integration regression protects the shared container.

The optional `.maestro/08-agent-memory.yaml` flow requires an empty test-workspace memory list and no provider. It creates a temporary entry, closes/reopens the picker, edits it and deletes it. This flow deliberately stops short of real-provider requests. The full final flow outcome is recorded below after execution.

## Limits

The provider-facing integration uses a fake streaming provider and real SQLite, not a real account. Natural-language saving needs a provider that supports tools. No automatic background extraction, cross-workspace/global memory, executable generated UI, charts or chat math renderer is claimed. Physical-device keyboard, large fonts, screen readers, real-provider round trips and standalone-release acceptance remain unverified for this change.

## Final memory UI flow

The final Maestro 08 run passed every required step: empty-state guard, new memory title/content, save, picker close/reopen, edit/save, visible edited content, delete and return to the empty state. The temporary `Memory QA` entry was removed by the flow. Earlier attempts found a keyboard-space problem (fixed by hiding policy controls while editing), a test-only partial erase caused by tapping into the middle of text (the final flow verifies insertion/editing instead), and a Metro startup timing issue (the flow now waits for the Agent entry before proceeding). Optional workspace-onboarding taps were not needed on the configured emulator.

## Native rich-text smoke check

Two temporary emulator-only conversation fixtures verified a restored reference count and source title, native heading and bold text, a three-row table, quotation, checked task items, fenced TypeScript with copy control and a documentation link. The hierarchy showed aligned task marks and content after filtering Marked's separate checkbox token; no duplicate `[x]` text remained. Both temporary conversations and their messages were subsequently removed by their generated IDs; all other records were retained and SQLite `integrity_check` returned `ok`. This fixture check does not claim a live provider response or external-link/clipboard action.
