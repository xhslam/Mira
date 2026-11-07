import { describe, expect, it } from "vitest";
import { emptyAgentSnapshot, parseAgentSnapshot } from "../../../src/agent";

const at = "2026-11-05T02:00:00Z";
const item = {
  id: "c",
  workspaceId: "w",
  title: "用户事项",
  responsibility: "self",
  source: { kind: "manual", reference: "user" },
  occurredAt: at,
  dueAt: null,
  status: "open",
  snoozedUntil: null,
  evidence: [],
  correction: null,
  createdAt: at,
  updatedAt: at,
};

describe("Agent snapshot trust boundaries", () => {
  it("rejects cross-workspace nested records even with a valid outer workspace", () => {
    expect(() =>
      parseAgentSnapshot(
        { ...emptyAgentSnapshot("w"), commitments: [{ ...item, workspaceId: "other" }] },
        "w",
      ),
    ).toThrow("跨工作区");
  });
  it("rejects duplicate IDs and unknown status input", () => {
    expect(() =>
      parseAgentSnapshot({ ...emptyAgentSnapshot("w"), commitments: [item, item] }, "w"),
    ).toThrow("ID 重复");
    expect(() =>
      parseAgentSnapshot(
        { ...emptyAgentSnapshot("w"), commitments: [{ ...item, status: "auto-completed" }] },
        "w",
      ),
    ).toThrow();
  });
  it("rejects missing/deceptive source references rather than stripping untrusted metadata", () => {
    expect(() =>
      parseAgentSnapshot(
        { ...emptyAgentSnapshot("w"), commitments: [{ ...item, source: { kind: "manual" } }] },
        "w",
      ),
    ).toThrow();
    expect(() =>
      parseAgentSnapshot(
        {
          ...emptyAgentSnapshot("w"),
          commitments: [{ ...item, source: { ...item.source, permission: "write-all" } }],
        },
        "w",
      ),
    ).toThrow();
  });
  it("does not allow successful runs without a durable report or outbox entries with dangling results", () => {
    const run = {
      id: "r",
      workspaceId: "w",
      reason: "manual",
      delegationId: null,
      occurrenceKey: null,
      delegationVersion: null,
      status: "succeeded",
      startedAt: at,
      finishedAt: at,
      reportId: null,
      error: null,
    };
    expect(() => parseAgentSnapshot({ ...emptyAgentSnapshot("w"), runs: [run] }, "w")).toThrow(
      "已保存结果",
    );
    const entry = {
      id: "o",
      workspaceId: "w",
      runId: "r",
      reportId: "not-real",
      target: "app-inbox",
      status: "pending",
      createdAt: at,
      updatedAt: at,
      error: null,
    };
    expect(() => parseAgentSnapshot({ ...emptyAgentSnapshot("w"), outbox: [entry] }, "w")).toThrow(
      "引用无效",
    );
  });
  it("allows only explicitly scheduled runs with an existing delegation and occurrence", () => {
    const run = {
      id: "r",
      workspaceId: "w",
      reason: "scheduled",
      delegationId: "fake",
      occurrenceKey: "today",
      delegationVersion: 1,
      status: "running",
      startedAt: at,
      finishedAt: null,
      reportId: null,
      error: null,
    };
    expect(() => parseAgentSnapshot({ ...emptyAgentSnapshot("w"), runs: [run] }, "w")).toThrow(
      "有效委托",
    );
  });
});
