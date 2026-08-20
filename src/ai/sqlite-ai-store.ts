import { z } from "zod";

import type { SearchDatabase } from "../search/sqlite-search-index";
import { parseWorkspaceId } from "../domain/identifiers";
import type { AiStore, AiToolAuditRecord } from "./ai-store";
import type { AiProposal, AiProposalId } from "./proposal";
import type { AiAutomation, AiAutomationId, AiExecution, AiExecutionId } from "./automation";
import type {
  AiConversation,
  AiConversationId,
  AiConversationMessage,
  AiMessageId,
} from "./conversation";
import {
  AI_CONNECTION_STATUSES,
  AI_PROVIDER_ADAPTERS,
  parseAiProviderProfile,
  type AiProviderProfile,
  type AiProviderProfileId,
} from "./provider-profile";

export const AI_STATE_MIGRATION = `
CREATE TABLE IF NOT EXISTS ai_provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  adapter TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  connection_status TEXT NOT NULL,
  last_tested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
  provider_profile_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation
  ON ai_messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS ai_tool_audit (
  id TEXT PRIMARY KEY, conversation_id TEXT, execution_id TEXT, tool_name TEXT NOT NULL,
  workspace_id TEXT, relative_path TEXT, result_code TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_proposals (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, conversation_id TEXT, execution_id TEXT,
  operation TEXT NOT NULL, target_path TEXT NOT NULL, base_revision TEXT,
  base_hash TEXT, base_content TEXT NOT NULL DEFAULT '', proposed_content TEXT NOT NULL, state TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_proposal_segments (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL, from_offset INTEGER NOT NULL, to_offset INTEGER NOT NULL,
  content TEXT NOT NULL, state TEXT NOT NULL, UNIQUE(proposal_id, ordinal)
);
CREATE TABLE IF NOT EXISTS ai_automations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, schedule_version TEXT NOT NULL,
  name TEXT NOT NULL, prompt TEXT NOT NULL, schedule_json TEXT NOT NULL,
  timezone TEXT NOT NULL, provider_profile_id TEXT, context_json TEXT NOT NULL,
  requires_web_search INTEGER NOT NULL, enabled INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_executions (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, occurrence_key TEXT NOT NULL,
  state TEXT NOT NULL, attempt INTEGER NOT NULL, lease_until INTEGER,
  next_retry_at INTEGER, proposal_ids_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(automation_id, occurrence_key)
);
CREATE TABLE IF NOT EXISTS ai_prompt_history (
  workspace_id TEXT NOT NULL, prompt TEXT NOT NULL, used_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, prompt)
);`;

const providerRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    adapter: z.enum(AI_PROVIDER_ADAPTERS),
    base_url: z.string(),
    model: z.string(),
    connection_status: z.enum(AI_CONNECTION_STATUSES),
    last_tested_at: z.number().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .strict();

const conversationRowSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    title: z.string(),
    provider_profile_id: z.string().uuid().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .strict();

const messageRowSchema = z
  .object({
    id: z.string().uuid(),
    conversation_id: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    status: z.enum(["completed", "incomplete"]),
    created_at: z.number(),
  })
  .strict();

const auditMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
);

const toolAuditRowSchema = z
  .object({
    id: z.string().uuid(),
    conversation_id: z.string().uuid().nullable(),
    workspace_id: z.string().uuid(),
    tool_name: z.string(),
    relative_path: z.string().nullable(),
    result_code: z.string(),
    metadata_json: z.string(),
    created_at: z.number(),
  })
  .strict();

const proposalRowSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    conversation_id: z.string().uuid().nullable(),
    operation: z.literal("replace"),
    target_path: z.string(),
    base_revision: z.string().nullable(),
    base_hash: z.string().nullable(),
    base_content: z.string(),
    proposed_content: z.string(),
    state: z.enum(["pending", "applied", "rejected", "stale", "apply_failed"]),
    explanation: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .strict();

const automationRowSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    schedule_version: z.string(),
    name: z.string(),
    prompt: z.string(),
    schedule_json: z.string(),
    timezone: z.string(),
    provider_profile_id: z.string().uuid().nullable(),
    context_json: z.string(),
    requires_web_search: z.number().int(),
    enabled: z.number().int(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .strict();
const scheduleSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("app-open"), debounceMinutes: z.number().int().min(1).max(10_080) })
    .strict(),
  z
    .object({
      kind: z.literal("daily"),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
    })
    .strict(),
  z
    .object({
      kind: z.literal("weekly"),
      weekday: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
    })
    .strict(),
]);
const automationContextSchema = z
  .object({ paths: z.array(z.string()), wholeWorkspace: z.boolean() })
  .strict();
const executionRowSchema = z
  .object({
    id: z.string().uuid(),
    automation_id: z.string().uuid(),
    occurrence_key: z.string(),
    state: z.enum(["running", "succeeded", "retryable", "terminal", "paused"]),
    attempt: z.number().int(),
    proposal_ids_json: z.string(),
    error_code: z.string().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .strict();

function fromProviderRow(input: unknown): AiProviderProfile {
  const row = providerRowSchema.parse(input);
  const parsed = parseAiProviderProfile({
    id: row.id,
    name: row.name,
    adapter: row.adapter,
    baseUrl: row.base_url,
    model: row.model,
    connectionStatus: row.connection_status,
    lastTestedAt: row.last_tested_at === null ? null : new Date(row.last_tested_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
  if (!parsed.ok) throw new Error(`Invalid AI provider profile row: ${parsed.error.code}`);
  return parsed.value;
}

function fromConversationRow(input: unknown): AiConversation {
  const row = conversationRowSchema.parse(input);
  const workspaceId = parseWorkspaceId(row.workspace_id);
  if (!workspaceId.ok) throw new Error("Invalid AI conversation workspace identity");
  return Object.freeze({
    id: row.id as AiConversationId,
    workspaceId: workspaceId.value,
    title: row.title,
    providerProfileId: row.provider_profile_id as AiProviderProfileId | null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function fromMessageRow(input: unknown): AiConversationMessage {
  const row = messageRowSchema.parse(input);
  return Object.freeze({
    id: row.id as AiMessageId,
    conversationId: row.conversation_id as AiConversationId,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function fromToolAuditRow(input: unknown): AiToolAuditRecord {
  const row = toolAuditRowSchema.parse(input);
  const workspaceId = parseWorkspaceId(row.workspace_id);
  if (!workspaceId.ok) throw new Error("Invalid AI tool audit workspace identity");
  return Object.freeze({
    id: row.id,
    conversationId: row.conversation_id as AiConversationId | null,
    workspaceId: workspaceId.value,
    toolName: row.tool_name,
    relativePath: row.relative_path,
    resultCode: row.result_code,
    metadata: Object.freeze(auditMetadataSchema.parse(JSON.parse(row.metadata_json) as unknown)),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function fromProposalRow(input: unknown): AiProposal {
  const row = proposalRowSchema.parse(input);
  const workspaceId = parseWorkspaceId(row.workspace_id);
  if (!workspaceId.ok) throw new Error("Invalid AI proposal workspace identity");
  return Object.freeze({
    id: row.id as AiProposalId,
    workspaceId: workspaceId.value,
    conversationId: row.conversation_id as AiConversationId | null,
    operation: row.operation,
    targetPath: row.target_path,
    baseRevision: row.base_revision,
    baseHash: row.base_hash,
    baseContent: row.base_content,
    proposedContent: row.proposed_content,
    state: row.state,
    explanation: row.explanation,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function fromAutomationRow(input: unknown): AiAutomation {
  const row = automationRowSchema.parse(input);
  const workspaceId = parseWorkspaceId(row.workspace_id);
  if (!workspaceId.ok) throw new Error("Invalid AI automation workspace identity");
  const context = automationContextSchema.parse(JSON.parse(row.context_json) as unknown);
  return Object.freeze({
    id: row.id as AiAutomationId,
    workspaceId: workspaceId.value,
    scheduleVersion: row.schedule_version,
    name: row.name,
    prompt: row.prompt,
    schedule: Object.freeze(scheduleSchema.parse(JSON.parse(row.schedule_json) as unknown)),
    timezone: row.timezone,
    providerProfileId: row.provider_profile_id as AiProviderProfileId | null,
    contextPaths: Object.freeze(context.paths),
    requiresWebSearch: row.requires_web_search === 1,
    requiresWholeWorkspaceSearch: context.wholeWorkspace,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function fromExecutionRow(input: unknown): AiExecution {
  const row = executionRowSchema.parse(input);
  return Object.freeze({
    id: row.id as AiExecutionId,
    automationId: row.automation_id as AiAutomationId,
    occurrenceKey: row.occurrence_key,
    state: row.state,
    attempt: row.attempt,
    proposalIds: Object.freeze(
      z.array(z.string()).parse(JSON.parse(row.proposal_ids_json) as unknown),
    ),
    errorCode: row.error_code,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

export function createSqliteAiStore(database: SearchDatabase): AiStore {
  let initialized = false;
  async function initialize(): Promise<void> {
    if (initialized) return;
    await database.execAsync(AI_STATE_MIGRATION);
    const proposalColumns = await database.getAllAsync<Readonly<{ name: string }>>(
      "PRAGMA table_info(ai_proposals)",
    );
    if (!proposalColumns.some((column) => column.name === "base_content")) {
      await database.execAsync(
        "ALTER TABLE ai_proposals ADD COLUMN base_content TEXT NOT NULL DEFAULT ''",
      );
    }
    initialized = true;
  }

  return Object.freeze({
    initialize,
    async listProviderProfiles() {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, name, adapter, base_url, model, connection_status,
          last_tested_at, created_at, updated_at
         FROM ai_provider_profiles ORDER BY updated_at DESC, name ASC`,
      );
      return Object.freeze(rows.map(fromProviderRow));
    },
    async getProviderProfile(id: AiProviderProfileId) {
      await initialize();
      const row = await database.getFirstAsync<unknown>(
        `SELECT id, name, adapter, base_url, model, connection_status,
          last_tested_at, created_at, updated_at
         FROM ai_provider_profiles WHERE id = ?`,
        id,
      );
      return row === null ? null : fromProviderRow(row);
    },
    async upsertProviderProfile(profile: AiProviderProfile) {
      await initialize();
      const parsed = parseAiProviderProfile(profile);
      if (!parsed.ok) throw new Error(`Invalid AI provider profile: ${parsed.error.code}`);
      await database.runAsync(
        `INSERT INTO ai_provider_profiles
          (id, name, adapter, base_url, model, connection_status, last_tested_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, adapter=excluded.adapter,
           base_url=excluded.base_url, model=excluded.model,
           connection_status=excluded.connection_status,
           last_tested_at=excluded.last_tested_at, updated_at=excluded.updated_at`,
        parsed.value.id,
        parsed.value.name,
        parsed.value.adapter,
        parsed.value.baseUrl,
        parsed.value.model,
        parsed.value.connectionStatus,
        parsed.value.lastTestedAt === null ? null : Date.parse(parsed.value.lastTestedAt),
        Date.parse(parsed.value.createdAt),
        Date.parse(parsed.value.updatedAt),
      );
    },
    async removeProviderProfile(id: AiProviderProfileId) {
      await initialize();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          "UPDATE ai_automations SET enabled = 0, provider_profile_id = NULL WHERE provider_profile_id = ?",
          id,
        );
        await transaction.runAsync("DELETE FROM ai_provider_profiles WHERE id = ?", id);
      });
    },
    async listConversations(workspaceId) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, workspace_id, title, provider_profile_id, created_at, updated_at
         FROM ai_conversations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100`,
        workspaceId,
      );
      return Object.freeze(rows.map(fromConversationRow));
    },
    async upsertConversation(conversation) {
      await initialize();
      await database.runAsync(
        `INSERT INTO ai_conversations
          (id, workspace_id, title, provider_profile_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,
           provider_profile_id=excluded.provider_profile_id, updated_at=excluded.updated_at`,
        conversation.id,
        conversation.workspaceId,
        conversation.title.slice(0, 120),
        conversation.providerProfileId,
        Date.parse(conversation.createdAt),
        Date.parse(conversation.updatedAt),
      );
    },
    async listMessages(conversationId) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, conversation_id, role, content, status, created_at
         FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 1000`,
        conversationId,
      );
      return Object.freeze(rows.map(fromMessageRow));
    },
    async upsertMessage(message) {
      await initialize();
      await database.runAsync(
        `INSERT INTO ai_messages (id, conversation_id, role, content, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET content=excluded.content, status=excluded.status`,
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.status,
        Date.parse(message.createdAt),
      );
    },
    async removeConversation(id) {
      await initialize();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync("DELETE FROM ai_messages WHERE conversation_id = ?", id);
        await transaction.runAsync("DELETE FROM ai_conversations WHERE id = ?", id);
      });
    },
    async recordToolAudit(record) {
      await initialize();
      const metadata = auditMetadataSchema.parse(record.metadata);
      const metadataJson = JSON.stringify(metadata);
      if (new TextEncoder().encode(metadataJson).byteLength > 8 * 1_024) {
        throw new Error("AI tool audit metadata is too large");
      }
      await database.runAsync(
        `INSERT INTO ai_tool_audit
          (id, conversation_id, execution_id, tool_name, workspace_id, relative_path,
           result_code, metadata_json, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.conversationId,
        record.toolName.slice(0, 100),
        record.workspaceId,
        record.relativePath,
        record.resultCode.slice(0, 100),
        metadataJson,
        Date.parse(record.createdAt),
      );
    },
    async listToolAudit(workspaceId, limit = 200) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, conversation_id, workspace_id, tool_name, relative_path,
          result_code, metadata_json, created_at
         FROM ai_tool_audit WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
        workspaceId,
        Math.max(1, Math.min(limit, 1_000)),
      );
      return Object.freeze(rows.map(fromToolAuditRow));
    },
    async clearToolAudit(workspaceId) {
      await initialize();
      await database.runAsync("DELETE FROM ai_tool_audit WHERE workspace_id = ?", workspaceId);
    },
    async upsertProposal(proposal) {
      await initialize();
      await database.runAsync(
        `INSERT INTO ai_proposals
          (id, workspace_id, conversation_id, execution_id, operation, target_path,
           base_revision, base_hash, base_content, proposed_content, state, explanation,
           created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET state=excluded.state, explanation=excluded.explanation,
           updated_at=excluded.updated_at`,
        proposal.id,
        proposal.workspaceId,
        proposal.conversationId,
        proposal.operation,
        proposal.targetPath,
        proposal.baseRevision,
        proposal.baseHash,
        proposal.baseContent,
        proposal.proposedContent,
        proposal.state,
        proposal.explanation,
        Date.parse(proposal.createdAt),
        Date.parse(proposal.updatedAt),
      );
    },
    async listProposals(workspaceId) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, workspace_id, conversation_id, operation, target_path, base_revision,
          base_hash, base_content, proposed_content, state, explanation, created_at, updated_at
         FROM ai_proposals WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 500`,
        workspaceId,
      );
      return Object.freeze(rows.map(fromProposalRow));
    },
    async getProposal(id) {
      await initialize();
      const row = await database.getFirstAsync<unknown>(
        `SELECT id, workspace_id, conversation_id, operation, target_path, base_revision,
          base_hash, base_content, proposed_content, state, explanation, created_at, updated_at
         FROM ai_proposals WHERE id = ?`,
        id,
      );
      return row === null ? null : fromProposalRow(row);
    },
    async setProposalState(id, state, updatedAt) {
      await initialize();
      await database.runAsync(
        "UPDATE ai_proposals SET state = ?, updated_at = ? WHERE id = ?",
        state,
        Date.parse(updatedAt),
        id,
      );
    },
    async listAutomations(workspaceId) {
      await initialize();
      const rows = await database.getAllAsync<unknown>(
        `SELECT id, workspace_id, schedule_version, name, prompt, schedule_json, timezone,
          provider_profile_id, context_json, requires_web_search, enabled, created_at, updated_at
         FROM ai_automations WHERE workspace_id = ? ORDER BY updated_at DESC`,
        workspaceId,
      );
      return Object.freeze(rows.map(fromAutomationRow));
    },
    async upsertAutomation(automation) {
      await initialize();
      await database.runAsync(
        `INSERT INTO ai_automations
          (id, workspace_id, schedule_version, name, prompt, schedule_json, timezone,
           provider_profile_id, context_json, requires_web_search, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET schedule_version=excluded.schedule_version,
           name=excluded.name, prompt=excluded.prompt, schedule_json=excluded.schedule_json,
           timezone=excluded.timezone, provider_profile_id=excluded.provider_profile_id,
           context_json=excluded.context_json, requires_web_search=excluded.requires_web_search,
           enabled=excluded.enabled, updated_at=excluded.updated_at`,
        automation.id,
        automation.workspaceId,
        automation.scheduleVersion,
        automation.name,
        automation.prompt,
        JSON.stringify(automation.schedule),
        automation.timezone,
        automation.providerProfileId,
        JSON.stringify({
          paths: automation.contextPaths,
          wholeWorkspace: automation.requiresWholeWorkspaceSearch,
        }),
        automation.requiresWebSearch ? 1 : 0,
        automation.enabled ? 1 : 0,
        Date.parse(automation.createdAt),
        Date.parse(automation.updatedAt),
      );
    },
    async removeAutomation(id) {
      await initialize();
      await database.runAsync("DELETE FROM ai_automations WHERE id = ?", id);
    },
    async getExecution(automationId, occurrenceKey) {
      await initialize();
      const row = await database.getFirstAsync<unknown>(
        `SELECT id, automation_id, occurrence_key, state, attempt, proposal_ids_json,
          error_code, created_at, updated_at FROM ai_executions
         WHERE automation_id = ? AND occurrence_key = ?`,
        automationId,
        occurrenceKey,
      );
      return row === null ? null : fromExecutionRow(row);
    },
    async upsertExecution(execution) {
      await initialize();
      await database.runAsync(
        `INSERT INTO ai_executions
          (id, automation_id, occurrence_key, state, attempt, lease_until, next_retry_at,
           proposal_ids_json, error_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
         ON CONFLICT(automation_id, occurrence_key) DO UPDATE SET state=excluded.state,
           attempt=excluded.attempt, proposal_ids_json=excluded.proposal_ids_json,
           error_code=excluded.error_code, updated_at=excluded.updated_at`,
        execution.id,
        execution.automationId,
        execution.occurrenceKey,
        execution.state,
        execution.attempt,
        JSON.stringify(execution.proposalIds),
        execution.errorCode,
        Date.parse(execution.createdAt),
        Date.parse(execution.updatedAt),
      );
    },
    async recordPrompt(workspaceId, prompt, usedAt) {
      await initialize();
      const value = prompt.trim().slice(0, 4_000);
      if (!value) return;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO ai_prompt_history (workspace_id, prompt, used_at) VALUES (?, ?, ?)
           ON CONFLICT(workspace_id, prompt) DO UPDATE SET used_at=excluded.used_at`,
          workspaceId,
          value,
          Date.parse(usedAt),
        );
        await transaction.runAsync(
          `DELETE FROM ai_prompt_history WHERE workspace_id = ? AND prompt NOT IN
            (SELECT prompt FROM ai_prompt_history WHERE workspace_id = ? ORDER BY used_at DESC LIMIT ?)`,
          workspaceId,
          workspaceId,
          100,
        );
      });
    },
    async listPromptHistory(workspaceId, limit = 100) {
      await initialize();
      const rows = await database.getAllAsync<Readonly<{ prompt: string }>>(
        "SELECT prompt FROM ai_prompt_history WHERE workspace_id = ? ORDER BY used_at DESC LIMIT ?",
        workspaceId,
        Math.max(1, Math.min(limit, 100)),
      );
      return Object.freeze(rows.map((row) => row.prompt));
    },
    async clearPromptHistory(workspaceId) {
      await initialize();
      await database.runAsync("DELETE FROM ai_prompt_history WHERE workspace_id = ?", workspaceId);
    },
  });
}
