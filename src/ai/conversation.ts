import type { AiProviderProfileId } from "./provider-profile";
import type { WorkspaceId } from "../domain/identifiers";

export type AiConversationId = string & { readonly __brand: "AiConversationId" };
export type AiMessageId = string & { readonly __brand: "AiMessageId" };

export type AiConversation = Readonly<{
  id: AiConversationId;
  workspaceId: WorkspaceId;
  title: string;
  preview?: string;
  pinned?: boolean;
  providerProfileId: AiProviderProfileId | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AiConversationMessage = Readonly<{
  id: AiMessageId;
  conversationId: AiConversationId;
  role: "user" | "assistant";
  references?: readonly Readonly<{ id: string; title: string }>[];
  content: string;
  status: "completed" | "incomplete";
  createdAt: string;
}>;
