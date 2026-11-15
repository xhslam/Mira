# INC-2026-11-07: Pre-release conversation workspace boundary

- Scope: conversation-service request boundary, found while adding explicit chat references.
- Evidence: real in-memory SQLite test with two workspace IDs and a conversation owned by only one of them.
- User impact: no observed production cross-workspace request or data loss. Existing UI lists chats by workspace; this is a service-boundary defect found in review.

Previously, a supplied conversation ID was looked up in the current workspace, but a missing lookup fell through to constructing a new conversation with that same ID. The service then loaded messages by ID and upserted conversation metadata with the current workspace. A caller bypassing the normal picker could therefore read another workspace's history and change its ownership.

The service now rejects an existing conversation ID unless it resolves in the request workspace, before loading messages or writing any records. Selected reference IDs use the same membership check before reading any referenced bodies, and current-chat references are rejected. The SQLite integration tests in `tests/unit/ai/agent-memory-context.test.ts` exercise both the owning and foreign workspace paths. No automatic repair or migration of conversation ownership is attempted, as no actual affected record has been identified.
