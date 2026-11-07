# Privacy

**Updated:** 2026-11-05

Mira is local-first. It has no Mira account, Mira-operated AI backend, analytics, advertising SDK or telemetry. Notes, learning records, recovery drafts, conversations, proposals, commitments, delegation schedules and review results stay on the device unless the user explicitly sends selected context to a configured AI provider or synchronizes approved metadata to their own paired worker.

## AI providers and note context

AI keys use the operating system’s secure credential storage; they are not written to note files, SQLite, Agent JSON or audit logs. Requests go directly to the configured HTTPS provider. Conversation context includes the visible current/manual-selected notes; whole-workspace search is separately authorized and off by default. A bounded search result does not automatically authorize an invisible full-workspace upload.

Agent omission review does not scan the device or mailbox. It checks recorded commitments and, only after the user enables the current-note option for that check, the selected note snapshot. That text may contain unsaved editor content; it passes the existing editor snapshot/flush boundary. Model extraction receives no file handles, workspace-write tools, email sender or Shell capability. It must return candidates with an exact source quote; the user must confirm candidates before they become actionable commitments. The model can still make mistakes; sources, coverage and correction controls remain visible.

Provider-native web search is optional; returned excerpts and citations are untrusted data. AI cannot directly change a note. Reviewed proposals show a diff and revalidate note identity, base content and revision before applying.

## Agent storage and recovery

Agent authority is separate from rebuildable search SQLite in the application document directory. It uses validation, versions, serialized writes, read-back verification and recovery slots. A damaged primary does not automatically roll back to an older authorization state. Explicit recovery preserves original bytes in quarantine, pauses delegations, requires reconfirmation of unresolved items and treats uncertain delivery as unknown. These files contain plaintext user content; device security and disk encryption remain relevant. The App does not claim application-level encryption of every local file.

English-coach data remains in Learning’s existing storage. Moving the UI does not delete notes, AI conversation history, Provider configuration or old drawings. Retired drawing files are read-only source; original-byte sharing and explicit recovery-text export use the existing system share flow. Opening a share sheet does not prove the receiving application accepted the content.

## Optional independent worker

The worker is a separate, user-operated Node process, not a Mira-hosted service. Pairing verifies a user-entered HTTPS origin, service protocol and workspace authorization. The Bearer secret is stored in OS SecureStore, not the endpoint/cache file. The client rejects URLs containing credentials, paths, queries or fragments, rejects non-HTTPS except loopback development addresses, and refuses HTTP redirects. This does not relax native cleartext networking policy.

Pairing alone does not upload commitments. The explicit sync action sends supported, approved commitment metadata (title, source path/reference, deadline, state and snooze), delegation target/schedule/timezone/version and a snapshot timestamp. It does not upload full notes, model API keys or unconfirmed model candidates. Only the `commitments` scope is currently supported; unsupported active sources are rejected rather than relabelled as authorized.

The host stores uploaded metadata and durable execution/results in its own plaintext SQLite database. Host permissions, TLS termination, disk encryption, backups and operation are the operator’s responsibility. A token authorizes every workspace on that instance’s configured allowlist; separate instances/tokens are needed for independent access boundaries. Removing a workspace from the server allowlist or rotating the server token requires an operator action/restart.

App polling persists each result before acknowledging receipt. A lost acknowledgement is idempotently retried without running the task again. Receipt means durable App reception, not a system notification or human read receipt. Results show the age of the uploaded snapshot; no mailbox, message or calendar account has been connected in this implementation, and there is no system-push integration.

Delegation edits, completion and pauses reach a remote worker only after successful sync. “Pause all and disconnect” first saves and syncs pauses; offline failure cannot claim the remote tasks stopped. Merely closing/uninstalling the App, changing endpoint or losing the local credential does not stop an independently running worker. Without a worker the mobile app checks on open/foreground only, not at a guaranteed background time.

## Device and linked workspaces

Files may live in app-private storage or an explicitly authorized linked directory. Clearing App data or uninstalling removes private data and secure configuration; files in an external workspace remain controlled by its storage provider. A self-hosted worker’s data remains on that host. Android automatic backup stays disabled. Export/backup user data before uninstalling; do not clear storage as a repair procedure.
