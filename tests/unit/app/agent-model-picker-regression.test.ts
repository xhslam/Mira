import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(`src/app/${name}.tsx`, "utf8");

describe("Agent model selection", () => {
  it("selects an eligible profile for the current chat and keeps configuration separate", () => {
    const chat = source("ai-workspace-screen");
    const picker = source("ai-model-picker");
    const services = source("ai-provider-sheet");

    expect(chat).toContain("initialConversation?.providerProfileId");
    expect(chat).toContain("summaries.filter((item) => item.hasApiKey)");
    expect(chat).toContain("setActiveProfileId(profile.id)");
    expect(chat).toContain("providerProfileId: activeProfile.id");
    expect(chat).not.toContain("profiles.indexOf");
    expect(picker).toContain("搜索模型");
    expect(picker).toContain("accessibilityState={{ checked: selected }}");
    expect(picker).toContain("管理模型服务");
    expect(services).toContain("{!showForm ?");
    expect(services).toContain('label="模型 ID"');
  });

  it("uses concise Chinese labels without obscuring current-note and workspace scope", () => {
    const context = source("ai-context-sheet");
    expect(context).toContain("笔记上下文");
    expect(context).toContain("允许搜索整个工作区");
    expect(context).toContain("props.currentPath ?");
    expect(context).not.toContain("permissionBody");
  });

  it("keeps the square workspace sidebar in the same window with reduced-motion support", () => {
    expect(source("global-sidebar")).toMatch(/<OverlaySideSheet\s+sidebar/u);
    const overlay = source("overlay-side-sheet");
    expect(overlay).toContain("!sidebar && styles.roundedSheet");
    expect(overlay).toContain("duration: visible ? 460 : 280");
    expect(overlay).toContain("if (reduceMotion)");
    expect(overlay).not.toMatch(/<Modal\s/u);
  });
});
