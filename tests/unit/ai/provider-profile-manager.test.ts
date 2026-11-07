import { describe, expect, test } from "vitest";

import { collectLearningResponse } from "../../../src/learning/learning-ai";
import { DEFAULT_SETTINGS } from "../../../src/app/settings-store";
import { success } from "../../../src/domain/result";
import type { AiProvider } from "../../../src/ai/provider";
import type { AiSecretStore } from "../../../src/ai/ai-secret-store";
import type { AiStore } from "../../../src/ai/ai-store";
import { createAiProviderProfileManager } from "../../../src/ai/provider-profile-manager";
import type { AiProviderProfile, AiProviderProfileId } from "../../../src/ai/provider-profile";

const ID = "123e4567-e89b-42d3-a456-426614174000" as AiProviderProfileId;

function harness() {
  const profiles = new Map<AiProviderProfileId, AiProviderProfile>();
  const secrets = new Map<string, string>();
  const store: AiStore = Object.freeze({
    initialize: async () => undefined,
    listProviderProfiles: async () => Object.freeze([...profiles.values()]),
    getProviderProfile: async (id) => profiles.get(id) ?? null,
    upsertProviderProfile: async (profile) => {
      profiles.set(profile.id, profile);
    },
    removeProviderProfile: async (id) => {
      profiles.delete(id);
    },
    listConversations: async () => Object.freeze([]),
    upsertConversation: async () => undefined,
    listMessages: async () => Object.freeze([]),
    upsertMessage: async () => undefined,
    removeConversation: async () => undefined,
    recordToolAudit: async () => undefined,
    listToolAudit: async () => [],
    clearToolAudit: async () => undefined,
    upsertProposal: async () => undefined,
    listProposals: async () => [],
    getProposal: async () => null,
    setProposalState: async () => undefined,
    listAutomations: async () => [],
    upsertAutomation: async () => undefined,
    removeAutomation: async () => undefined,
    getExecution: async () => null,
    upsertExecution: async () => undefined,
    recordPrompt: async () => undefined,
    listPromptHistory: async () => [],
    clearPromptHistory: async () => undefined,
  });
  const secretStore: AiSecretStore = Object.freeze({
    available: async () => true,
    get: async (id) => secrets.get(id) ?? null,
    set: async (id, value) => {
      secrets.set(id, value);
    },
    remove: async (id) => {
      secrets.delete(id);
    },
  });
  return { profiles, secrets, store, secretStore };
}

describe("AI provider profile manager", () => {
  test("learning sends through the shared default and re-resolves it after removal", async () => {
    const state = harness();
    const alternate = "123e4567-e89b-42d3-a456-426614174001" as AiProviderProfileId;
    const ids = [ID, alternate];
    const manager = createAiProviderProfileManager({
      store: state.store,
      secrets: state.secretStore,
      createId: () => ids.shift()!,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });
    for (const model of ["first-model", "shared-default"]) {
      await manager.save({
        name: model,
        adapter: "openai-compatible-chat",
        baseUrl: "https://example.com/v1",
        model,
        apiKey: `test-key-${model}`,
      });
    }
    const requests: Parameters<AiProvider["stream"]>[0][] = [];
    const provider: AiProvider = {
      async *stream(options) {
        requests.push(options);
        yield { type: "text-delta", text: options.profile.model };
      },
    };
    const services = {
      aiProviderProfiles: manager,
      aiSecretStore: state.secretStore,
      aiProviders: { get: () => provider },
      settingsStore: {
        load: async () =>
          success({
            ...DEFAULT_SETTINGS,
            ai: { ...DEFAULT_SETTINGS.ai, activeProviderProfileId: alternate },
          }),
      },
    };
    const send = () =>
      collectLearningResponse({
        services,
        messages: [{ role: "user", content: "Explain this sentence" }],
      });

    await expect(send()).resolves.toEqual({ text: "shared-default", providerProfileId: alternate });
    expect(requests[0]?.apiKey).toBe("test-key-shared-default");
    await state.secretStore.remove(alternate);
    await expect(send()).resolves.toEqual({ text: "first-model", providerProfileId: ID });
    expect(requests[1]?.apiKey).toBe("test-key-first-model");
    await manager.remove(ID);
    await expect(send()).rejects.toThrow("请先在 Agent");
    expect(requests).toHaveLength(2);
  });

  test("persists profile metadata separately from its secret", async () => {
    const state = harness();
    const manager = createAiProviderProfileManager({
      store: state.store,
      secrets: state.secretStore,
      createId: () => ID,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });
    const saved = await manager.save({
      name: "DeepSeek",
      adapter: "openai-compatible-chat",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      apiKey: "sk-private",
    });

    expect(saved.hasApiKey).toBe(true);
    expect(state.secrets.get(ID)).toBe("sk-private");
    expect(JSON.stringify(state.profiles.get(ID))).not.toContain("sk-private");
  });

  test("removes the secret before profile metadata", async () => {
    const order: string[] = [];
    const state = harness();
    const manager = createAiProviderProfileManager({
      store: Object.freeze({
        ...state.store,
        removeProviderProfile: async () => {
          order.push("profile");
        },
      }),
      secrets: Object.freeze({
        ...state.secretStore,
        remove: async () => {
          order.push("secret");
        },
      }),
      createId: () => ID,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });
    await manager.remove(ID);
    expect(order).toEqual(["secret", "profile"]);
  });
});
