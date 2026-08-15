import type { WorkspaceId } from "../domain/identifiers";
import type { AiConversationId } from "./conversation";

export type AiProposalId = string & Readonly<{ __brand: "AiProposalId" }>;
export type AiProposalState = "pending" | "applied" | "rejected" | "stale" | "apply_failed";

export type AiProposal = Readonly<{
  id: AiProposalId;
  workspaceId: WorkspaceId;
  conversationId: AiConversationId | null;
  operation: "replace";
  targetPath: string;
  baseRevision: string | null;
  baseHash: string | null;
  baseContent: string;
  proposedContent: string;
  state: AiProposalState;
  explanation: string;
  createdAt: string;
  updatedAt: string;
}>;
