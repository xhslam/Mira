# Local AI Workspace Design

**Date:** 2026-08-01  
**Status:** User-approved revision, independent spec review passed
**Scope:** Phase 7 AI chat, note tools, local catch-up automations, and provider-native web search

## 1. Outcome

Mira gains an AI workspace that connects directly from the device to user-configured model providers. The AI can answer questions, use explicitly bounded note tools, search the whole workspace only when the user grants that permission, and propose note changes through a revision-safe diff. Local automation tasks run when the app opens or returns to the foreground and send all note changes to a review queue.

The first release requires no Mira-operated backend. Secrets, conversations, task schedules, audit records, and proposals remain on the device. Only the context needed for a model request leaves the device.

## 2. Confirmed Product Decisions

- Users configure a base URL, API key, model name, and provider type.
- API keys are stored in the operating system's secure secret storage.
- The default AI context is the current note plus notes the user adds manually.
- A separate permission allows AI to search the entire workspace. The user controls this permission.
- Read-only note actions can execute directly. Every mutation exposed now or in the future produces a proposal and diff; the first release exposes create, append, and replace only.
- A proposal is applied only after explicit user confirmation.
- Automated tasks never bypass proposal review.
- Automations run locally when the app launches or returns to the foreground. Each task catches up only its most recent missed occurrence.
- Web search uses only a model provider's native search capability. Mira does not integrate a separate search vendor in this release.
- UI direction follows the approved V2 mockup: one primary action per region, icon-only secondary destinations with accessibility labels, plain-text status indicators, lightweight context chips, and collapsed tool details.
- The editor ports VMark's 13 built-in AI Genies for selection, block, and document transformations. It uses the same proposal and permission boundaries as chat.

## 3. Non-goals

- Exact background execution while the app is closed
- A Mira cloud service, proxy, account system, or secret synchronization
- A standalone web-search API such as Tavily or Brave Search
- Unreviewed AI writes or autonomous destructive actions
- Binary-file editing by AI
- Automatic traversal of hidden, sensitive, excluded, or unsupported workspace paths
- Cross-device conversation, proposal, or automation synchronization
- A general plugin or agent protocol
- CLI model providers, MCP exposure, user-authored Genie files, or multi-stage Genie workflows

## 4. Architecture

The feature uses a modular local runtime with narrow, immutable contracts.

### 4.1 Presentation

- `AiWorkspaceScreen` owns navigation among chat, proposal inbox, and automation management.
- `AiConversationView` renders messages, streaming state, citations, tool summaries, and inline proposal cards.
- `AiContextPicker` shows the current note, manually attached notes, and the whole-workspace-search permission state.
- `AiQuickAssistant` opens from an editor selection, block, document, or AI toolbar action and renders a focused streaming suggestion.
- `AiProposalInbox` groups pending (including partially applied), applied, rejected, failed, and stale proposals.
- `AiAutomationScreen` creates, edits, enables, disables, and reports local tasks.
- Provider settings add, validate, test, and remove model profiles without exposing stored keys after entry.

Presentation code never calls a workspace repository or provider transport directly. It dispatches typed commands to the runtime and renders immutable state.

### 4.2 Core runtime

- `AiConversationService` builds requests, streams normalized provider events, runs bounded tool rounds, and persists conversation events.
- `AiQuickActionService` resolves a built-in action contract, captures an exact editor scope, requests its declared output kind, and returns either read-only commentary or a validated insertion/replacement proposal.
- `AiContextPolicy` determines which note bodies and search results may be supplied to the model.
- `AiToolExecutor` validates every tool name and argument, rechecks runtime authorization, executes read-only tools, and routes mutations to proposals.
- `AiProposalService` creates revision-bound diffs and applies confirmed proposals through existing workspace save boundaries.
- `AiCatchUpScheduler` calculates due tasks on launch and foreground, claims executions idempotently, and records outcomes.
- `AiAuditStore` records provider requests without secrets or full note bodies, tool decisions, proposal transitions, and automation outcomes.

### 4.3 Adapters

