import { describe, expect, it } from "vitest";
import {
  createAgentService,
  createAgentStore,
  agentStorePaths,
  type TextFileBackend,
  type AuthorizedNote,
  type ReviewInput,
} from "../../../src/agent";

function fixture() {
  const files = new Map<string, string>();
  let fail = false;
  const backend: TextFileBackend = {
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, text) {
      if (fail) throw new Error("disk full");
      files.set(path, text);
    },
  };
  let id = 0;
  let date = "2026-11-05T02:00:00.000Z";
  const store = createAgentStore({ backend, workspaceId: "w" });
  const options = { workspaceId: "w", store, clock: () => date, createId: () => `id-${++id}` };
  const service = createAgentService(options);
  return {
    service,
    store,
    backend,
    files,
    options,
    setFail: (value: boolean) => {
      fail = value;
    },
    setDate: (value: string) => {
      date = value;
    },
  };
}
const manual = { title: "给客户回复", source: { kind: "manual" as const, reference: "user" } };
const note: AuthorizedNote = {
  id: "n",
  workspaceId: "w",
  title: "会议",
  text: "我需要发送合同。",
  authorized: true,
};
const review: ReviewInput = {
  reason: "manual",
  notes: [note],
  extract: async () => [{ title: "发送合同", noteId: "n", quote: "发送合同" }],
};

describe("Agent service authoritative manual workflows", () => {
  it("starts truly empty with no provider or sample records and requires loading", async () => {
    const { service } = fixture();
    expect(service.getSnapshot()).toBeNull();
    await expect(service.addCommitment(manual)).rejects.toThrow("先加载");
    const state = await service.load();
    expect(state.commitments).toEqual([]);
    expect(state.delegations).toEqual([]);
    expect(state.reports).toEqual([]);
  });
  it("returns deeply immutable detached snapshots", async () => {
    const { service } = fixture();
    await service.load();
    const input = { ...manual, evidence: [{ sourceId: "user", quote: "我承诺" }] };
    const previous = await service.addCommitment(input);
    input.evidence[0]!.quote = "changed";
    expect(previous.commitments[0]!.evidence[0]!.quote).toBe("我承诺");
    expect(Object.isFrozen(previous.commitments[0]!.source)).toBe(true);
    expect(() => (previous.commitments as unknown[]).push({})).toThrow();
    const next = await service.transitionCommitment(previous.commitments[0]!.id, "done");
    expect(previous.commitments[0]!.status).toBe("open");
    expect(next.commitments[0]!.status).toBe("done");
  });
  it("allows responsibility, deadlines, corrections, snooze and explicit status changes", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.addCommitment(manual);
    const id = state.commitments[0]!.id;
    await service.updateCommitment(id, {
      responsibility: "other",
      dueAt: "2026-11-06T10:00:00Z",
      correction: "等王同学回复",
      snoozedUntil: "2026-11-07T10:00:00Z",
    });
    const waiting = await service.transitionCommitment(id, "waiting");
    expect(waiting.commitments[0]).toMatchObject({
      responsibility: "other",
      status: "waiting",
      snoozedUntil: null,
      correction: "等王同学回复",
    });
    const done = await service.transitionCommitment(id, "done");
    expect(done.commitments[0]!.status).toBe("done");
  });
  it("validates boundaries without publishing invalid state", async () => {
    const { service } = fixture();
    const initial = await service.load();
    await expect(service.addCommitment({ ...manual, title: "   " })).rejects.toThrow();
    await expect(service.addCommitment({ ...manual, dueAt: "tomorrow" })).rejects.toThrow();
    await expect(
      service.addCommitment({ ...manual, source: { kind: "model", reference: "fake" } }),
    ).rejects.toThrow("候选");
    expect(service.getSnapshot()).toBe(initial);
    await expect(
      service.updateCommitment("other-workspace-id", { title: "changed" }),
    ).rejects.toThrow("找不到");
  });
  it("serializes concurrent writes against the latest snapshot", async () => {
    const { service } = fixture();
    await service.load();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.addCommitment({ ...manual, title: `事项 ${i}` }),
      ),
    );
    expect(service.getSnapshot()!.commitments).toHaveLength(12);
    expect(service.getSnapshot()!.revision).toBe(12);
  });
  it("does not publish failed writes and blocks already queued follow-up writes", async () => {
    const f = fixture();
    const initial = await f.service.load();
    f.setFail(true);
    const results = await Promise.allSettled([
      f.service.addCommitment(manual),
      f.service.addCommitment({ ...manual, title: "第二项" }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(f.service.getSnapshot()).toBe(initial);
    f.setFail(false);
    await f.service.addCommitment(manual);
    expect(f.service.getSnapshot()!.commitments).toHaveLength(1);
  });
  it("migrates nonempty legacy records without changing user titles, source or correction", async () => {
    const f = fixture();
    await f.service.load();
    const added = await f.service.addCommitment(manual);
    const updated = await f.service.updateCommitment(added.commitments[0]!.id, {
      correction: "用户保留的修正",
    });
    const { outbox: _, ...legacy } = updated;
    f.files.set(agentStorePaths("w").primary, JSON.stringify({ ...legacy, schemaVersion: 1 }));
    const restored = createAgentService(f.options);
    expect((await restored.load()).commitments).toEqual(updated.commitments);
  });
  it("persists hand-entered data across new service instances", async () => {
    const f = fixture();
    await f.service.load();
    await f.service.addCommitment(manual);
    const restored = createAgentService(f.options);
    expect((await restored.load()).commitments[0]!.title).toBe(manual.title);
  });
});

describe("delegation confirmation and scope", () => {
  it("keeps Chinese 每日结束 as a draft without guessing a time", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.addDelegation({
      goal: "每天结束时检查我忘了什么",
      scope: ["commitments", "notes"],
    });
    const item = state.delegations[0]!;
    expect(item).toMatchObject({ status: "draft", schedule: null, timezone: null, version: 1 });
    await expect(service.toggleDelegation(item.id, true)).rejects.toThrow("确认执行时间");
    await service.updateDelegation(item.id, {
      schedule: { kind: "daily", time: "20:00" },
      timezone: "Asia/Shanghai",
    });
    const active = await service.toggleDelegation(item.id, true);
    expect(active.delegations[0]).toMatchObject({ status: "active", version: 3 });
    const paused = await service.toggleDelegation(item.id, false);
    expect(paused.delegations[0]!.status).toBe("paused");
  });
  it("rejects ambiguous time and invalid timezone", async () => {
    const { service } = fixture();
    await service.load();
    await expect(
      service.addDelegation({
        goal: "检查",
        scope: ["notes"],
        schedule: { kind: "daily", time: "25:00" },
      }),
    ).rejects.toThrow();
    await expect(
      service.addDelegation({ goal: "检查", scope: ["notes"], timezone: "Mars/Base" }),
    ).rejects.toThrow();
    expect(service.getSnapshot()!.delegations).toEqual([]);
  });
  it("editing active authority returns it to draft and increments version", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.addDelegation({
      goal: "检查",
      scope: ["commitments"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "UTC",
    });
    const id = state.delegations[0]!.id;
    await service.toggleDelegation(id, true);
    const result = await service.updateDelegation(id, { scope: ["commitments", "email"] });
    expect(result.delegations[0]).toMatchObject({ status: "draft", version: 3 });
  });
});

