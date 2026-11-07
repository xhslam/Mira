import { z } from "zod";
import type { AgentSnapshot } from "../agent-types";

const timestamp = z.number().int().nonnegative();
const workerResultSchema = z
  .object({
    id: z.string().max(80),
    cursor: z.string().regex(/^\d+$/u),
    workspaceId: z.string(),
    delegationId: z.string(),
    delegationVersion: z.number().int().positive(),
    occurrenceKey: z.string(),
    createdAt: timestamp,
    snapshotAt: timestamp,
    syncVersion: z.number().int().positive(),
    coverage: z
      .object({
        sources: z.tuple([z.literal("uploaded-items")]),
        unavailable: z.tuple([z.literal("email"), z.literal("messages")]),
        snapshotAt: timestamp,
        checkedAt: timestamp,
        mode: z.literal("snapshot-only"),
      })
      .strict(),
    findings: z
      .array(
        z
          .object({
            itemId: z.string(),
            title: z.string().max(2000),
            source: z.string().max(2000),
            reason: z.enum(["overdue", "due_today", "awaiting_confirmation"]),
          })
          .strict(),
      )
      .max(500),
    delivery: z.enum(["pending", "acknowledged"]),
    acknowledgedAt: timestamp.nullable(),
  })
  .strict();
export type RemoteReview = z.infer<typeof workerResultSchema>;
const workerRunSchema = z
  .object({
    id: z.string(),
    delegationId: z.string(),
    delegationVersion: z.number().int().positive(),
    state: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
    attempts: z.number().int().nonnegative(),
    createdAt: timestamp,
    errorCode: z.string().nullable(),
  })
  .strict();
export const workerCacheSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string(),
    endpoint: z.string().nullable(),
    syncVersion: z.number().int().nonnegative(),
    cursor: z.string().regex(/^\d+$/u),
    lastSyncAt: timestamp.nullable(),
    results: z.array(workerResultSchema),
    runs: z.array(workerRunSchema).max(50).default([]),
  })
  .strict();
export type WorkerCache = z.infer<typeof workerCacheSchema>;
export type WorkerClientStorage = Readonly<{
  load: () => Promise<unknown | null>;
  save: (value: WorkerCache) => Promise<void>;
  getToken: () => Promise<string | null>;
  setToken: (value: string) => Promise<void>;
  clearToken: () => Promise<void>;
}>;
export type WorkerTransport = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

export function normalizeWorkerEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error("请输入不含路径、凭据或参数的服务地址。");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("服务地址必须使用 HTTPS；仅本机回环地址可使用 HTTP。");
  return url.origin;
}

export function createWorkerManifest(snapshot: AgentSnapshot, syncVersion: number, now: number) {
  if (snapshot.commitments.length > 500 || snapshot.delegations.length > 100)
    throw new Error("超过服务同步上限（500 件事项、100 个委托）。");
  if (
    snapshot.commitments.some(
      (item) => item.title.length > 2000 || item.source.reference.length > 2000,
    ) ||
    snapshot.delegations.some((item) => item.goal.length > 200)
  )
    throw new Error("事项或委托名称过长，不能同步；请缩短后重试。");
  const supported = (d: AgentSnapshot["delegations"][number]) =>
    d.scope.length === 1 && d.scope[0] === "commitments";
  if (snapshot.delegations.some((d) => d.status === "active" && !supported(d)))
    throw new Error("独立服务仅支持已确认事项范围；其他来源委托不能同步执行。");
  const hasAuthority = snapshot.delegations.some((d) => d.status === "active" && supported(d));
  return {
    protocolVersion: 1,
    workspaceId: snapshot.workspaceId,
    syncVersion,
    snapshotAt: now,
    delegations: snapshot.delegations
      .filter((d) => d.schedule && d.timezone && supported(d))
      .map((d) => {
        const [hour, minute] = (d.schedule?.time ?? "00:00").split(":").map(Number);
        return {
          id: d.id,
          version: d.version,
          name: d.goal,
          prompt: d.goal,
          enabled: d.status === "active",
          scope: ["commitments"],
          schedule: { kind: "daily", hour, minute },
          timezone: d.timezone,
        };
      }),
    items: (hasAuthority
      ? snapshot.commitments.filter((item) => item.status !== "candidate")
      : []
    ).map((item) => ({
      id: item.id,
      title: item.title,
      status:
        item.status === "candidate"
          ? "awaiting_confirmation"
          : item.status === "done"
            ? "completed"
            : item.status === "dismissed"
              ? "dismissed"
              : "open",
      dueAt: item.dueAt ? Date.parse(item.dueAt) : null,
      snoozedUntil: item.snoozedUntil ? Date.parse(item.snoozedUntil) : null,
      source: item.source.reference,
    })),
  };
}