- `OpenAiCompatibleChatProvider` supports Chat Completions-style streaming and function calls for DeepSeek and compatible vendors.
- `OpenAiResponsesProvider` supports the Responses event model and provider-native web search.
- `AiWorkspaceTools` adapt existing `WorkspaceRepository`, `WorkspaceBrowser`, and `WorkspaceSearch` contracts.
- `AiStore` persists non-secret AI data in the existing local SQLite layer.
- `AiSecretStore` wraps OS secure storage and exposes opaque profile-key lookup.

Provider responses are parsed as unknown input and normalized into frozen domain events. Provider-specific payloads do not leak into presentation or tool code.

## 5. Provider Profiles and Secrets

A provider profile contains:

- Stable local profile ID
- User-visible name
- Provider adapter type
- Validated HTTPS base URL
- Model identifier
- Non-secret capability settings
- Reference to an API key in secure storage
- Last connection-test status and time

The API key is never written to SQLite, logs, backups, exported conversations, error reports, or React component state beyond the entry transaction. The settings UI displays only whether a key exists and offers replace/remove actions.

Removing a profile also removes its secure secret. Conversations retain their historical provider label, but tasks that reference the profile become paused with a visible reason. The deletion flow must identify affected tasks before confirmation.

Connection testing uses a minimal provider request and distinguishes authentication, endpoint, model, rate-limit, network, timeout, and response-shape failures. A successful generic connection test does not claim native web-search support.

## 6. Native Web Search

Web search capability belongs to a provider adapter, not to the generic OpenAI-compatible profile.

- OpenAI Responses profiles may expose a native `web_search` tool when the configured model supports it.
- DeepSeek Chat Completions profiles support function calling for Mira's local tools but do not advertise native web search unless DeepSeek publishes and the adapter implements an official API capability.
- Unsupported profiles do not show an enabled search control.
- Search-enabled requests display provider-returned source URLs and titles. Unparseable or missing citations are labeled as unavailable rather than invented.
- Automations that require web search are paused when their selected profile lacks the capability.

Provider web content is untrusted context. It cannot expand local tool permissions, approve a proposal, reveal secrets, or alter system instructions.

## 7. Context and Note Tool Permissions

### 7.1 Default context

Each conversation begins with the current note, when one is open. The user may add or remove other notes through workspace search. The context bar always shows the selected files.

No other note bodies are supplied to the provider by default.

Before sending an open current note, the runtime requests the existing editor flush barrier and uses the newest validated native session snapshot, including unsaved edits. This flush updates native session state but does not imply a repository save. The context UI labels the note as unsaved when applicable. If the renderer cannot provide a valid snapshot, the request stops rather than silently sending older repository content.

Manually attached closed notes use a fresh repository read at request time. Manually attaching a note grants that conversation access to the exact workspace and stable document identity until the user removes it or the conversation is deleted; path changes follow the existing stable identity when possible.

### 7.2 Whole-workspace permission

Settings include an `allowWholeWorkspaceAiSearch` permission. When disabled, the model cannot call a whole-workspace search tool. When enabled, the tool queries Mira's existing local index and returns bounded matches with path, excerpt, revision metadata, and stable result identifiers.

The UI displays whole-workspace permission state in every conversation. Each search tool result shows the matched file names and excerpts used. Existing sensitive-path, hidden-path, file-format, and indexing exclusions remain authoritative.

The tool returns only the bounded excerpts needed for selection. Full note bodies require a subsequent authorized read, making access visible in the tool trace and preventing accidental workspace-wide prompt construction.

Each whole-workspace result ID is an opaque, locally generated read grant bound to the conversation ID, current assistant run ID, workspace ID, stable document identity, path, and indexed revision. It expires when that assistant run ends. A later full-read call must present that result ID, the global permission must still be enabled, and a fresh stat must still match the bound identity and revision. Otherwise the read fails and the model must search again. A result in one conversation or run never authorizes another. Current-note and manually attached-note grants remain separate from these ephemeral search grants.

### 7.3 Tool catalog

Initial read-only tools:

- Read an authorized note
- Search manually selected notes
- Search the workspace when permission is enabled
- Read the current note's revision metadata

