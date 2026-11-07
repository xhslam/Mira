import { describe, expect, it } from "vitest";

import { AI_PROVIDER_CATALOG, providerCatalogEntry } from "../../../src/ai/provider-catalog";

describe("AI provider catalog", () => {
  it("offers mainstream presets without removing the custom provider path", () => {
    expect(AI_PROVIDER_CATALOG.map((item) => item.id)).toEqual(
      expect.arrayContaining(["deepseek", "openai", "openrouter", "siliconflow", "groq", "custom"]),
    );
    expect(providerCatalogEntry("custom")).toMatchObject({ baseUrl: "", defaultModel: "" });
    expect(Object.isFrozen(AI_PROVIDER_CATALOG)).toBe(true);
  });
});
