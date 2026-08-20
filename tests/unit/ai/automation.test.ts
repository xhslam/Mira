import { describe, expect, test } from "vitest";

import { latestAutomationOccurrence, type AiAutomation } from "../../../src/ai/automation";

const BASE = Object.freeze({
  id: "123e4567-e89b-42d3-a456-426614174000",
  workspaceId: "223e4567-e89b-42d3-a456-426614174000",
  scheduleVersion: "v1",
  name: "Daily summary",
  prompt: "Summarize",
  timezone: "Asia/Shanghai",
  providerProfileId: null,
  contextPaths: ["daily.md"],
  requiresWebSearch: false,
  requiresWholeWorkspaceSearch: false,
  enabled: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}) as unknown as Omit<AiAutomation, "schedule">;

describe("AI automation occurrences", () => {
  test("returns only the latest missed daily occurrence", () => {
    const task = Object.freeze({
      ...BASE,
      schedule: { kind: "daily", hour: 9, minute: 0 },
    }) as AiAutomation;
    expect(latestAutomationOccurrence(task, new Date("2026-08-01T02:00:00.000Z"))).toEqual({
      key: "daily:2026-08-01",
    });
    expect(latestAutomationOccurrence(task, new Date("2026-08-01T00:30:00.000Z"))).toEqual({
      key: "daily:2026-07-31",
    });
  });

  test("uses the latest scheduled weekday instead of replaying old weeks", () => {
    const task = Object.freeze({
      ...BASE,
      schedule: { kind: "weekly", weekday: 1, hour: 9, minute: 0 },
    }) as AiAutomation;
    expect(latestAutomationOccurrence(task, new Date("2026-08-01T04:00:00.000Z"))).toEqual({
      key: "weekly:2026-07-27",
    });
  });

  test("debounces app-open tasks into one deterministic window", () => {
    const task = Object.freeze({
      ...BASE,
      schedule: { kind: "app-open", debounceMinutes: 30 },
    }) as AiAutomation;
    const first = latestAutomationOccurrence(task, new Date("2026-08-01T00:01:00.000Z"));
    const second = latestAutomationOccurrence(task, new Date("2026-08-01T00:29:59.000Z"));
    expect(first).toEqual(second);
  });
});
