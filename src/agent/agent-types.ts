import { z } from "zod";

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export function immutable<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((child) => immutable(child));
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const id = z.string().trim().min(1).max(500);
const text = z.string().trim().min(1).max(10000);
const timestamp = z.iso.datetime({ offset: true });
const scopeSchema = z.enum(["commitments", "notes", "email", "calendar"]);
export const commitmentStatusSchema = z.enum(["candidate", "open", "waiting", "done", "dismissed"]);
export const sourceSchema = z
  .object({
    kind: z.enum(["manual", "note", "model"]),
    reference: id,
  })
  .strict();
export const evidenceSchema = z
  .object({
    sourceId: id,
    quote: z.string().max(20000),
  })
  .strict();
export const commitmentSchema = z
  .object({
    id,
    workspaceId: id,
    title: text,
    responsibility: z.enum(["self", "other", "unknown"]),
    source: sourceSchema,
    occurredAt: timestamp,
    dueAt: timestamp.nullable(),
    status: commitmentStatusSchema,
    snoozedUntil: timestamp.nullable(),
    evidence: z.array(evidenceSchema).max(100),
    correction: z.string().max(10000).nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export const scheduleSchema = z
  .object({
    kind: z.literal("daily"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
export const timezoneSchema = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
      return true;
    } catch {
      return false;
    }
  }, "需要有效的 IANA 时区");
export const delegationSchema = z
  .object({
    id,
    workspaceId: id,
    goal: text,
    scope: z.array(scopeSchema).min(1).max(4),
    schedule: scheduleSchema.nullable(),
    timezone: timezoneSchema.nullable(),
    status: z.enum(["draft", "active", "paused"]),
    version: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .refine(
    (d) => d.status !== "active" || (d.schedule !== null && d.timezone !== null),
    "启用前必须确认时间和时区",
  );
export const coverageSchema = z
  .object({
    source: id,
    status: z.enum(["checked", "not_configured", "not_connected", "unavailable", "not_authorized"]),
    checkedCount: z.number().int().nonnegative(),
    detail: z.string().max(2000),
  })
  .strict();
export const reportSchema = z
  .object({
    id,
    workspaceId: id,
    runId: id,
    createdAt: timestamp,
    coverage: z.array(coverageSchema),
    evidence: z.array(evidenceSchema),
    commitmentIds: z.array(id),
    candidateIds: z.array(id),
    summary: z.string().max(10000),
  })
  .strict();
export const runSchema = z
  .object({
    id,
    workspaceId: id,
    reason: z.enum(["manual", "scheduled"]),
    delegationId: id.nullable(),
    occurrenceKey: id.nullable(),
    delegationVersion: z.number().int().positive().nullable(),
    status: z.enum(["running", "succeeded", "failed"]),
    startedAt: timestamp,
    finishedAt: timestamp.nullable(),
    reportId: id.nullable(),
    error: z.string().max(10000).nullable(),
  })
  .strict();
export const outboxSchema = z
  .object({
    id,
    workspaceId: id,
    runId: id,
    reportId: id,
    target: z.literal("app-inbox"),
    status: z.enum(["pending", "sent", "failed", "unknown"]),
    createdAt: timestamp,
    updatedAt: timestamp,
    error: z.string().max(10000).nullable(),
  })
  .strict();
export const agentSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    workspaceId: id,
    revision: z.number().int().nonnegative(),
    recovery: z
      .object({
        recoveredAt: timestamp,
        source: z.enum(["backup", "staging"]),
        prepared: z.boolean(),
        quarantinePath: z.string().min(1),
        warning: z.string().min(1).max(2000),
      })
      .strict()
      .nullable()
      .default(null),
    commitments: z.array(commitmentSchema),
    delegations: z.array(delegationSchema),
    reports: z.array(reportSchema),
    runs: z.array(runSchema),
    outbox: z.array(outboxSchema),
  })
  .strict();
export type Commitment = DeepReadonly<z.infer<typeof commitmentSchema>>;
export type CommitmentStatus = Commitment["status"];
export type Delegation = DeepReadonly<z.infer<typeof delegationSchema>>;
export type AgentScope = z.infer<typeof scopeSchema>;
export type Coverage = DeepReadonly<z.infer<typeof coverageSchema>>;
export type ReviewReport = DeepReadonly<z.infer<typeof reportSchema>>;
export type AgentRun = DeepReadonly<z.infer<typeof runSchema>>;
export type AgentOutbox = DeepReadonly<z.infer<typeof outboxSchema>>;
export type AgentSnapshot = DeepReadonly<z.infer<typeof agentSnapshotSchema>>;

export function parseAgentSnapshot(input: unknown, workspaceId: string): AgentSnapshot {
  const snapshot = agentSnapshotSchema.parse(input);
  if (snapshot.workspaceId !== workspaceId) throw new Error("Agent 工作区不匹配");
  for (const collection of [
    snapshot.commitments,
    snapshot.delegations,
    snapshot.reports,
    snapshot.runs,
    snapshot.outbox,
  ]) {
    const seen = new Set<string>();
    for (const record of collection) {
      if (record.workspaceId !== workspaceId) throw new Error("Agent 记录跨工作区");
      if (seen.has(record.id)) throw new Error("Agent 记录 ID 重复");
      seen.add(record.id);
    }
  }
  const commitments = new Set(snapshot.commitments.map((item) => item.id));
  const delegations = new Set(snapshot.delegations.map((item) => item.id));
  const runs = new Map(snapshot.runs.map((item) => [item.id, item]));
  const reports = new Map(snapshot.reports.map((item) => [item.id, item]));
  for (const run of snapshot.runs) {
    if (
      run.reason === "scheduled" &&
      (!run.delegationId ||
        !delegations.has(run.delegationId) ||
        !run.occurrenceKey ||
        !run.delegationVersion)
    ) {
      throw new Error("定时运行缺少有效委托与 occurrence");
    }
    if (
      run.reason === "manual" &&
      (run.delegationId !== null || run.occurrenceKey !== null || run.delegationVersion !== null)
    ) {
      throw new Error("手动运行不能声明定时 occurrence");
    }
    if (run.reportId !== null && reports.get(run.reportId)?.runId !== run.id)
      throw new Error("运行结果引用无效");
    if (run.status === "succeeded" && (!run.reportId || !run.finishedAt))
      throw new Error("成功运行缺少已保存结果");
  }
  const occurrences = new Set<string>();
  for (const run of snapshot.runs.filter((item) => item.reason === "scheduled")) {
    const key = JSON.stringify([run.delegationId, run.occurrenceKey]);
    if (occurrences.has(key)) throw new Error("重复的委托 occurrence");
    occurrences.add(key);
  }
  for (const report of snapshot.reports) {
    if (
      !runs.has(report.runId) ||
      [...report.commitmentIds, ...report.candidateIds].some((id) => !commitments.has(id))
    )
      throw new Error("报告来源或运行引用无效");
  }
  for (const entry of snapshot.outbox) {
    if (reports.get(entry.reportId)?.runId !== entry.runId || !runs.has(entry.runId))
      throw new Error("投递结果引用无效");
  }
  return immutable(snapshot);
}

export function emptyAgentSnapshot(workspaceId: string): AgentSnapshot {
  return parseAgentSnapshot(
    {
      schemaVersion: 2,
      workspaceId,
      revision: 0,
      commitments: [],
      delegations: [],
      reports: [],
      runs: [],
      outbox: [],
    },
    workspaceId,
  );
}

export class AgentDataCompatibilityError extends Error {
  constructor() {
    super("不支持此 Agent 数据版本；请升级应用，未改写原文件");
    this.name = "AgentDataCompatibilityError";
  }
}

/** v1 used the same records but had no durable delivery collection. Never guesses unknown versions. */
export function migrateAgentSnapshot(input: unknown, workspaceId: string): AgentSnapshot {
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion !== 1 &&
    input.schemaVersion !== 2
  ) {
    throw new AgentDataCompatibilityError();
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === 1
  ) {
    return parseAgentSnapshot(
      { ...input, schemaVersion: 2, outbox: "outbox" in input ? input.outbox : [] },
      workspaceId,
    );
  }
  return parseAgentSnapshot(input, workspaceId);
}
