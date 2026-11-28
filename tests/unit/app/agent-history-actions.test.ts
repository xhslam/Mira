import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  shouldCaptureHistorySwipe,
  shouldOpenHistoryActions,
} from "../../../src/app/agent-history-swipe";

const read = (path: string) =>
  readFileSync(new URL(`../../../src/app/${path}`, import.meta.url), "utf8");

describe("Agent history row actions", () => {
  it("captures a deliberate right swipe without stealing taps, scrolling, or a closed left swipe", () => {
    expect(shouldCaptureHistorySwipe(false, 24, 4)).toBe(true);
    expect(shouldCaptureHistorySwipe(false, 4, 2)).toBe(false);
    expect(shouldCaptureHistorySwipe(false, 15, 24)).toBe(false);
    expect(shouldCaptureHistorySwipe(false, -25, 1)).toBe(false);
    expect(shouldCaptureHistorySwipe(true, -25, 1)).toBe(true);
  });

  it("requires a deliberate distance to open or close", () => {
    expect(shouldOpenHistoryActions(false, 16, 190)).toBe(false);
    expect(shouldOpenHistoryActions(false, 66, 190)).toBe(true);
    expect(shouldOpenHistoryActions(true, -16, 190)).toBe(true);
    expect(shouldOpenHistoryActions(true, -66, 190)).toBe(false);
  });

  it("moves memory saving from individual bubbles to the history list only", () => {
    const chat = read("ai-workspace-screen.tsx");
    const home = read("agent-home-screen.tsx");
    expect(chat).not.toContain("保存这条消息为记忆");
    expect(chat).not.toContain("保存为记忆");
    expect(chat).toContain('accessibilityLabel="记忆与引用对话"');
    expect(home).toContain("<AgentHistorySwipeRow");
    expect(home).toContain("services.aiStore.setConversationPinned(");
    expect(home).toContain("services.aiStore.removeConversation(workspaceId, item.id)");
    expect(home).toContain("<ConversationMemorySheet");
  });
});
