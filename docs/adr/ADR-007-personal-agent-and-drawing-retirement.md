# ADR-007: Personal Agent authority, execution boundaries and drawing retirement

- Status: Accepted for the 2026-11-05 implementation; device release gates remain open.
- Date: 2026-11-05

## 2026-11-06 update

Mira no longer exposes commitments, delegations, review reports, or worker pairing. The mobile runtime no longer initializes the legacy store, runs foreground catch-up, or includes legacy records in chat requests. The format, historical data and standalone worker remain available independently. The navigation and drawing decisions still apply.

## Context

The product is moving from Learning/Notes/AI/Drawings/Settings to a proactive personal-agent workspace. A chat transcript is not an authoritative task ledger, a foreground Expo callback is not a persistent worker, and an unconnected mailbox is not checked evidence. Removing drawing UI alone would leave the editor runtime, dependency/fonts and file-write behavior inconsistent.

## Decisions

1. **Product navigation:** `agent → learn → files → settings`, default Agent. English coach belongs to Learning. Existing Provider, secure-key, conversation, proposal and learning stores are reused rather than reset.
2. **Authority:** immutable validated commitments, delegations, runs, reports and outbox live in a separate workspace-scoped versioned file store. Rebuildable search databases cannot contain the only copy of this authority. A successful mutation requires verified readback and a revision match; storage failure cannot publish optimistic success.
3. **Recovery is an authorization boundary:** a corrupt primary requires explicit recovery, never silent fallback. Before replacement, all original slot bytes are preserved in quarantine. The highest valid recovery slot may be prepared/uncommitted and must be disclosed. Recovery pauses delegations, moves unresolved items to reconfirmation and fences uncertain delivery as unknown. Future schemas are not downgraded. This is not a claim of filesystem atomic replace or a cross-process mobile file lock.
4. **Candidate evidence:** only user-confirmed items become actionable. The read-only model boundary accepts explicit note snapshots and returns evidence-backed candidates; missing evidence, foreign workspace IDs and unknown fields fail validation. External text cannot grant scopes or send messages. Check coverage includes failures, missing authorization and disconnected sources.
5. **Network work outside the write queue:** persist the run, release the state queue during extraction, then re-enter and recheck run/delegation status/version/authority. Pause and edits cannot wait behind a model request. Aborted, timed-out or late unauthorized work cannot create a deliverable result. Occurrence IDs prevent automatic replay, including failed/unknown runs.
6. **Execution and delivery:** App foreground catch-up is best-effort. A separately provisioned Node 24 worker owns its own SQLite transactions, daily IANA-timezone occurrences, leases, bounded retries and result outbox. The current worker only accepts the precise `commitments` scope and does not execute natural-language prompts. It never reads the phone filesystem or Provider keys.
7. **Sync:** explicit HTTPS-origin pairing and a workspace allowlist are required. Uploads contain approved item metadata, not notes or unconfirmed candidates. The App durably stores and deduplicates results before idempotent ack; an unknown ack must remain retryable without job re-execution. Recent failed runs are separately observable. Remote cancellation requires successful sync; local disconnect is not server revocation.
8. **Drawing retirement:** remove drawing UI, creation, editor/runtime, npm dependencies and font packaging. Preserve `.excalidraw` and `.excalidraw.md` as read-only source, prevent native snapshots/history/conflict/recovery paths from rewriting them, retain raw share/export and preserve old recovery drafts including orphaned drafts. Read-only drafts must not hold the entire workspace in a dirty-save deadlock. Markdown drawing references still round-trip unchanged.
9. **Unchanged editor invariants:** WebView focus/IME/selection, flush-before-save, KaTeX, CSP/navigation isolation, unique DOM bundle/source map, backup/recovery and strict TypeScript remain release requirements.

## Alternatives rejected

- Rename the existing AI chat and call it proactive: no durable task state or proven execution.
- Put Agent authority into rebuildable search SQLite: corruption recovery could erase user decisions.
- Automatically recover an older active schedule: can undo a pause/dismissal or replay uncertain delivery.
- Run long model calls under the single-writer queue: prevents timely pause/cancellation.
- Transform any source scope into local-item review: silently expands authorization.
- Delete old drawings or render them as editable Markdown: risks user-data loss/rewrite.
- Treat notification API acceptance or polling ack as human receipt: unsupported delivery claim.

## Consequences and release gates

There is no deployed always-on service, real mailbox/message/calendar connector or system push in this change. Users can work locally without a model, and can independently provision the documented worker. Native storage, long-running hosting, real credentials, phone networking, UI/keyboard/large-font and installation lifecycle still require device acceptance. Automated contracts and Android export evidence are recorded separately; they cannot substitute for those gates.

Related: [maintenance ledger](../maintenance-history.md), [pre-release recovery/authority review](../incidents/INC-2026-11-05-agent-recovery-authority.md), [worker protocol](../../services/agent-worker/README.md).
