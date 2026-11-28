import type { AiConversation, AiConversationMessage } from "./conversation";
import type { MemoryEntry } from "./memory-store";

const CONTENT_LIMIT = 8000;

function prefix(text: string, limit: number) {
  return text.length <= limit ? text : text.slice(0, limit).replace(/[\uD800-\uDBFF]$/u, "");
}

export type ConversationMemoryDraft = Readonly<{ entry: MemoryEntry; partial: boolean }>;

export function createConversationMemoryDraft(
  conversation: AiConversation,
  messages: readonly AiConversationMessage[],
  id: string,
  updatedAt: string,
): ConversationMemoryDraft {
  let content = "";
  let source: MemoryEntry["source"] = null;
  let partial = messages.length >= 1000; // listMessages read cap
  for (const message of messages) {
    if (
      message.conversationId !== conversation.id ||
      message.status !== "completed" ||
      !message.content.trim()
    )
      continue;
    const label = message.role === "user" ? "你：" : "Mira：";
    const separator = content ? "\n\n" : "";
    const remaining = CONTENT_LIMIT - content.length - separator.length - label.length;
    if (remaining <= 0) {
      partial = true;
      break;
    }
    const excerpt = prefix(message.content, remaining);
    if (excerpt.trim()) {
      content += separator + label + excerpt;
      source ??= { conversationId: conversation.id, messageId: message.id, quote: excerpt };
    }
    if (excerpt.length < message.content.length) {
      partial = true;
      break;
    }
  }
  if (!content) throw new Error("此对话暂无已完成的消息");
  return {
    partial,
    entry: {
      id,
      workspaceId: conversation.workspaceId,
      title: prefix(conversation.title.trim(), 120) || "对话记忆",
      content: content.trim(),
      category: "topic",
      enabled: true,
      source,
      updatedAt,
    },
  };
}
