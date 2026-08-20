import { describe, expect, test } from "vitest";

import { createAiSecretStore } from "../../../src/ai/ai-secret-store";

const PROFILE_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("AI secret store", () => {
  test("stores a trimmed key under a profile-scoped secure name", async () => {
    const values = new Map<string, string>();
    const store = createAiSecretStore({
      isAvailableAsync: async () => true,
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
    });

    await store.set(PROFILE_ID, "  sk-private  ");
    expect(await store.get(PROFILE_ID)).toBe("sk-private");
    expect([...values.keys()]).toEqual([`inkstone.ai.provider.${PROFILE_ID}`]);
    await store.remove(PROFILE_ID);
    expect(await store.get(PROFILE_ID)).toBeNull();
  });

  test("rejects invalid profile identities and empty keys", async () => {
    const store = createAiSecretStore({
      isAvailableAsync: async () => true,
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    });
    await expect(store.set(PROFILE_ID, "   ")).rejects.toThrow("Invalid AI provider API key");
    await expect(store.get("../settings")).rejects.toThrow("Invalid AI provider profile identity");
  });
});