Listing or browsing workspace entries for the context picker is a UI-local operation, not a model-callable tool. The model can learn paths outside already authorized notes only through the whole-workspace search tool while its dedicated permission is enabled.

Initial proposal-only mutation tools:

- Create a text note
- Append text
- Replace a bounded range or the document body

Rename, move, delete, recursive operations, binary modification, settings changes, secret access, and automatic proposal approval are not exposed to the model in the first release.

All tool arguments use strict schemas and are reparsed locally. Unknown tools, extra properties, invalid paths, oversized content, excessive result counts, and tool-loop limits fail closed.

All adapters consume one central immutable limits policy. Initial ceilings are eight tool rounds per assistant run, 12 workspace-search results, 2 KiB of UTF-8 excerpt text per result, 128 KiB for a full note read, 512 KiB of total note/search context per request before provider token budgeting, 2 MiB for proposed editable text to match the existing repository boundary, and a 60-second network idle timeout. Providers may impose a lower limit but never raise these local ceilings. Retry backoff and attempt ceilings are likewise defined once in the scheduler policy rather than independently by transports.

## 8. Proposals and Writes

A proposal contains a stable ID, conversation or automation origin, target workspace and path, operation-specific preconditions, proposed content or patch, rendered diff metadata, explanation, lifecycle state, and timestamps.

Append and replace proposals for a closed note bind the stable document identity, path, base repository revision, and base content hash. For the open current note, they instead bind the document/session identity, validated native editor revision, and snapshot hash captured by the pre-request flush. Before apply, Mira flushes the editor again. If the identity, revision, or hash changed, the proposal is stale. If unchanged, Mira applies the proposed content through the editor/session boundary and then performs the existing verified save, so unsaved edits included in the model context are neither omitted nor overwritten.

Create proposals bind the target workspace, normalized target path, parent capability snapshot, and an `expected absent` precondition. Apply fails as stale/conflicted if the target now exists or the provider no longer supports creation. The first release never silently replaces or auto-renames a colliding path; the user must choose a new path and regenerate or revise the proposal.

Creating a proposal does not mutate the workspace. Applying one requires an explicit user action from an authorized review surface: the full diff screen or the quick assistant's inline diff. Both surfaces show the exact target and change, call the same proposal service, and enforce identical preconditions. Before apply, the service evaluates the operation-specific preconditions above. A mismatch marks the proposal stale or conflicted. Such a proposal cannot be forced over the file; the user may ask AI to regenerate it against current state.

Confirmed application reuses existing verified workspace writes, editor flush barriers, history, recovery, search-index synchronization, and capability checks. A verified repository failure leaves the proposal pending or failed with a retryable explanation and never reports success.

Rejected proposals remain in history until the user clears them. Deleting a conversation does not implicitly delete its proposals.

Quick-assistant text transformations create a segmented proposal unless their action contract requires whole-result validation. Segments are computed locally from the captured scope and returned text; the model does not choose diff boundaries. Each segment records `pending`, `applying`, `accepted`, `rejected`, `apply_failed`, or `stale` while sharing the proposal's base editor revision and snapshot hash.

Accepting one segment performs a revision check, applies one native editor revision/undo point, writes recovery, and completes the existing serialized verified save, history, and search-index synchronization before the segment becomes `accepted`. If persistence fails after the editor revision, the recovery draft and dirty editor state remain authoritative, the segment becomes `apply_failed`, and other segment actions are disabled until the user retries the save or discards/reconciles that local edit; retry never applies the text twice. After a verified acceptance, the service rebases remaining pending segments against the exact accepted result. If the editor changes outside this controlled sequence, all remaining pending segments become `stale`. `Accept all` performs one revision-checked editor revision and one verified save.

The proposal aggregate is `pending` when no segment is resolved, `partially_applied` when accepted/rejected segments coexist with pending ones, `apply_failed` while any segment persistence is unresolved, `stale` when unresolved segments were invalidated, `applied` when no unresolved segments remain and at least one was accepted, and `rejected` when all segments were rejected. An `applied` proposal with rejected segments is labeled `Applied partially` in the applied inbox group. Already accepted segments remain durable if later segments become stale or are rejected.

