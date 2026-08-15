import type { AiStore } from "./ai-store";
import type { AiSecretStore } from "./ai-secret-store";
import type { AiProviderRegistry } from "./provider-registry";
import type { WorkspaceRepository } from "../workspace/workspace-repository";
import type { WorkspaceSearch } from "../search/workspace-search";
import type { SettingsStore } from "../app/settings-store";
import { AI_LIMITS } from "./limits";
import { latestAutomationOccurrence, type AiExecution } from "./automation";
import { aiProviderCapabilities } from "./provider-profile";
import { createAiConversationService } from "./conversation-service";
import { createAiWorkspaceToolRuntime } from "./workspace-tool-runtime";
import type { AiProposal } from "./proposal";
import type { WorkspaceId } from "../domain/identifiers";

export function createAiAutomationRunner(
  options: Readonly<{
    store: AiStore;
    secrets: AiSecretStore;
    providers: AiProviderRegistry;
    repository: WorkspaceRepository;
    search: WorkspaceSearch;
    settings: SettingsStore;
    workspaceId: WorkspaceId;
    createId: () => string;
    now: () => Date;
  }>,
): Readonly<{ runDue(): Promise<Readonly<{ ran: number; paused: number; failed: number }>> }> {
  const conversations = createAiConversationService({
    store: options.store,
    secrets: options.secrets,
    providers: options.providers,
    createId: options.createId,
    now: options.now,
  });

  return Object.freeze({
    async runDue() {
      const settings = await options.settings.load();
      const allTasks = await options.store.listAutomations(options.workspaceId);
      let ran = 0;
      let paused = 0;
      let failed = 0;
      for (const task of allTasks.filter((item) => item.enabled)) {
        const occurrence = latestAutomationOccurrence(task, options.now());
        const existing = await options.store.getExecution(task.id, occurrence.key);
        if (
          existing?.state === "succeeded" ||
          existing?.state === "terminal" ||
          existing?.state === "running"
        )
          continue;
        const createdAt = existing?.createdAt ?? options.now().toISOString();
        const attempt = (existing?.attempt ?? 0) + 1;
        const executionBase = {
          id: (existing?.id ?? options.createId()) as AiExecution["id"],
          automationId: task.id,
          occurrenceKey: occurrence.key,
          attempt,
          proposalIds: Object.freeze(existing?.proposalIds ?? []),
          createdAt,
        };
        const profile = task.providerProfileId
          ? await options.store.getProviderProfile(task.providerProfileId)
          : null;
        const wholeAllowed = settings.ok && settings.value.ai.allowWholeWorkspaceSearch;
        const blocked =
          !profile ||
          (task.requiresWebSearch && !aiProviderCapabilities(profile.adapter).nativeWebSearch) ||
          (task.requiresWholeWorkspaceSearch && !wholeAllowed);
        if (blocked) {
          paused += 1;
          await options.store.upsertExecution(
            Object.freeze({
              ...executionBase,
              state: "paused",
              errorCode: "precondition-unavailable",
              updatedAt: options.now().toISOString(),
            }),
          );
          continue;
        }
        const reads = await Promise.all(
          task.contextPaths.map((path) => options.repository.read(path)),
        );
        if (reads.some((read) => !read.ok)) {
          paused += 1;
          await options.store.upsertExecution(
            Object.freeze({
              ...executionBase,
              state: "paused",
              errorCode: "context-unavailable",
              updatedAt: options.now().toISOString(),
            }),
          );
          continue;
        }
        const snapshots = reads.flatMap((read) => (read.ok ? [read.value] : []));
        await options.store.upsertExecution(
          Object.freeze({
            ...executionBase,
            state: "running",
            errorCode: null,
            updatedAt: options.now().toISOString(),
          }),
        );
        const proposalIds: string[] = [];
        try {
          const tools = createAiWorkspaceToolRuntime({
            repository: options.repository,
            search: options.search,
            allowWholeWorkspaceSearch: task.requiresWholeWorkspaceSearch && wholeAllowed,
            authorizedPaths: task.contextPaths,
            createId: options.createId,
            writableNotes: snapshots.map((snapshot) =>
              Object.freeze({
                path: snapshot.path,
                baseRevision: `hash:${snapshot.contentHash}`,
                baseHash: snapshot.contentHash,
                baseContent: snapshot.markdown,
              }),
            ),
            createReplaceProposal: async (candidate) => {
              const now = options.now().toISOString();
              const proposal = Object.freeze({
                id: options.createId() as AiProposal["id"],
                workspaceId: task.workspaceId,
                conversationId: null,
                operation: "replace" as const,
                targetPath: candidate.path,
                baseRevision: candidate.baseRevision,
                baseHash: candidate.baseHash,
                baseContent: candidate.baseContent,
                proposedContent: candidate.content,
                state: "pending" as const,
                explanation: candidate.explanation,
                createdAt: now,
                updatedAt: now,
              });
              await options.store.upsertProposal(proposal);
              proposalIds.push(proposal.id);
              return proposal.id;
            },
          });
          for await (const event of conversations.stream({
            workspaceId: task.workspaceId,
            providerProfileId: profile.id,
            prompt: task.prompt,
            context: snapshots.map((snapshot) =>
              Object.freeze({ label: snapshot.path, content: snapshot.markdown }),
            ),
            tools,
            ...(task.requiresWebSearch ? { nativeWebSearch: true } : {}),
          })) {
            // Exhaust the stream; durable messages, audits, and proposals are recorded by services.
            void event;
          }
          ran += 1;
          await options.store.upsertExecution(
            Object.freeze({
              ...executionBase,
              state: "succeeded",
              proposalIds: Object.freeze(proposalIds),
              errorCode: null,
              updatedAt: options.now().toISOString(),
            }),
          );
        } catch (error) {
          failed += 1;
          await options.store.upsertExecution(
            Object.freeze({
              ...executionBase,
              state: attempt >= AI_LIMITS.maxAutomationAttempts ? "terminal" : "retryable",
              errorCode: error instanceof Error ? error.name : "automation-failed",
              updatedAt: options.now().toISOString(),
            }),
          );
        }
      }
      return Object.freeze({ ran, paused, failed });
    },
  });
}
