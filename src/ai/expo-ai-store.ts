import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { SearchDatabase } from "../search/sqlite-search-index";
import { SQLITE_DATABASE_NAMES } from "../storage/sqlite-database-names";
import type { AiStore, AiToolAuditRecord } from "./ai-store";
import { createSqliteAiStore } from "./sqlite-ai-store";
import type { AiProviderProfile, AiProviderProfileId } from "./provider-profile";
import type { WorkspaceId } from "../domain/identifiers";
import type { AiConversation, AiConversationId, AiConversationMessage } from "./conversation";
import type { AiProposal, AiProposalId, AiProposalState } from "./proposal";
import type { AiAutomation, AiAutomationId, AiExecution } from "./automation";

function adaptDatabase(database: SQLiteDatabase): SearchDatabase {
  return Object.freeze({
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, ...params) => database.runAsync(source, ...params),
    getAllAsync: <T>(source: string, ...params: Parameters<SearchDatabase["runAsync"]>[1][]) =>
      database.getAllAsync<T>(source, ...params),
    getFirstAsync: <T>(source: string, ...params: Parameters<SearchDatabase["runAsync"]>[1][]) =>
      database.getFirstAsync<T>(source, ...params),
    withExclusiveTransactionAsync: (task) =>
      database.withTransactionAsync(() => task(adaptDatabase(database))),
  });
}

export function createExpoAiStore(): AiStore {
  let storePromise: Promise<AiStore> | null = null;
  async function getStore(): Promise<AiStore> {
    storePromise ??= openDatabaseAsync(SQLITE_DATABASE_NAMES.ai).then(async (database) => {
      const store = createSqliteAiStore(adaptDatabase(database));
      await store.initialize();
      return store;
    });
    return storePromise;
  }
  return Object.freeze({
    async initialize() {
      await getStore();
    },
    async listProviderProfiles() {
      return (await getStore()).listProviderProfiles();
    },
    async getProviderProfile(id: AiProviderProfileId) {
      return (await getStore()).getProviderProfile(id);
    },
    async upsertProviderProfile(profile: AiProviderProfile) {
      return (await getStore()).upsertProviderProfile(profile);
    },
    async removeProviderProfile(id: AiProviderProfileId) {
      return (await getStore()).removeProviderProfile(id);
    },
    async listConversations(workspaceId: WorkspaceId) {
      return (await getStore()).listConversations(workspaceId);
    },
    async upsertConversation(conversation: AiConversation) {
      return (await getStore()).upsertConversation(conversation);
    },
    async listMessages(conversationId: AiConversationId) {
      return (await getStore()).listMessages(conversationId);
    },
    async upsertMessage(message: AiConversationMessage) {
      return (await getStore()).upsertMessage(message);
    },
    async removeConversation(id: AiConversationId) {
      return (await getStore()).removeConversation(id);
    },
    async recordToolAudit(record: AiToolAuditRecord) {
      return (await getStore()).recordToolAudit(record);
    },
    async listToolAudit(workspaceId: WorkspaceId, limit?: number) {
      return (await getStore()).listToolAudit(workspaceId, limit);
    },
    async clearToolAudit(workspaceId: WorkspaceId) {
      return (await getStore()).clearToolAudit(workspaceId);
    },
    async upsertProposal(proposal: AiProposal) {
      return (await getStore()).upsertProposal(proposal);
    },
    async listProposals(workspaceId: WorkspaceId) {
      return (await getStore()).listProposals(workspaceId);
    },
    async getProposal(id: AiProposalId) {
      return (await getStore()).getProposal(id);
    },
    async setProposalState(id: AiProposalId, state: AiProposalState, updatedAt: string) {
      return (await getStore()).setProposalState(id, state, updatedAt);
    },
    async listAutomations(workspaceId: WorkspaceId) {
      return (await getStore()).listAutomations(workspaceId);
    },
    async upsertAutomation(automation: AiAutomation) {
      return (await getStore()).upsertAutomation(automation);
    },
    async removeAutomation(id: AiAutomationId) {
      return (await getStore()).removeAutomation(id);
    },
    async getExecution(automationId: AiAutomationId, occurrenceKey: string) {
      return (await getStore()).getExecution(automationId, occurrenceKey);
    },
    async upsertExecution(execution: AiExecution) {
      return (await getStore()).upsertExecution(execution);
    },
    async recordPrompt(workspaceId: WorkspaceId, prompt: string, usedAt: string) {
      return (await getStore()).recordPrompt(workspaceId, prompt, usedAt);
    },
    async listPromptHistory(workspaceId: WorkspaceId, limit?: number) {
      return (await getStore()).listPromptHistory(workspaceId, limit);
    },
    async clearPromptHistory(workspaceId: WorkspaceId) {
      return (await getStore()).clearPromptHistory(workspaceId);
    },
  });
}