Actions whose candidate output must satisfy a whole-result validator, including JSON, YAML, TOML, and Mermaid transformations, produce an atomic proposal with no segment-level acceptance. The user may accept all, reject all, or inspect the full diff. The complete candidate is revalidated immediately before its single verified apply. No inline suggestion mutates editor content merely because it streamed successfully.

## 9. Automation

The first release supports:

- Every app open/foreground activation, with a minimum debounce interval
- Daily at a local wall-clock time
- Weekly on a selected local weekday and time

A task contains a stable ID, schedule-version ID, name, prompt, schedule, IANA timezone, provider profile reference, native-search requirement, context selection, whole-workspace permission requirement, enabled state, last due occurrence, last execution, and status. The stored timezone does not change merely because the device timezone changes; changing it is an explicit task edit that creates a new schedule version.

On launch or foreground, the scheduler:

1. Computes the most recent due occurrence in the task's stored timezone.
2. Derives a deterministic occurrence key from task ID, schedule-version ID, and the local calendar period, then loads or creates its execution record.
3. Skips only an execution in `succeeded` or `terminal` state. Atomically claims an eligible new or `retryable` record by setting `running`, a lease deadline, and an incremented attempt.
4. Runs at most one execution per task in a scheduler pass.
5. Holds mutation tool results in an execution-attempt staging area that is not visible or applicable as a proposal. A provider tool-call ID is diagnostic metadata only and is not used as the idempotency boundary.
6. After a valid terminal assistant response, atomically promotes the complete staged mutation set into proposals with IDs derived from execution ID and stable mutation order, records those IDs, and marks the execution `succeeded` in the same local transaction.
7. On provider failure, cancellation, timeout, or interruption before that transaction, discards or replaces the attempt's staged mutations and records `retryable` or `terminal`, plus failure reason, next retry time, and bounded attempt count.

Long inactivity does not replay every missed interval. A later foreground may reclaim an expired `running` lease or retry a `retryable` execution with the same deterministic ID after backoff. Because proposals and `succeeded` commit atomically only after a completed model run, an automatic retry cannot observe or duplicate a partially committed proposal set. Recovery treats an execution with committed proposals as succeeded even if the app stopped before rendering the outcome. Exceeding the central attempt ceiling makes the execution `terminal` until the user explicitly retries it as a new, user-labeled manual execution that may intentionally produce a new proposal set.

For daily and weekly schedules, the occurrence key uses the intended local calendar date or ISO week/weekday under the stored IANA timezone rather than the UTC instant. During a fall-back overlap, an ambiguous wall-clock time runs once at its first occurrence. During a spring-forward gap, a nonexistent wall-clock time becomes due at the first valid local instant after the gap. Editing the timezone creates a new schedule version and does not replay periods belonging to the prior version. App-open tasks use a persisted debounce window rather than firing on every transient foreground event.

Tasks pause instead of partially running when their provider profile or key is missing, required web search is unsupported, required workspace access is revoked, or whole-workspace permission is disabled. Network and rate-limit failures remain retryable on a later foreground event according to a bounded backoff; they do not create duplicate proposals.

## 10. Interface

The AI tab replaces the current Phase 7 placeholder.

### 10.1 Conversation

- Header: assistant title, small connection status and provider label, plus icon destinations for automation, proposal inbox with count badge, and overflow.
- Context surface: current and manually added note chips, a lightweight add action, and plain-text whole-workspace permission status.
- Timeline: user messages, assistant streaming output, compact citations, collapsed tool details, errors, and proposal cards.
- Proposal card: target, short change summary, line-count summary, and one primary `View changes` action.
- Composer: multiline prompt, add-context icon, stop/send control, and disabled/retry states.

Only one solid primary action appears within each region. Status text is not styled as a button. Icon-only controls have accessibility names, hints, roles, selected/disabled states, and at least 44-point targets.

### 10.2 Editor quick assistant

The editor exposes the quick assistant from the selection menu, the current block's contextual action, the file-level AI action, and the universal formatting toolbar. The focused mobile sheet contains one searchable command field, scope status, context summary, quick chips, streaming preview, elapsed time, cancel, retry, and review controls. It does not duplicate the full chat timeline.

