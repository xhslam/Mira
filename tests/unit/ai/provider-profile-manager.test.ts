import { describe, expect, test } from "vitest";

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
