import {
  type AgentSnapshot,
  AgentDataCompatibilityError,
  emptyAgentSnapshot,
  migrateAgentSnapshot,
  parseAgentSnapshot,
} from "./agent-types";

export interface TextFileBackend {
  /** Return null only for a missing file. Permission/I/O errors must reject. */
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
}
export interface AgentStore {
  load(): Promise<AgentSnapshot>;
  save(snapshot: AgentSnapshot, expectedRevision: number): Promise<AgentSnapshot>;
  /** Explicit user recovery only. Prepared staging data may never have been committed. */
  recover(recoveredAt?: string): Promise<AgentSnapshot>;
}
export class AgentRecoveryRequiredError extends Error {
  readonly code = "AGENT_RECOVERY_REQUIRED";
  readonly recoverable = true;
  constructor() {
    super("Agent 主文件损坏或缺失；请显式恢复备份。未自动回退授权、事项或投递状态。");
    this.name = "AgentRecoveryRequiredError";
  }
}

const queues = new WeakMap<TextFileBackend, Map<string, Promise<unknown>>>();
export function agentStorePaths(workspaceId: string) {
  if (!workspaceId.trim()) throw new Error("需要工作区 ID");
  const base = `agent-${encodeURIComponent(workspaceId)}.json`;
  return Object.freeze({ primary: base, backup: `${base}.backup`, staging: `${base}.staging` });
}

export function createAgentStore({
  backend,
  workspaceId,
}: {
  backend: TextFileBackend;
  workspaceId: string;
}): AgentStore {
  const paths = agentStorePaths(workspaceId);
  let map = queues.get(backend);
  if (!map) {
    map = new Map();
    queues.set(backend, map);
  }
  const sharedQueue = map;
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const previous = sharedQueue.get(workspaceId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(work);
    sharedQueue.set(workspaceId, result);
    return result;
  }
  const decode = (value: string) => migrateAgentSnapshot(JSON.parse(value), workspaceId);
  async function verifiedRawWrite(path: string, text: string) {
    await backend.write(path, text);
    if ((await backend.read(path)) !== text) throw new Error("Agent 写入读回验证失败");
  }
  async function verifiedWrite(path: string, text: string) {
    await verifiedRawWrite(path, text);
    decode(text);
  }
  async function readCurrent(): Promise<AgentSnapshot> {
    const primary = await backend.read(paths.primary);
    if (primary !== null) {
      try {
        return decode(primary);
      } catch (error) {
        if (error instanceof AgentDataCompatibilityError) throw error;
        throw new AgentRecoveryRequiredError();
      }
    }
    if (
      (await backend.read(paths.backup)) !== null ||
      (await backend.read(paths.staging)) !== null
    ) {
      throw new AgentRecoveryRequiredError();
    }
    return emptyAgentSnapshot(workspaceId);
  }
  async function recover(recoveredAt = new Date().toISOString()): Promise<AgentSnapshot> {
    const raw = {
      primary: await backend.read(paths.primary),
      backup: await backend.read(paths.backup),
      staging: await backend.read(paths.staging),
    };
    if (raw.primary !== null) {
      try {
        return decode(raw.primary);
      } catch (error) {
        // A healthy primary is never rolled back by the recovery button.
        if (error instanceof AgentDataCompatibilityError) throw error;
      }
    }
    const candidates: { source: "backup" | "staging"; state: AgentSnapshot }[] = [];
    for (const source of ["backup", "staging"] as const) {
      const value = raw[source];
      if (value === null) continue;
      try {
        candidates.push({ source, state: decode(value) });
      } catch (error) {
        if (error instanceof AgentDataCompatibilityError) throw error;
      }
    }
    // Highest valid revision wins. On ties, prefer the previously committed backup.
    candidates.sort(
      (a, b) => b.state.revision - a.state.revision || (a.source === "backup" ? -1 : 1),
    );
    const selected = candidates[0];
    if (!selected) throw new Error("没有有效的 Agent 恢复槽位；原文件未清空或改写");
    let index = 1;
    let quarantinePath = `${paths.primary}.quarantine-${index}.json`;
    while ((await backend.read(quarantinePath)) !== null) {
      index++;
      quarantinePath = `${paths.primary}.quarantine-${index}.json`;
    }
    const warning =
      "已显式恢复备份。暂存槽位可能从未提交，状态也可能过旧；委托已暂停，未处理事项须重新确认，投递结果按未知处理。请核对后再启用。";
    const previous = selected.state;
    const restored = parseAgentSnapshot(
      {
        ...previous,
        revision: previous.revision + 1,
        recovery: {
          recoveredAt,
          source: selected.source,
          prepared: selected.source === "staging",
          quarantinePath,
          warning,
        },
        delegations: previous.delegations.map((d) => ({
          ...d,
          status: "paused",
          version: d.version + 1,
          updatedAt: recoveredAt,
        })),
        commitments: previous.commitments.map((item) =>
          item.status === "open" || item.status === "waiting"
            ? {
                ...item,
                status: "candidate",
                correction:
                  `${item.correction ? `${item.correction}\n` : ""}备份恢复：原事项状态需要重新确认。`.slice(
                    0,
                    10000,
                  ),
                updatedAt: recoveredAt,
              }
            : item,
        ),
        outbox: previous.outbox.map((entry) =>
          entry.status === "pending" || entry.status === "sent"
            ? {
                ...entry,
                status: "unknown",
                error: "备份恢复：投递是否发生不可确认，禁止自动重发",
                updatedAt: recoveredAt,
              }
            : entry,
        ),
        runs: previous.runs.map((run) =>
          run.status === "running"
            ? {
                ...run,
                status: "failed",
                finishedAt: recoveredAt,
                error: "备份恢复：原运行已中断，不自动重放",
              }
            : run,
        ),
      },
      workspaceId,
    );
    // Preserve *all* bytes, including invalid primary/backup and prepared data, before changing any slot.
    await verifiedRawWrite(quarantinePath, JSON.stringify({ workspaceId, recoveredAt, ...raw }));
    const serialized = JSON.stringify(restored);
    await verifiedWrite(paths.staging, serialized);
    await verifiedWrite(paths.backup, serialized);
    await verifiedWrite(paths.primary, serialized);
    return restored;
  }
  return Object.freeze({
    load: () => serial(readCurrent),
    recover: (recoveredAt?: string) => serial(() => recover(recoveredAt)),
    save: (input: AgentSnapshot, expectedRevision: number) =>
      serial(async () => {
        const next = parseAgentSnapshot(input, workspaceId);
        const current = await readCurrent();
        if (current.revision !== expectedRevision || next.revision !== expectedRevision + 1)
          throw new Error("Agent 版本冲突，请重新加载后重试");
        const serialized = JSON.stringify(next);
        await verifiedWrite(paths.staging, serialized);
        await verifiedWrite(paths.backup, JSON.stringify(current));
        await verifiedWrite(paths.primary, serialized);
        return next;
      }),
  });
}