Scopes are:

- `selection`: the exact validated editor selection; when empty, explicitly falls back to the current block and updates the visible scope label before submission.
- `block`: the current atomic Markdown block. Lists, tables, blockquotes, details, fenced code, and Mermaid fences remain atomic.
- `document`: the newest validated native session snapshot after the editor flush described in Section 7.1.

The quick assistant never offers an implicit workspace-wide scope. Users must use chat with the separately visible whole-workspace permission for cross-note work.

Every immutable action contract declares its allowed scope, output mode (`commentary`, `replace`, or `insert_after`), output parser/validator, prompt template, and optional neighbor-context count.

The following 13 VMark Genies are mandatory first-release assets, not examples or optional backlog. Mira vendors their English prompt templates and frontmatter semantics from VMark commit `7e248a557fed26830e6496ced266ee4e967d549d`, with localized display labels and descriptions but without changing the prompt behavior:

| Category  | Genie                 | VMark scope | VMark action          | Required behavior                                               |
| --------- | --------------------- | ----------- | --------------------- | --------------------------------------------------------------- |
| Editing   | Polish                | selection   | replace               | Improve clarity, flow, and concision while preserving voice.    |
| Editing   | Condense              | selection   | replace               | Shorten while preserving key information.                       |
| Editing   | Fix Grammar           | selection   | replace               | Fix grammar, spelling, and punctuation without changing tone.   |
| Editing   | Simplify              | selection   | replace               | Use simpler language while preserving meaning.                  |
| Creative  | Expand                | selection   | replace               | Develop the selection with supporting detail.                   |
| Creative  | Rephrase              | selection   | replace               | Change wording and sentence structure while preserving meaning. |
| Creative  | Vivid                 | selection   | replace               | Add sensory detail, imagery, and stronger word choice.           |
| Creative  | Continue              | block       | insert after the block | Continue naturally for two to three paragraphs.                  |
| Structure | Summarize             | document    | replace               | Replace with a concise summary of main points and conclusions.   |
| Structure | Outline               | document    | replace               | Replace with a hierarchical Markdown outline.                   |
| Structure | Headline              | document    | replace               | Replace with five numbered title options.                        |
| Tools     | Translate             | selection   | replace               | Translate into English while preserving tone and formatting.    |
| Tools     | Rewrite in English    | selection   | replace               | Rewrite fluently in English while preserving meaning.           |

All 13 preserve VMark's default `context: 0` behavior: they receive only their captured selection, block, or document, with no neighboring blocks. An empty `selection` scope falls back to the current compound block exactly as described above. Freeform prompts remain a separate Mira/VMark-compatible path and include at most one neighboring atomic block before and after as read-only context.

The port also includes the supporting interaction required to make the Genies complete: searchable Spotlight-style action picker, the four selection quick chips (Polish, Condense, Fix Grammar, Rephrase), freeform prompt fallback with a two-step submit confirmation, visible scope, a single-invocation lock, streaming preview, elapsed-time status, cancel, retry, inline suggestion, accept/reject, accept-all/reject-all, and bounded local prompt history.

The behavioral port intentionally does not copy VMark's optional auto-approve path. Mira's previously approved security rule is stricter: every replacement or insertion remains a proposal until the user confirms it inline or in the full diff.

Format-aware actions appear only when the format registry and current scope support them. Explain Code uses `commentary` and creates no proposal. Restructure JSON/YAML/TOML uses a whole-document `replace` contract. Generate Mermaid uses `insert_after` for a Markdown block or `replace` for an empty/new Mermaid document; Repair Mermaid uses an atomic-fence or whole-document `replace` contract. Structured and Mermaid results must pass their existing validators and safety limits before becoming reviewable atomic proposals. Invalid output remains a read-only preview with diagnostics and cannot be applied.

Freeform selection and block actions may include at most one neighboring atomic block before and after as read-only style context. The context summary names those blocks separately, and the proposal target remains only the chosen scope. The 13 ported Genies and document actions receive no additional neighboring context. Every transformation template requests only transformed text, not explanations; provider chatter is treated as malformed transform output unless the action explicitly produces commentary such as Explain Code.

