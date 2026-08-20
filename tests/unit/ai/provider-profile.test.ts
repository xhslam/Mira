import { describe, expect, test } from "vitest";

import { aiProviderCapabilities, parseAiProviderProfile } from "../../../src/ai/provider-profile";

const PROFILE = Object.freeze({
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: " DeepSeek ",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com/",
  model: " deepseek-v4-pro ",
  connectionStatus: "untested",
  lastTestedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

describe("AI provider profile", () => {
  test("normalizes a valid HTTPS provider without retaining secrets", () => {
    const result = parseAiProviderProfile(PROFILE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("DeepSeek");
    expect(result.value.baseUrl).toBe("https://api.deepseek.com");
    expect(result.value.model).toBe("deepseek-v4-pro");
    expect(result.value).not.toHaveProperty("apiKey");
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  test.each([
    "http://api.example.com",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
  ])("rejects an unsafe base URL: %s", (baseUrl) => {
    const result = parseAiProviderProfile({ ...PROFILE, baseUrl });
    expect(result).toEqual({ ok: false, error: { code: "INSECURE_BASE_URL" } });
  });

  test("advertises native web search only for the Responses adapter", () => {
    expect(aiProviderCapabilities("openai-compatible-chat").nativeWebSearch).toBe(false);
    expect(aiProviderCapabilities("openai-responses").nativeWebSearch).toBe(true);
  });
});
