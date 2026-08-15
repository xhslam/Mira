# Privacy

Mira is local-first. It has no Mira account, Mira-operated AI backend, analytics, advertising SDK, or telemetry. Notes, recovery drafts, conversations, automation schedules, proposal records, and tool-audit metadata remain on the device unless the user explicitly sends selected context to a configured AI provider.

AI API keys are stored with the operating system's secure credential storage and are never written to SQLite, logs, audit records, or note files. AI requests go directly from the device to the HTTPS provider URL configured by the user. By default, requests include only the current note and any additional notes the user manually selects. Whole-workspace AI search is a separate permission that is off by default. Turning it on exposes a bounded local search tool; a full note still requires a separate, visible read tool call.

Web search is available only through a model provider's documented native search capability. Mira does not send search queries to a separate search service. Citations returned by the provider are displayed as untrusted sources.

AI cannot write notes directly. It can create local proposals, which show a diff and require explicit user confirmation. Applying a proposal rechecks the note identity, content, and editor revision. Automation tasks run only when the app opens or returns to the foreground and process at most the latest missed occurrence.

Workspace files may live in app-private storage or an explicitly user-authorized linked directory. Uninstalling or clearing app data removes app-private data and secure configuration; files in an external linked workspace remain controlled by that storage provider. Android backup remains disabled.
