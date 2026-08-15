import type { AiProviderProfile, AiProviderProfileId } from "./provider-profile";
import type { WorkspaceId } from "../domain/identifiers";
import type { AiConversation, AiConversationId, AiConversationMessage } from "./conversation";
import type { AiProposal, AiProposalId, AiProposalState } from "./proposal";
import type { AiAutomation, AiAutomationId, AiExecution } from "./automation";

export type AiToolAuditRecord = Readonly<{
  id: string;
  conversationId: AiConversationId | null;
  workspaceId: WorkspaceId;
  toolName: string;
  relativePath: string | null;
  resultCode: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  createdAt: string;
}>;

export type AiStore = Readonly<{
  initialize(): Promise<void>;
  listProviderProfiles(): Promise<readonly AiProviderProfile[]>;
  getProviderProfile(id: AiProviderProfileId): Promise<AiProviderProfile | null>;
  upsertProviderProfile(profile: AiProviderProfile): Promise<void>;
  removeProviderProfile(id: AiProviderProfileId): Promise<void>;
  listConversations(workspaceId: WorkspaceId): Promise<readonly AiConversation[]>;
  upsertConversation(conversation: AiConversation): Promise<void>;
  listMessages(conversationId: AiConversationId): Promise<readonly AiConversationMessage[]>;
  upsertMessage(message: AiConversationMessage): Promise<void>;
  removeConversation(id: AiConversationId): Promise<void>;
  recordToolAudit(record: AiToolAuditRecord): Promise<void>;
  listToolAudit(workspaceId: WorkspaceId, limit?: number): Promise<readonly AiToolAuditRecord[]>;
  clearToolAudit(workspaceId: WorkspaceId): Promise<void>;
  upsertProposal(proposal: AiProposal): Promise<void>;
  listProposals(workspaceId: WorkspaceId): Promise<readonly AiProposal[]>;
  getProposal(id: AiProposalId): Promise<AiProposal | null>;
  setProposalState(id: AiProposalId, state: AiProposalState, updatedAt: string): Promise<void>;
  listAutomations(workspaceId: WorkspaceId): Promise<readonly AiAutomation[]>;
  upsertAutomation(automation: AiAutomation): Promise<void>;
  removeAutomation(id: AiAutomationId): Promise<void>;
  getExecution(automationId: AiAutomationId, occurrenceKey: string): Promise<AiExecution | null>;
  upsertExecution(execution: AiExecution): Promise<void>;
  recordPrompt(workspaceId: WorkspaceId, prompt: string, usedAt: string): Promise<void>;
  listPromptHistory(workspaceId: WorkspaceId, limit?: number): Promise<readonly string[]>;
  clearPromptHistory(workspaceId: WorkspaceId): Promise<void>;
}>;
