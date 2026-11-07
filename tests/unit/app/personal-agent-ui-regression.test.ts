import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveLearningSurface } from "../../../src/learning/learning-navigation";
import {
  createInitialLearningSnapshot,
  normalizeLearningSnapshot,
} from "../../../src/learning/learning-types";
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("Personal Agent UI integration contract", () => {
  it("retires commitments, delegations, review and worker execution from the mobile app", () => {
    const shell = read("src/app/app-shell-screen.tsx");
    const home = read("src/app/agent-home-screen.tsx");
    const services = read("src/app/app-services.ts");
    const chat = read("src/app/ai-workspace-screen.tsx");
    expect(shell).toContain("<AgentHomeScreen");
    expect(shell).not.toContain("runForegroundAgent");
    expect(home).not.toMatch(/PersonalAgentScreen|事项与委托/u);
    expect(services).not.toMatch(/createAgentService|createExpoAgentStore|createExpoWorkerClient/u);
    expect(chat).not.toMatch(/services\.agent\b|Agent 事项与委托/u);
  });
  it("moves English coach to Learning while preserving successful-pause-before-return", () => {
    expect(resolveLearningSurface("english-coach")).toBe("english-coach");
    const snapshot = createInitialLearningSnapshot();
    expect(
      normalizeLearningSnapshot({ ...snapshot, ui: { ...snapshot.ui, section: "english-coach" } })
        .ui.section,
    ).toBe("english-coach");
    const learning = read("src/app/learning-screen.tsx");
    const coach = read("src/app/english-coach-screen.tsx");
    const chat = read("src/app/ai-workspace-screen.tsx");
    expect(learning).toContain("<EnglishCoachScreen");
    expect(learning).toContain("const latest = await store.load()");
    expect(coach.indexOf("const paused = await pauseCurrentLesson()")).toBeLessThan(
      coach.indexOf("await onClose()"),
    );
    expect(chat).not.toContain("EnglishCoachScreen");
    expect(chat).not.toContain("createExpoLearningStore");
    expect(read("src/app/agent-home-screen.tsx")).toContain("搜索历史会话");
    expect(chat).toContain("activeDocument ? await controller.captureAiSnapshot() : null");
  });
  it("never equips the note reader with workspace tools or external-send capability", () => {
    const reader = read("src/agent/presentation/review-reader.ts");
    expect(reader).toContain("untrusted DATA");
    expect(reader).not.toContain("createAiWorkspaceToolRuntime");
    expect(reader).toContain("signal.addEventListener");
  });
});
