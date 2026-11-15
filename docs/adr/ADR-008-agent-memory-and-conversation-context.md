# ADR-008: Workspace memory, conversation references and native rich text

- Date: 2026-11-07
- Status: Implemented; real-provider and physical-device acceptance remain open.

## Product behavior

Agent centers on persistent memory, explicit references to other chats and rich responses. Memory categories are personal information, preferences and topics. Users can add, edit, disable or delete entries, save a user message with its original source, and turn off memory for the workspace or the current conversation. Profile and preferences are included with requests; topic titles form a directory whose bodies are read through `memory_read` only when relevant.

Natural-language saving is deliberately explicit: a message beginning with “记住/记下” (optionally “请/帮我”) or “remember” exposes `memory_save`. Negated remembering does not. The runtime accepts only an exact contiguous excerpt of the current user's message and stores that excerpt, conversation ID and message ID. This version does not extract background facts automatically, merge conflicting facts or overwrite manually edited entries. Users organize and correct entries in the editor. Model tool support is needed for natural-language saves; manual editing works without a provider.

## Storage and request boundaries

- Additive `ai_memories` and `ai_memory_policy` tables live in the existing authoritative AI state database (`inkstone-index.db`, despite its legacy name). Neither search rebuilds nor retired Agent files own memory. SQLite statement completion precedes UI success. Invalid input or malformed stored JSON fails visibly without resetting the data.
- Every memory read/write/delete is scoped by workspace ID. The feature introduces no global cross-workspace memory. Existing chat data and credentials are retained.
- A reference resolves against the current workspace's conversation list before any message body is loaded. Missing, deleted, foreign or current-chat IDs fail. At most five unique conversations can be selected. Only completed messages are sent; transcripts exceeding 60,000 characters or reaching the existing 1,000-message read cap are rejected, never silently truncated. The aggregate existing 512 KiB context limit still applies before saving the outgoing message.
- Reference IDs and titles are saved alongside the user message through an additive `references_json` migration. Reopening a chat restores the last user message's selected references. References are resolved afresh on each request; this is provenance metadata, not an immutable historical transcript snapshot. Missing references remain removable in the picker.
- Memory and referenced chat content are untrusted background data, never authority for workspace writes. A successful memory tool result is required before claiming a save. A topic read rechecks current deletion/disablement, and memory tools recheck workspace policy. Tool execution checks request cancellation.
- Disabling memory prevents subsequent memory injection/tools; previously generated chat replies remain in history. Storage is local SQLite; no memory sync, backup/export UI or background extraction is introduced.

## Presentation

Markdown is parsed with the installed Marked lexer and rendered as native React Native components. Headings, nested lists, task lists, quotations, emphasis, strike-through, fenced code with copy, horizontal tables and links are supported, including unfinished streaming code fences. HTML is displayed as text; images do not issue remote fetches. Only HTTP(S) and mailto links open externally. This meets the rich-text baseline; arbitrary generated executable UI, chart schemas and mathematical rendering are not claimed.

Design references: [Shape of AI memory and references patterns](https://www.shapeof.ai/), [Astryx composable accessible components and themes](https://astryx.atmeta.com/), the local UI design guide, and the project apple-design skill. Gamma's local memory retrieval policy and explicit evidence contract informed the directory/body split and provenance boundary. The React Native implementation reuses Mira's themed sheets rather than installing a DOM component library.

## Evidence

See `tests/unit/ai/agent-memory-context.test.ts` for actual SQLite migration/reopen, workspace isolation, evidence validation, memory disablement/deletion, provider-request context, reference provenance and rich-text parsing/link boundaries. Existing Agent navigation, proposal review, editor and backup contracts remain required.
