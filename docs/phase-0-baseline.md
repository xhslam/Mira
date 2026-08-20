# VMark Mobile Phase 0 Baseline

Date: 2026-07-31  
Platform: Windows, PowerShell, repository branch `codex/vmark-mobile-upgrade`

## Repository State

The repository already contained substantial user-owned, uncommitted Inkstone editor work when this phase began. It was preserved without reset, cleanup, deletion, or file replacement, and the complete worktree was carried onto the requested upgrade branch. The comparison report's NoteRehearse paths and Supabase dependencies are absent from the current tree, so there is no legacy authentication route to migrate in this snapshot.

## Baseline Commands

Before the Phase 0 shell changes:

```text
npm test
12 test files passed
102 tests passed

npm run typecheck
passed with no TypeScript errors
```

## Phase 0 Acceptance Evidence

- Startup checks the real app-managed repository before showing the main UI.
- An empty repository opens workspace guidance without network or account requirements.
- The guide exposes the real app-managed workspace and labels linked folders as Phase 2 instead of creating a fake adapter or grant.
- Primary navigation contains Files, Search, AI, and Settings.
- Search, AI, and Settings show explicit future-phase boundaries.
- Existing private-vault files, recovery drafts, history, and any old application data are not deleted or rewritten by the shell change.
- The Expo identity is the independent placeholder brand Inkstone, not VMark.
- The Android manifest configuration blocks unrelated permissions and does not request general storage access.

## Deliberate Limits

- No NoteRehearse AsyncStorage migration reader exists in this repository snapshot because the report's cited legacy source files are absent. No legacy storage key was removed or modified.
- Linked Android SAF and iOS provider workspaces are Phase 2 and require native/device validation.