For segment-safe text transformations, inline review renders local insert/delete/replace segments. Users may accept or reject the focused segment, navigate between segments, accept all, reject all, open the full diff, cancel generation, or retry after failure. Validator-bound atomic proposals expose only accept all, reject all, and full diff. Commentary actions expose copy, continue in chat, and dismiss but no apply control. Only one quick-assistant generation may run at a time, although full chat history remains readable. Prompt history is local, bounded, searchable, and cleared with AI history.

### 10.3 Proposal inbox

The inbox groups proposals by pending (including partially applied), stale, applied, rejected, and failed. Opening a proposal uses the existing diff presentation where possible. Apply and reject require clear, distinct actions; mutation success returns the user to the affected note or proposal state.

### 10.4 Automation

Task cards show name, schedule, enabled state, provider, next due occurrence, last outcome, and pending proposal count. Creation uses a focused form for prompt, schedule, provider, native-search requirement, and context scope. Enabling a task summarizes the permissions and potential provider cost.

### 10.5 Settings

AI settings contain provider profiles, secure-key status, connection testing, whole-workspace search permission, conversation clearing, and audit-data clearing. Changing the global whole-workspace permission affects future tool calls and pauses incompatible tasks; it does not retroactively delete prior conversation excerpts.

## 11. Failure and Safety Behavior

- Invalid key or model: show a profile-level repair action.
- Rate limit: preserve the draft and conversation, show retry timing when supplied, and do not automatically loop.
- Network loss or timeout: keep partial assistant text visibly incomplete and allow retry from the last safe user turn.
- Malformed provider event or tool arguments: stop the tool round and show a safe protocol error.
- Tool-loop ceiling: stop after a bounded number of rounds and retain the trace.
- Invalid structured or Mermaid quick-action output: show validator diagnostics and prohibit apply.
- Segment persistence failure: preserve the dirty editor/recovery state, disable other segment actions, and offer save retry or reconciliation without applying the segment twice.
- Revoked workspace or missing file: fail the individual tool or proposal without widening access.
- Stale proposal: prohibit apply and offer regeneration.
- App interruption: persist completed conversation events and claimed automation executions; never infer a successful write from an interrupted request.
- Prompt injection: model output, notes, and web content cannot change the local tool catalog, permissions, path validation, proposal requirement, or secret policy.

Cancellation stops active network streaming and prevents new tool calls. Any proposal already durably created remains reviewable.

## 12. Data Retention and Privacy

Conversation messages, normalized citations, tool audit metadata, task definitions, execution outcomes, and proposal records are local application data. They are excluded from note `.vmbak` archives. Users can clear conversations and audit history separately from notes and proposals.

Audit entries contain identifiers, paths, operation types, timings, provider profile IDs, result codes, and bounded usage metadata. They do not contain API keys, authorization headers, complete request bodies, full note bodies, or raw provider reasoning.

The privacy documentation must state that selected note content and search excerpts are sent directly to the chosen provider and are governed by that provider's policies.

## 13. Testing and Verification

### 13.1 Unit and contract tests

- Parse and freeze provider profiles, events, tool arguments, task schedules, and proposals.
- Normalize streaming and non-streaming provider responses.
- Verify secret values cannot enter persisted profile or audit values.
- Enforce default context and whole-workspace permission boundaries.
- Reject excluded paths, invalid arguments, oversized content, and excess tool rounds.
- Prove every mutation tool produces a proposal without writing.
- Prove apply checks revision/hash and rejects stale proposals.
- Prove selection fallback, atomic-block capture, read-only neighbor context, locally computed segments, partial-accept verified persistence/rebasing, aggregate lifecycle mapping, apply-failure recovery, and invalidation after unrelated editor changes.
- Prove structured and Mermaid quick actions are atomic, have no segment-accept path, and cannot apply output that fails existing validators or safety limits.
- Prove commentary actions never create a proposal or expose apply controls.
- Run a contract fixture for each of the 13 ported VMark Genies that locks its category, scope, action, original English prompt asset hash, empty-selection fallback, and expected proposal target.
- Prove scheduler catch-up, deterministic execution IDs, foreground debounce, timezone handling, and no duplicate execution.
- Prove profile removal and permission revocation pause affected tasks.
- Prove a workspace listing is unavailable to the model and whole-workspace search is denied while permission is disabled.
- Prove failures and expired leases before automation commit cannot create or duplicate proposals across retries.