describe("unified manual and scheduled review", () => {
  it("reports honest unconfigured model and unavailable source coverage", async () => {
    const { service } = fixture();
    await service.load();
    await service.addCommitment(manual);
    const state = await service.review({ reason: "manual", notes: [] });
    const report = state.reports[0]!;
    expect(report.coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "model", status: "not_configured" }),
        expect.objectContaining({ source: "notes", status: "not_authorized" }),
        expect.objectContaining({ source: "email", status: "not_connected" }),
      ]),
    );
    expect(report.commitmentIds).toEqual([state.commitments[0]!.id]);
    expect(report.summary).toContain("未检查");
    expect(state.runs[0]!.status).toBe("succeeded");
    expect(state.outbox[0]).toMatchObject({ status: "pending", target: "app-inbox" });
  });
  it("ignores snoozed, done, dismissed and unconfirmed candidates for reminders", async () => {
    const { service } = fixture();
    await service.load();
    for (const title of ["done", "dismissed", "snoozed", "open"])
      await service.addCommitment({ ...manual, title });
    const items = service.getSnapshot()!.commitments;
    await service.transitionCommitment(items[0]!.id, "done");
    await service.transitionCommitment(items[1]!.id, "dismissed");
    await service.updateCommitment(items[2]!.id, { snoozedUntil: "2026-11-06T10:00:00Z" });
    const result = await service.review(review);
    expect(result.reports[0]!.commitmentIds).toEqual([items[3]!.id]);
    expect(result.commitments.at(-1)!.status).toBe("candidate");
  });
  it("extracts evidence-backed candidates only and requires explicit confirmation", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.review(review);
    const candidate = state.commitments[0]!;
    expect(candidate).toMatchObject({
      status: "candidate",
      responsibility: "unknown",
      source: { kind: "model", reference: "n" },
      evidence: [{ sourceId: "n", quote: "发送合同" }],
    });
    await expect(service.transitionCommitment(candidate.id, "open")).rejects.toThrow("显式确认");
    await expect(service.transitionCommitment(candidate.id, "done")).rejects.toThrow("显式确认");
    expect((await service.confirmCandidate(candidate.id)).commitments[0]!.status).toBe("open");
  });
  it("deduplicates NFKC/spacing/case within and across reviews, including dismissed suggestions", async () => {
    const { service } = fixture();
    await service.load();
    const input: ReviewInput = {
      ...review,
      extract: async () => [
        { title: "SEND Contract", noteId: "n", quote: "发送合同" },
        { title: " ＳＥＮＤ   contract ", noteId: "n", quote: "发送合同" },
      ],
    };
    const first = await service.review(input);
    expect(first.commitments).toHaveLength(1);
    await service.transitionCommitment(first.commitments[0]!.id, "dismissed");
    const second = await service.review(input);
    expect(second.commitments).toHaveLength(1);
    expect(second.reports[1]!.candidateIds).toEqual([]);
  });
  it("rejects cross-workspace and unapproved notes before invoking the model", async () => {
    const { service } = fixture();
    await service.load();
    let calls = 0;
    const extract = async () => {
      calls++;
      return [];
    };
    await expect(
      service.review({ ...review, extract, notes: [{ ...note, workspaceId: "other" }] }),
    ).rejects.toThrow("跨工作区");
    await expect(
      service.review({
        ...review,
        extract,
        notes: [{ ...note, authorized: false }],
      } as unknown as ReviewInput),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(service.getSnapshot()!.runs).toEqual([]);
  });
  it("does not grant the model mutable snapshots or a write capability", async () => {
    const { service } = fixture();
    await service.load();
    await service.review({
      ...review,
      extract: async (context) => {
        expect(Object.isFrozen(context.notes[0])).toBe(true);
        expect(Object.keys(context)).toEqual(["workspaceId", "notes", "commitments"]);
        expect(() => {
          (context.notes[0] as { text: string }).text = "hacked";
        }).toThrow();
        return [];
      },
    });
  });
  it.each([
    async () => {
      throw new Error("provider offline");
    },
    async () => [{ title: "伪造", noteId: "not-authorized", quote: "发送合同" }],
    async () => [{ title: "伪造", noteId: "n", quote: "原文不存在" }],
  ])("persists failed extraction visibly instead of claiming no omissions", async (extract) => {
    const { service } = fixture();
    await service.load();
    const result = await service.review({ ...review, extract });
    expect(result.runs[0]!.status).toBe("failed");
    expect(result.runs[0]!.error).toBeTruthy();
    expect(result.reports[0]!.coverage.find((item) => item.source === "model")!.status).toBe(
      "unavailable",
    );
    expect(result.commitments).toEqual([]);
  });
  it("makes scheduled occurrences idempotent across concurrent calls and service reload", async () => {
    const f = fixture();
    await f.service.load();
    const state = await f.service.addDelegation({
      goal: "查漏",
      scope: ["notes"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "Asia/Shanghai",
    });
    const id = state.delegations[0]!.id;
    await f.service.toggleDelegation(id, true);
    let calls = 0;
    const input: ReviewInput = {
      ...review,
      reason: "scheduled",
      delegationId: id,
      occurrenceKey: "2026-11-05",
      extract: async () => {
        calls++;
        return [];
      },
    };
    await Promise.all([f.service.review(input), f.service.review(input)]);
    const restored = createAgentService(f.options);
    await restored.load();
    await restored.review(input);
    expect(calls).toBe(1);
    expect(restored.getSnapshot()!.reports).toHaveLength(1);
    expect(restored.getSnapshot()!.outbox).toHaveLength(1);
    await restored.toggleDelegation(id, false);
    await expect(restored.review({ ...input, occurrenceKey: "2026-11-06" })).rejects.toThrow(
      "未启用",
    );
  });
  it("does not let scheduled jobs read beyond their confirmed scope", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.addDelegation({
      goal: "查漏",
      scope: ["commitments"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "UTC",
    });
    const id = state.delegations[0]!.id;
    await service.toggleDelegation(id, true);
    await expect(
      service.review({ ...review, reason: "scheduled", delegationId: id, occurrenceKey: "today" }),
    ).rejects.toThrow("未授权笔记");
  });
  it("does not replay an occurrence that failed or an unknown delivery", async () => {
    const { service } = fixture();
    await service.load();
    const state = await service.addDelegation({
      goal: "查漏",
      scope: ["notes"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "UTC",
    });
    const id = state.delegations[0]!.id;
    await service.toggleDelegation(id, true);
    let calls = 0;
    const input: ReviewInput = {
      ...review,
      reason: "scheduled",
      delegationId: id,
      occurrenceKey: "today",
      extract: async () => {
        calls++;
        throw new Error("timeout");
      },
    };
    const result = await service.review(input);
    await service.review(input);
    expect(calls).toBe(1);
    expect(result.outbox).toHaveLength(0);
    const delivered = await service.review({ reason: "manual", notes: [] });
    await service.updateOutbox(delivered.outbox[0]!.id, "unknown", "transport timeout");
    await expect(service.updateOutbox(delivered.outbox[0]!.id, "sent")).rejects.toThrow(
      "不能自动重放",
    );
  });
  it("does not publish a result or candidate when final review persistence fails", async () => {
    const f = fixture();
    await f.service.load();
    await expect(
      f.service.review({
        ...review,
        extract: async () => {
          f.setFail(true);
          return [{ title: "发送合同", noteId: "n", quote: "发送合同" }];
        },
      }),
    ).rejects.toThrow("disk full");
    expect(f.service.getSnapshot()!.reports).toEqual([]);
    expect(f.service.getSnapshot()!.commitments).toEqual([]);
    expect(f.service.getSnapshot()!.runs[0]!.status).toBe("running");
    f.setFail(false);
    const loaded = await f.service.load();
    expect(loaded.runs[0]!.status).toBe("failed");
    expect(loaded.reports).toEqual([]);
  });
  it("records interrupted reviews as failed on restart without replaying extraction", async () => {
    const f = fixture();
    await f.service.load();
    const state = await f.service.review(review);
    const raw = {
      ...state,
      runs: state.runs.map((run) => ({ ...run, status: "running", finishedAt: null })),
    };
    f.files.set(agentStorePaths("w").primary, JSON.stringify(raw));
    const restored = createAgentService(f.options);
    expect((await restored.load()).runs[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("中断"),
    });
  });
});

describe("review authority during network work", () => {
  it("persists pause without waiting for extraction and rejects its late result", async () => {
    const f = fixture();
    await f.service.load();
    const draft = await f.service.addDelegation({
      goal: "检查笔记",
      scope: ["commitments", "notes"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "Asia/Shanghai",
    });
    const id = draft.delegations[0]!.id;
    await f.service.toggleDelegation(id, true);
    let finish!: (value: readonly { title: string; noteId: string; quote: string }[]) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = f.service.review({
      ...review,
      reason: "scheduled",
      delegationId: id,
      occurrenceKey: "v1:today",
      extract: async () => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    await ready;
    const paused = await f.service.toggleDelegation(id, false);
    expect(paused.delegations[0]!.status).toBe("paused");
    expect((await f.service.load()).runs[0]!.status).toBe("running");
    finish([{ title: "发送合同", noteId: "n", quote: "发送合同" }]);
    const final = await pending;
    expect(final.runs[0]!.status).toBe("failed");
    expect(final.outbox).toEqual([]);
    expect(final.reports).toEqual([]);
    expect(final.commitments).toEqual([]);
  });
  it("honors a user's completion while extraction is in flight", async () => {
    const f = fixture();
    await f.service.load();
    const added = await f.service.addCommitment(manual);
    const id = added.commitments[0]!.id;
    let finish!: (value: never[]) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = f.service.review({
      ...review,
      extract: async () => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    await ready;
    await f.service.transitionCommitment(id, "done");
    finish([]);
    const result = await pending;
    expect(result.reports[0]!.commitmentIds).not.toContain(id);
  });
  it("cancels an in-flight manual extraction without publishing a result", async () => {
    const f = fixture();
    await f.service.load();
    const abort = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = f.service.review({
      ...review,
      signal: abort.signal,
      extract: async () => {
        started();
        return new Promise(() => {});
      },
    });
    await ready;
    abort.abort();
    const result = await pending;
    expect(result.runs[0]!.status).toBe("failed");
    expect(result.outbox).toEqual([]);
    expect(result.reports).toEqual([]);
  });
  it("requires explicit recovery and never reactivates authority from a damaged primary", async () => {
    const f = fixture();
    await f.service.load();
    await f.service.addCommitment(manual);
    const draft = await f.service.addDelegation({
      goal: "每日查漏",
      scope: ["commitments"],
      schedule: { kind: "daily", time: "20:00" },
      timezone: "UTC",
    });
    await f.service.toggleDelegation(draft.delegations[0]!.id, true);
    const reviewed = await f.service.review({ reason: "manual", notes: [] });
    await f.service.updateOutbox(reviewed.outbox[0]!.id, "unknown");
    f.files.set(agentStorePaths("w").primary, "broken");
    await expect(f.service.load()).rejects.toMatchObject({ code: "AGENT_RECOVERY_REQUIRED" });
    const result = await f.service.recover();
    expect(result.delegations[0]!.status).toBe("paused");
    expect(result.commitments[0]!.status).toBe("candidate");
    expect(result.outbox[0]!.status).toBe("unknown");
    expect(result.recovery?.warning).toContain("核对");
    expect(f.files.get(result.recovery!.quarantinePath)).toContain("broken");
  });
});
