import { z } from "zod";
import type { AgentStore } from "./agent-store";
import {
  type AgentSnapshot,
  type Commitment,
  type CommitmentStatus,
  type Delegation,
  type Coverage,
  type AgentRun,
  immutable,
  parseAgentSnapshot,
  sourceSchema,
  evidenceSchema,
  scheduleSchema,
  timezoneSchema,
} from "./agent-types";

export type AddCommitmentInput = Readonly<{
  title: string;
  responsibility?: Commitment["responsibility"];
  source: Commitment["source"];
  dueAt?: string | null;
  occurredAt?: string;
  evidence?: Commitment["evidence"];
}>;
export type UpdateCommitmentInput = Readonly<
  Partial<Pick<Commitment, "title" | "responsibility" | "dueAt" | "snoozedUntil" | "correction">>
>;
export type AddDelegationInput = Readonly<{
  goal: string;
  scope: Delegation["scope"];
  schedule?: Delegation["schedule"];
  timezone?: string | null;
}>;
export type UpdateDelegationInput = Readonly<
  Partial<Pick<Delegation, "goal" | "scope" | "schedule" | "timezone">>
>;
export type AuthorizedNote = Readonly<{
  id: string;
  workspaceId: string;
  title: string;
  text: string;
  authorized: true;
}>;
export type ExtractedCandidate = Readonly<{
  title: string;
  responsibility?: Commitment["responsibility"];
  dueAt?: string | null;
  noteId: string;
  quote: string;
}>;
export type ReviewInput = Readonly<{
  reason: "manual" | "scheduled";
  delegationId?: string;
  occurrenceKey?: string;
  notes: readonly AuthorizedNote[];
  externalSources?: readonly Readonly<{
    source: "email" | "calendar";
    status: "not_connected" | "unavailable";
    detail: string;
  }>[];
  signal?: AbortSignal;
  extract?: (
    context: Readonly<{
      workspaceId: string;
      notes: readonly AuthorizedNote[];
      commitments: readonly Commitment[];
    }>,
    signal: AbortSignal,
  ) => Promise<readonly ExtractedCandidate[]>;
}>;

const iso = z.iso.datetime({ offset: true });
const title = z.string().trim().min(1).max(10000);
const responsibility = z.enum(["self", "other", "unknown"]);
const addCommitmentSchema = z
  .object({
    title,
    responsibility: responsibility.optional(),
    source: sourceSchema,
    dueAt: iso.nullable().optional(),
    occurredAt: iso.optional(),
    evidence: z.array(evidenceSchema).max(100).optional(),
  })
  .strict();
const updateCommitmentSchema = z
  .object({
    title: title.optional(),
    responsibility: responsibility.optional(),
    dueAt: iso.nullable().optional(),
    snoozedUntil: iso.nullable().optional(),
    correction: z.string().max(10000).nullable().optional(),
  })
  .strict();
const delegationInputSchema = z
  .object({
    goal: title,
    scope: z
      .array(z.enum(["commitments", "notes", "email", "calendar"]))
      .min(1)
      .max(4),
    schedule: scheduleSchema.nullable().optional(),
    timezone: timezoneSchema.nullable().optional(),
  })
  .strict();
const noteSchema = z
  .object({
    id: z.string().min(1).max(500),
    workspaceId: z.string().min(1).max(500),
    title: z.string().max(10000),
    text: z.string().max(500000),
    authorized: z.literal(true),
  })
  .strict();
const extractedSchema = z
  .array(
    z
      .object({
        title,
        responsibility: responsibility.optional(),
        dueAt: iso.nullable().optional(),
        noteId: z.string().min(1).max(500),
        quote: z.string().min(1).max(20000),
      })
      .strict(),
  )
  .max(100);

const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

