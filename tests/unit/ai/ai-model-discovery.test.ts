import { describe, expect, it, vi } from "vitest";

import {
  aiModelsEndpoint,
  createAiModelDiscovery,
  parseDiscoveredModels,
} from "../../../src/ai/ai-model-discovery";
import type { AiProviderProfileId } from "../../../src/ai/provider-profile";

describe("AI model discovery", () => {
  it("builds a provider-relative models endpoint and rejects unsafe URLs", () => {
    expect(aiModelsEndpoint("https://openrouter.ai/api/v1/")).toBe(
      "https://openrouter.ai/api/v1/models",
    );
    expect(() => aiModelsEndpoint("http://localhost:11434/v1")).toThrow("HTTPS");
  });

  it("normalizes, sorts and deduplicates provider model records", () => {
    expect(
      parseDiscoveredModels({
        data: [{ id: "model-z" }, { id: "model-a" }, { id: "model-z" }, { name: "ignored" }],
      }),
    ).toEqual(["model-a", "model-z"]);
  });

  it("uses a stored key without exposing it and returns the live model catalog", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer sk-private" });
      return new Response(
        JSON.stringify({ data: [{ id: "custom/model-2" }, { id: "custom/model-1" }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const discovery = createAiModelDiscovery({
      secrets: Object.freeze({
        available: async () => true,
        get: async () => "sk-private",
        set: async () => undefined,
        remove: async () => undefined,
      }),
      fetcher: fetcher as typeof fetch,
    });

    await expect(
      discovery.discover({
        baseUrl: "https://example.com/v1",
        profileId: "123e4567-e89b-42d3-a456-426614174000" as AiProviderProfileId,
      }),
    ).resolves.toEqual(["custom/model-1", "custom/model-2"]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