export function createWorkerClient({
  workspaceId,
  storage,
  transport,
  clock = Date.now,
}: Readonly<{
  workspaceId: string;
  storage: WorkerClientStorage;
  transport: WorkerTransport;
  clock?: () => number;
}>) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.catch(() => undefined).then(fn);
    queue = result;
    return result;
  };
  async function load(): Promise<WorkerCache> {
    const value = await storage.load();
    const state =
      value === null
        ? {
            version: 1 as const,
            workspaceId,
            endpoint: null,
            syncVersion: 0,
            cursor: "0",
            lastSyncAt: null,
            results: [],
            runs: [],
          }
        : workerCacheSchema.parse(value);
    if (
      state.workspaceId !== workspaceId ||
      state.results.some((r) => r.workspaceId !== workspaceId)
    )
      throw new Error("服务缓存工作区不匹配。");
    return state;
  }
  async function request(
    endpoint: string,
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await transport(`${normalizeWorkerEndpoint(endpoint)}${path}`, {
        method,
        redirect: "error",
        signal: abort.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok)
        throw new Error(`服务请求失败（${response.status}），请检查连接和工作区授权。`);
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error("服务响应超过限制。");
      return JSON.parse(text) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function check(endpoint: string, token: string) {
    const status = z
      .object({
        protocolVersion: z.literal(1),
        service: z.literal("mira-agent-worker"),
        workspaces: z.array(z.string()),
        serverTime: timestamp,
        capabilities: z.object({
          execution: z.literal("deterministic-item-review"),
          email: z.literal(false),
          messages: z.literal(false),
          systemPush: z.literal(false),
        }),
        storage: z.unknown(),
      })
      .parse(await request(endpoint, token, "/v1/status"));
    if (!status.workspaces.includes(workspaceId)) throw new Error("此服务尚未授权当前工作区。");
    return status;
  }
  return Object.freeze({
    load: () => serial(load),
    connect: (address: string, token: string) =>
      serial(async () => {
        const endpoint = normalizeWorkerEndpoint(address);
        if (token.length < 32 || token.length > 512 || /\s/u.test(token))
          throw new Error("连接密钥必须为 32–512 个非空白字符。");
        await check(endpoint, token);
        const previous = await load();
        const next: WorkerCache =
          previous.endpoint === endpoint
            ? previous
            : {
                ...previous,
                endpoint,
                syncVersion: 0,
                cursor: "0",
                lastSyncAt: null,
                results: previous.results,
              };
        await storage.setToken(token);
        await storage.save(next);
        return next;
      }),
    sync: (snapshot: AgentSnapshot) =>
      serial(async () => {
        if (snapshot.workspaceId !== workspaceId) throw new Error("拒绝跨工作区同步。");
        let state = await load();
        const token = await storage.getToken();
        if (!state.endpoint || !token) throw new Error("请先连接独立服务。");
        const endpoint = state.endpoint;
        await check(endpoint, token);
        // Persist the next transport sequence before sending: an unknown response can never reuse a version with different data.
        state = { ...state, syncVersion: Math.max(state.syncVersion + 1, clock()) };
        await storage.save(state);
        const prefix = `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
        const accepted = z
          .object({
            protocolVersion: z.literal(1),
            acceptedSyncVersion: z.number().int().positive(),
            receivedAt: timestamp,
          })
          .parse(
            await request(
              endpoint,
              token,
              `${prefix}/manifest`,
              "PUT",
              createWorkerManifest(snapshot, state.syncVersion, clock()),
            ),
          );
        if (accepted.acceptedSyncVersion !== state.syncVersion)
          throw new Error("服务同步版本不匹配。");
        for (let page = 0; page < 20; page += 1) {
          const response = z
            .object({
              protocolVersion: z.literal(1),
              results: z.array(workerResultSchema).max(50),
              nextCursor: z.string().regex(/^\d+$/u),
              hasMore: z.boolean(),
            })
            .strict()
            .parse(
              await request(endpoint, token, `${prefix}/results?after=${state.cursor}&limit=50`),
            );
          if (response.results.some((r) => r.workspaceId !== workspaceId))
            throw new Error("拒绝接收其他工作区的结果。");
          if (
            Number(response.nextCursor) < Number(state.cursor) ||
            (response.hasMore && Number(response.nextCursor) <= Number(state.cursor))
          )
            throw new Error("服务分页游标无效。");
          const results = new Map(state.results.map((result) => [result.id, result]));
          response.results.forEach((result) => results.set(result.id, result));
          state = { ...state, results: [...results.values()] };
          await storage.save(state); // durable-before-ack; failures leave remote delivery pending
          if (response.results.length) {
            z.object({
              protocolVersion: z.literal(1),
              acknowledged: z.number().int().nonnegative(),
            })
              .strict()
              .parse(
                await request(endpoint, token, `${prefix}/ack`, "POST", {
                  protocolVersion: 1,
                  resultIds: response.results.map((r) => r.id),
                }),
              );
            const received = new Set(response.results.map((r) => r.id));
            state = {
              ...state,
              results: state.results.map((r) =>
                received.has(r.id)
                  ? { ...r, delivery: "acknowledged" as const, acknowledgedAt: clock() }
                  : r,
              ),
            };
          }
          state = { ...state, cursor: response.nextCursor, lastSyncAt: clock() };
          await storage.save(state);
          if (!response.hasMore) break;
        }
        const runPage = z
          .object({ protocolVersion: z.literal(1), runs: z.array(workerRunSchema).max(50) })
          .strict()
          .parse(await request(endpoint, token, `${prefix}/runs?limit=50`));
        state = { ...state, runs: runPage.runs };
        await storage.save(state);
        return state;
      }),
    disconnectAfterPaused: () =>
      serial(async () => {
        const previous = await load();
        await storage.clearToken();
        const next = { ...previous, endpoint: null };
        await storage.save(next);
        return next;
      }),
  });
}
export type AgentWorkerClient = ReturnType<typeof createWorkerClient>;