### 13.2 Integration tests

- Use scripted mock HTTP transports for streaming, tool calls, native web citations, authentication failure, rate limits, malformed events, cancellation, and timeouts.
- Exercise proposals through memory and production-shaped repository contracts, including history and index synchronization.
- Exercise SQLite migrations, restart recovery, and interrupted automation claims.
- Verify secure-store adapter behavior with a fake that detects accidental secret persistence.

### 13.3 UI and manual verification

- Test context selection, permission visibility, streaming, cancellation, tool expansion, proposal review, stale proposal handling, editor quick-action discovery, scope labels, inline segment navigation, partial accept/reject, automation creation, and profile repair.
- Verify dynamic type, reduced motion, screen reader labels/order, keyboard avoidance, touch target size, light/dark themes, and Chinese/English strings.
- CI uses mock providers and no external network or real API key.
- Manual release checks cover at least one DeepSeek-compatible profile and one provider profile with implemented native web search.

## 14. Delivery Slices

1. Domain contracts, SQLite data, secure secrets, and provider-profile settings.
2. Provider adapters, conversation runtime, streaming chat UI, and local persistence.
3. Context picker, read-only note tools, whole-workspace permission, and visible tool traces.
4. Revision-bound proposals, diff review, confirmed writes, and proposal inbox.
5. Editor quick assistant, built-in and format-aware actions, segmented inline review, and partial apply.
6. Catch-up scheduler, automation UI, idempotent execution, and proposal generation.
7. Provider-native web search for supported adapters, citations, privacy copy, accessibility, and release verification.

Each slice must pass formatting, lint, strict type checking, unit/integration tests, and Android export before the next slice is considered complete.

## 15. VMark Source Provenance and License

The 13 prompt assets and their frontmatter metadata are copied from the official `xiaolai/vmark` repository at commit `7e248a557fed26830e6496ced266ee4e967d549d`, paths `src-tauri/resources/genies/{editing,creative,structure,tools}/*.md`. They are ISC-licensed, copyright 2026 Xiaolai Li.

The implementation must:

- Record every copied or modified upstream file and its commit in `docs/vmark-provenance.md`.
- Include VMark's ISC copyright and permission notice in a distributable third-party notices file and the in-app open-source licenses screen.
- Preserve the English prompt text in source assets so prompt-hash contract tests can detect accidental drift.
- Keep Mira's React Native UI, runtime, provider adapters, proposal logic, branding, icons, and localized labels as independent code; VMark product identity and artwork are not licensed by the source-code notice.

## 16. Success Criteria

- A user can add and test a DeepSeek or compatible model profile without a Mira backend.
- A user can chat with streaming output using the current note and manually attached notes.
- The AI cannot search the entire workspace until the user grants the dedicated permission.
- Authorized whole-workspace searches show which files and excerpts were used.
- No AI path can mutate a note without a reviewable proposal and explicit confirmation.
- A stale proposal cannot overwrite newer content.
- A user can invoke a built-in assistant action on a selection, block, or document and review the streamed transformation inline.
- All 13 VMark Genies listed in Section 10.2 are present and pass their individual metadata, prompt-asset, scope, action, streaming, and proposal-review contract fixtures.
- Neighboring context cannot be modified by a selection/block quick action, and partial acceptance cannot overwrite unrelated editor changes.
- Invalid structured-data or Mermaid output cannot be applied.
- A daily or weekly task missed while the app was closed runs once on the next eligible foreground event and does not duplicate.
- An automation write result appears in the proposal inbox rather than changing a note.
- Native web search is offered only by a provider adapter that implements it, with visible source links.
- API keys do not appear in SQLite, logs, backups, exports, or test snapshots.