export function createAgentService({
  workspaceId,
  store,
  clock,
  createId,
}: {
  workspaceId: string;
  store: AgentStore;
  clock: () => string;
  createId: () => string;
}) {
  let state: AgentSnapshot | null = null;
  const activeReviews = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  let failureGeneration = 0;
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const generation = failureGeneration;
    const result = queue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== failureGeneration)
          throw new Error("前序 Agent 操作失败，请重新加载或显式重试");
        try {
          return await work();
        } catch (error) {
          failureGeneration += 1;
          throw error;
        }
      });
    queue = result;
    return result;
  }
  function current(): AgentSnapshot {
    if (!state) throw new Error("请先加载 Agent 数据");
    return state;
  }
  const now = () => iso.parse(clock());
  async function save(next: AgentSnapshot): Promise<AgentSnapshot> {
    const previous = current();
    const checked = parseAgentSnapshot({ ...next, revision: previous.revision + 1 }, workspaceId);
    const saved = await store.save(checked, previous.revision);
    state = parseAgentSnapshot(saved, workspaceId);
    return state;
  }
  function findCommitment(id: string) {
    const value = current().commitments.find((item) => item.id === id);
    if (!value) throw new Error("找不到事项");
    return value;
  }
  function findDelegation(id: string) {
    const value = current().delegations.find((item) => item.id === id);
    if (!value) throw new Error("找不到委托");
    return value;
  }
  function replaceCommitment(value: Commitment) {
    return save({
      ...current(),
      commitments: current().commitments.map((item) => (item.id === value.id ? value : item)),
    });
  }
  function makeCommitment(input: AddCommitmentInput, status: CommitmentStatus): Commitment {
    const checked = addCommitmentSchema.parse(input);
    const at = now();
    return immutable({
      id: createId(),
      workspaceId,
      title: checked.title,
      responsibility: checked.responsibility ?? "self",
      source: checked.source,
      occurredAt: checked.occurredAt ?? at,
      dueAt: checked.dueAt ?? null,
      status,
      snoozedUntil: null,
      evidence: checked.evidence ?? [],
      correction: null,
      createdAt: at,
      updatedAt: at,
    });
  }
  async function transition(id: string, status: CommitmentStatus, confirm: boolean) {
    const item = findCommitment(id);
    if (item.status === "candidate" && status !== "dismissed" && !confirm) {
      throw new Error("模型候选必须显式确认");
    }
    if (status === "candidate") throw new Error("不能把正式事项改为模型候选");
    if (confirm && item.status !== "candidate") throw new Error("仅候选需要确认");
    return replaceCommitment({ ...item, status, snoozedUntil: null, updatedAt: now() });
  }

  return Object.freeze({
    getSnapshot: (): AgentSnapshot | null => state,
    load: () =>
      serial(async () => {
        state = parseAgentSnapshot(await store.load(), workspaceId);
        if (state.runs.some((run) => run.status === "running" && !activeReviews.has(run.id))) {
          const at = now();
          return save({
            ...state,
            runs: state.runs.map((run) =>
              run.status === "running" && !activeReviews.has(run.id)
                ? {
                    ...run,
                    status: "failed",
                    finishedAt: at,
                    error: "上次查漏中断；未自动重放模型或外部动作",
                  }
                : run,
            ),
          });
        }
        return state;
      }),
    recover: () =>
      serial(async () => {
        state = parseAgentSnapshot(await store.recover(now()), workspaceId);
        return state;
      }),
    addCommitment: (input: AddCommitmentInput) =>
      serial(async () => {
        const item = makeCommitment(input, "open");
        if (item.source.kind === "model") throw new Error("模型输出只能由查漏生成候选");
        return save({ ...current(), commitments: [...current().commitments, item] });
      }),
    updateCommitment: (id: string, input: UpdateCommitmentInput) =>
      serial(async () => {
        const checked = updateCommitmentSchema.parse(input);
        const item = findCommitment(id);
        return replaceCommitment({
          ...item,
          title: checked.title ?? item.title,
          responsibility: checked.responsibility ?? item.responsibility,
          dueAt: checked.dueAt === undefined ? item.dueAt : checked.dueAt,
          snoozedUntil:
            checked.snoozedUntil === undefined ? item.snoozedUntil : checked.snoozedUntil,
          correction: checked.correction === undefined ? item.correction : checked.correction,
          updatedAt: now(),
        });
      }),
    transitionCommitment: (id: string, status: CommitmentStatus) =>
      serial(() => transition(id, status, false)),
    confirmCandidate: (id: string) => serial(() => transition(id, "open", true)),
    addDelegation: (input: AddDelegationInput) =>
      serial(async () => {
        const checked = delegationInputSchema.parse(input);
        const at = now();
        const item: Delegation = {
          id: createId(),
          workspaceId,
          goal: checked.goal,
          scope: [...new Set(checked.scope)],
          schedule: checked.schedule ?? null,
          timezone: checked.timezone ?? null,
          status: "draft",
          version: 1,
          createdAt: at,
          updatedAt: at,
        };
        return save({ ...current(), delegations: [...current().delegations, item] });
      }),
    updateDelegation: (id: string, input: UpdateDelegationInput) =>
      serial(async () => {
        const checked = delegationInputSchema.partial().parse(input);
        const item = findDelegation(id);
        // Any changed authority/schedule requires explicit reactivation, never silently broadens an active job.
        const updated: Delegation = {
          ...item,
          goal: checked.goal ?? item.goal,
          scope: checked.scope ?? item.scope,
          schedule: checked.schedule === undefined ? item.schedule : checked.schedule,
          timezone: checked.timezone === undefined ? item.timezone : checked.timezone,
          status: "draft",
          version: item.version + 1,
          updatedAt: now(),
        };
        return save({
          ...current(),
          delegations: current().delegations.map((d) => (d.id === id ? updated : d)),
        });
      }),
    toggleDelegation: (id: string, enabled: boolean) =>
      serial(async () => {
        const item = findDelegation(id);
        if (enabled && (!item.schedule || !item.timezone))
          throw new Error("启用前请确认执行时间和时区");
        const updated: Delegation = {
          ...item,
          status: enabled ? "active" : "paused",
          version: item.version + 1,
          updatedAt: now(),
        };
        return save({
          ...current(),
          delegations: current().delegations.map((d) => (d.id === id ? updated : d)),
        });
      }),
    review: async (input: ReviewInput): Promise<AgentSnapshot> => {
      const prepared = await serial(async () => {
        current();
        const reason = z.enum(["manual", "scheduled"]).parse(input.reason);
        const at = now();
        const notes = z.array(noteSchema).max(1000).parse(input.notes);
        if (notes.some((note) => note.workspaceId !== workspaceId))
          throw new Error("拒绝跨工作区笔记");
        if (new Set(notes.map((note) => note.id)).size !== notes.length)
          throw new Error("授权笔记 ID 重复");
        let delegation: Delegation | null = null;
        if (reason === "scheduled") {
          if (!input.delegationId || !input.occurrenceKey?.trim())
            throw new Error("定时查漏需要委托与 occurrenceKey");
          delegation = findDelegation(input.delegationId);
          if (delegation.status !== "active") throw new Error("委托未启用，不能执行");
          const existing = current().runs.find(
            (run) =>
              run.delegationId === delegation?.id && run.occurrenceKey === input.occurrenceKey,
          );
          if (existing) return { existing: current() } as const; // Includes failed/unknown runs: no blind replay.
          if (notes.length && !delegation.scope.includes("notes"))
            throw new Error("委托未授权笔记来源");
        } else if (input.delegationId || input.occurrenceKey) {
          throw new Error("手动查漏不能声明定时 occurrence");
        }
        const active = current().commitments.filter(
          (item) =>
            (item.status === "open" || item.status === "waiting") &&
            (!item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.parse(at)),
        );
        const checkedCommitments =
          !delegation || delegation.scope.includes("commitments") ? active : [];
        const coverage: Coverage[] = [
          {
            source: "commitments",
            status:
              !delegation || delegation.scope.includes("commitments")
                ? "checked"
                : "not_authorized",
            checkedCount: checkedCommitments.length,
            detail: "仅检查当前工作区未处理且未延后的事项",
          },
          {
            source: "notes",
            status: notes.length ? "checked" : "not_authorized",
            checkedCount: notes.length,
            detail: notes.length
              ? "仅使用本次明确授权的笔记快照；非全库扫描"
              : "未提供授权笔记快照",
          },
          {
            source: "model",
            status: input.extract ? "checked" : "not_configured",
            checkedCount: 0,
            detail: input.extract
              ? "仅提取候选，不执行笔记或外部写入"
              : "未配置模型提取；仅列出本地事项，不判断笔记遗漏",
          },
        ];
        const external = z
          .array(
            z
              .object({
                source: z.enum(["email", "calendar"]),
                status: z.enum(["not_connected", "unavailable"]),
                detail: z.string().max(2000),
              })
              .strict(),
          )
          .max(2)
          .parse(input.externalSources ?? []);
        for (const source of ["email", "calendar"] as const) {
          const entry = external.find((item) => item.source === source);
          coverage.push({
            source,
            status: entry?.status ?? "not_connected",
            checkedCount: 0,
            detail: entry?.detail ?? "来源未连接，未检查",
          });
        }
        const run: AgentRun = {
          id: createId(),
          workspaceId,
          reason,
          delegationId: delegation?.id ?? null,
          delegationVersion: delegation?.version ?? null,
          occurrenceKey: input.occurrenceKey ?? null,
          status: "running",
          startedAt: at,
          finishedAt: null,
          reportId: null,
          error: null,
        };
        await save({ ...current(), runs: [...current().runs, run] });
        activeReviews.add(run.id);
        return { run, notes, coverage, checkedCommitments, delegation } as const;
      });
      if ("existing" in prepared) return prepared.existing;
      const { run, notes, coverage, checkedCommitments, delegation } = prepared;
      try {
        let candidates: readonly ExtractedCandidate[] = [];
        let extractionError: string | null = null;
        if (input.extract) {
          const abort = new AbortController();
          const onAbort = () => abort.abort();
          input.signal?.addEventListener("abort", onAbort, { once: true });
          if (input.signal?.aborted) abort.abort();
          let rejectOnAbort: (() => void) | undefined;
          const timeout = setTimeout(onAbort, 60000);
          try {
            candidates = extractedSchema
              .parse(
                await Promise.race([
                  input.extract(
                    immutable({ workspaceId, notes, commitments: checkedCommitments }),
                    abort.signal,
                  ),
                  new Promise<never>((_, reject) => {
                    rejectOnAbort = () => reject(new Error("查漏已取消或超时"));
                    abort.signal.addEventListener("abort", rejectOnAbort, { once: true });
                    if (abort.signal.aborted) rejectOnAbort();
                  }),
                ]),
              )
              .map((candidate) => ({
                ...candidate,
                responsibility: candidate.responsibility ?? "unknown",
                dueAt: candidate.dueAt ?? null,
              }));
            for (const candidate of candidates) {
              const note = notes.find((n) => n.id === candidate.noteId);
              if (!note || !note.text.includes(candidate.quote))
                throw new Error("模型候选缺少授权笔记中的原文证据");
            }
            coverage[2] = {
              source: "model",
              status: "checked",
              checkedCount: notes.length,
              detail: "授权快照提取已完成；候选须由用户确认",
            };
          } catch (error) {
            candidates = [];
            extractionError = error instanceof Error ? error.message : "模型提取失败";
            coverage[2] = {
              source: "model",
              status: "unavailable",
              checkedCount: 0,
              detail: "模型提取失败；不将失败视为无遗漏",
            };
          } finally {
            clearTimeout(timeout);
            input.signal?.removeEventListener("abort", onAbort);
            if (rejectOnAbort) abort.signal.removeEventListener("abort", rejectOnAbort);
          }
        }
        return await serial(async () => {
          const latest = current().runs.find((entry) => entry.id === run.id);
          const authority = delegation
            ? current().delegations.find((entry) => entry.id === delegation.id)
            : null;
          if (
            latest?.status !== "running" ||
            input.signal?.aborted ||
            (delegation &&
              (!authority ||
                authority.status !== "active" ||
                authority.version !== delegation.version))
          ) {
            return save({
              ...current(),
              runs: current().runs.map((entry) =>
                entry.id === run.id
                  ? {
                      ...entry,
                      status: "failed",
                      finishedAt: now(),
                      error: "查漏已取消或授权已变更，未发布结果",
                    }
                  : entry,
              ),
            });
          }
          const newItems: Commitment[] = [];
          const known = new Set(current().commitments.map((item) => normalize(item.title)));
          for (const candidate of candidates) {
            const key = normalize(candidate.title);
            if (known.has(key)) continue;
            known.add(key);
            newItems.push(
              makeCommitment(
                {
                  title: candidate.title,
                  responsibility: candidate.responsibility ?? "unknown",
                  dueAt: candidate.dueAt ?? null,
                  source: { kind: "model", reference: candidate.noteId },
                  evidence: [{ sourceId: candidate.noteId, quote: candidate.quote }],
                },
                "candidate",
              ),
            );
          }
          const latestChecked = checkedCommitments.filter((original) =>
            current().commitments.some(
              (item) =>
                item.id === original.id &&
                (item.status === "open" || item.status === "waiting") &&
                (!item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.parse(now())),
            ),
          );
          const finishedAt = now();
          const reportId = createId();
          const report = {
            id: reportId,
            workspaceId,
            runId: run.id,
            createdAt: finishedAt,
            coverage,
            evidence: newItems.flatMap((item) => item.evidence),
            commitmentIds: latestChecked.map((item) => item.id),
            candidateIds: newItems.map((item) => item.id),
            summary: `${latestChecked.length} 项待处理事项，${newItems.length} 项待确认候选。仅覆盖所列授权来源；未连接或不可用的来源未检查。`,
          };
          return save({
            ...current(),
            commitments: [...current().commitments, ...newItems],
            reports: [...current().reports, report],
            runs: current().runs.map((item) =>
              item.id === run.id
                ? {
                    ...item,
                    status: extractionError ? "failed" : "succeeded",
                    finishedAt,
                    reportId,
                    error: extractionError,
                  }
                : item,
            ),
            outbox: [
              ...current().outbox,
              ...(extractionError
                ? []
                : [
                    {
                      id: createId(),
                      workspaceId,
                      runId: run.id,
                      reportId,
                      target: "app-inbox",
                      status: "pending",
                      createdAt: finishedAt,
                      updatedAt: finishedAt,
                      error: null,
                    } as const,
                  ]),
            ],
          });
        });
      } finally {
        activeReviews.delete(run.id);
      }
    },
    updateOutbox: (
      id: string,
      status: "sent" | "failed" | "unknown",
      error: string | null = null,
    ) =>
      serial(async () => {
        const item = current().outbox.find((entry) => entry.id === id);
        if (!item) throw new Error("找不到投递记录");
        if (item.status !== "pending") throw new Error("非待投递记录不能自动重放或改写");
        return save({
          ...current(),
          outbox: current().outbox.map((entry) =>
            entry.id === id ? { ...entry, status, error, updatedAt: now() } : entry,
          ),
        });
      }),
  });
}
export type AgentService = ReturnType<typeof createAgentService>;
