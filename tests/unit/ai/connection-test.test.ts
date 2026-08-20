import { describe, expect, test } from "vitest";

import { createAiConnectionTester } from "../../../src/ai/connection-test";
import type { AiProviderProfileManager } from "../../../src/ai/provider-profile-manager";
import type { AiProviderProfile, AiProviderProfileId } from "../../../src/ai/provider-profile";

const ID = "123e4567-e89b-42d3-a456-426614174000" as AiProviderProfileId;
const PROFILE = Object.freeze({
  id: ID,
  name: "DeepSeek",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
  connectionStatus: "untested",
  lastTestedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}) as AiProviderProfile;

describe("AI connection tester", () => {
  test("fails without exposing or sending a missing key", async () => {
    const statuses: string[] = [];
    const profiles = Object.freeze({
      markConnection: async (
        _id: AiProviderProfileId,
        status: AiProviderProfile["connectionStatus"],
      ) => {
        statuses.push(status);
        return PROFILE;
      },
    }) as AiProviderProfileManager;
    let contacted = false;
    const tester = createAiConnectionTester({
      store: Object.freeze({
        initialize: async () => undefined,
        listProviderProfiles: async () => [],
        getProviderProfile: async () => PROFILE,
        upsertProviderProfile: async () => undefined,
        removeProviderProfile: async () => undefined,
        listConversations: async () => [],
        upsertConversation: async () => undefined,
        listMessages: async () => [],
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
      }),
      secrets: Object.freeze({
        available: async () => true,
        get: async () => null,
        set: async () => undefined,
        remove: async () => undefined,
      }),
      profiles,
      providers: Object.freeze({
        get: () => ({
          stream: async function* () {
            contacted = true;
            yield Object.freeze({ type: "completed" as const });
          },
        }),
      }),
    });
    await expect(tester.test(ID)).resolves.toEqual({
      ok: false,
      status: "authentication-failed",
    });
    expect(contacted).toBe(false);
    expect(statuses).toEqual(["authentication-failed"]);
  });
});
