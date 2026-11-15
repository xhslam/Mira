import type { AiStore } from "./ai-store";
import type { AiConversationId } from "./conversation";
import type { WorkspaceId } from "../domain/identifiers";
import type { AiContextItem } from "./conversation-service";

/** Resolve IDs against the current workspace before reading any message bodies. */
export async function resolveConversationContext(
  store: AiStore,
  workspaceId: WorkspaceId,
  ids: readonly AiConversationId[],
  currentId?: AiConversationId,
): Promise<readonly AiContextItem[]> {
  const unique = [...new Set(ids)];
  if (unique.length > 5) throw new Error("每次最多引用 5 个对话");
  const allowed = await store.listConversations(workspaceId);
  const selected = unique.map((id) => {
    const conversation = allowed.find((item) => item.id === id);
    if (!conversation || id === currentId)
      throw new Error("引用对话不存在、已删除或不属于当前工作区");
    return conversation;
  });
  return Promise.all(
    selected.map(async (conversation) => {
      const stored = await store.listMessages(conversation.id);
      if (stored.length >= 1000)
        throw new Error(`对话「${conversation.title}」过长，请引用较短的对话`);
      const messages = stored.filter((item) => item.status === "completed");
      const transcript = messages.map((item) => `${item.role}: ${item.content}`).join("\n\n");
      // Never silently present a partial transcript as a complete source.
      if (transcript.length > 60000)
        throw new Error(`对话「${conversation.title}」过长，请引用较短的对话`);
      return Object.freeze({
        label: `对话：${conversation.title} (${conversation.id})`,
        content: transcript,
      });
    }),
  );
}
