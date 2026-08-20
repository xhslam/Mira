import { describe, expect, it } from "vitest";

import { describeAiSendFailure } from "../../../src/app/ai-error-message";

describe("describeAiSendFailure", () => {
  it("rewrites internal editor-bridge failures into an actionable message", () => {
    expect(describeAiSendFailure(new Error("Editor flush timed out"))).toBe(
      "The editor could not confirm the current note in time. Try again in a moment.",
    );
    expect(describeAiSendFailure(new Error("The editor workspace is unavailable"))).toBe(
      "The editor could not confirm the current note in time. Try again in a moment.",
    );
  });

  it("explains missing provider configuration", () => {
    expect(describeAiSendFailure(new Error("AI provider API key is missing"))).toContain(
      "AI provider settings",
    );
    expect(describeAiSendFailure(new Error("AI provider profile not found"))).toContain(
      "no longer configured",
    );
  });

  it("keeps real provider errors verbatim so the cause stays visible", () => {
    expect(describeAiSendFailure(new Error("model not found"))).toBe("model not found");
    expect(describeAiSendFailure(new Error("HTTP 401 from the AI provider"))).toBe(
      "HTTP 401 from the AI provider",
    );
  });

  it("falls back for non-Error and empty failures", () => {
    expect(describeAiSendFailure("boom")).toBe("The AI request failed.");
    expect(describeAiSendFailure(new Error(""))).toBe("The AI request failed.");
  });
});
