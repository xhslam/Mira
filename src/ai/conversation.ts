import type { AiProviderProfileId } from "./provider-profile";
import type { WorkspaceId } from "../domain/identifiers";

export type AiConversationId = string & { readonly __brand: "AiConversationId" };
export type AiMessageId = string & { readonly __brand: "AiMessageId" };

export type AiConversation = Readonly<{
  id: AiConversationId;
  workspaceId: WorkspaceId;
  title: string;
  providerProfileId: AiProviderProfileId | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AiConversationMessage = Readonly<{
  id: AiMessageId;
  conversationId: AiConversationId;
  role: "user" | "assistant";
  content: string;
  status: "completed" | "incomplete";
  createdAt: string;
}>;
