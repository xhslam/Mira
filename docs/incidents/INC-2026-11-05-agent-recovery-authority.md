# INC-2026-11-05: Pre-release Agent recovery and authority review

- Date: 2026-11-05
- Scope: newly implemented Agent persistence and worker protocol, before deployment/release
- Evidence: injected storage corruption, deferred model promises, local HTTP integration and controllable-clock tests
- User impact: **no production data-loss, account access or external delivery incident was observed**. These defects were found during implementation review; no worker was deployed or real mailbox connected.

## Findings and fixes

| Risk                                                                        | Cause                                                                             | Replacement invariant and evidence                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery could undo a dismissal/pause or revert unknown delivery to pending | Automatic fallback loaded an older backup without reconfirming authority          | Primary failure now requires explicit recovery. All bytes are quarantined, newest valid prepared/backup source is disclosed, delegations paused, unresolved items reconfirmed and uncertain delivery fenced. Store/service recovery tests replace the original automatic-fallback test. |
| Model extraction blocked pause and other writes                             | Network await held the global serialized state queue                              | Persist run, extract outside queue, then revalidate run and delegation version/status. Deferred-extraction tests prove pause persists before the network resolves; late work cannot publish candidates/outbox. Cancellation and user completion during extraction are tested.           |
| A source-specific delegation could be converted to broader item review      | The first worker manifest omitted scope                                           | Exact `scope:["commitments"]` is mandatory on both client and worker. Unsupported active scope fails before upload; no active item authority means no item upload. Unconfirmed candidates and note bodies are excluded.                                                                 |
| Unknown ack could permanently leave a pending server result                 | Client advanced cursor before ack succeeded                                       | App results are saved before ack; cursor advances only after idempotent ack. An actual local HTTP test loses the response after server receipt, restarts the client and proves no duplicate execution/results. Disk failure prevents ack entirely.                                      |
| Clock rollback could invalidate already accepted snapshots                  | Upload freshness checks were reused during database reads                         | Persisted manifests receive structural validation only; future-time validation applies on upload. Clock rollback/cross-day tests prove the scheduler does not crash or duplicate an occurrence.                                                                                         |
| Terminal failures were not distinguishable from not-yet-run jobs            | Result API exposed successful outbox only                                         | Authenticated workspace-scoped recent-runs API exposes finite-retry terminal states and fixed error codes, including across restart; App shows failed worker checks.                                                                                                                    |
| Retired drawing recovery could block all navigation                         | Read-only text retained a dirty-save obligation that could no longer be fulfilled | Recovery text remains inspectable/exportable, but is not dirty pending writeback. Native writes and conflict/history bypasses are fenced. Original and recovery files remain unchanged; close/reopen/orphan/export regression tests cover the path.                                     |

## Operational boundaries

The mobile file queue is process-local; it is not a distributed lock. A user-configured worker has independent state and must receive synced cancellation. A completed server run is not a system notification. The implementation does not weaken native cleartext policy, CSP or editor focus protections to pass tests.

## Verification and remaining work

The final automated counts and export outcome are recorded in [the verification record](../verification/2026-11-05-personal-agent.md). Relevant suites include `tests/unit/agent/`, `tests/unit/agent-worker/`, `legacy-drawing-retirement`, `legacy-recovery-preservation`, `personal-agent-ui-regression`, existing English-coach queues/handoff and DOM packaging guards.

Physical-device storage failure/recovery, original file hashes, recovery text share chooser, keyboard/focus, real HTTPS pairing, long-running service and process-kill walkthroughs remain release gates. No APK/installation/device or real-account result is inferred from these automated tests.
