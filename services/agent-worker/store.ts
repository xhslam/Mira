import { DatabaseSync } from "node:sqlite";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { localTime, parseManifest, parseStoredManifest, review, WorkerError } from "./contract.ts";
import type { Delegation, Finding, Manifest, WorkerResult, WorkerRun } from "./contract.ts";

type Row = Record<string, unknown>;
export type Lease = {
  key: string;
  workspaceId: string;
  delegation: Delegation;
  manifest: Manifest;
  owner: string;
};
export class WorkerStore {
  readonly db: DatabaseSync;
  readonly clock: () => number;
  readonly grants: ReadonlySet<string>;
  readonly leaseMs: number;
  constructor(
    path: string,
    grants: readonly string[],
    clock: () => number = Date.now,
    leaseMs = 60_000,
  ) {
    this.clock = clock;
    this.grants = new Set(grants);
    this.leaseMs = leaseMs;
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      try {
        if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
          throw new Error("unsafe_database_path");
        chmodSync(path, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    this.db = new DatabaseSync(path);
    try {
      if (path !== ":memory:") chmodSync(path, 0o600);
      const check = this.db.prepare("PRAGMA quick_check").get() as Row;
      if (Object.values(check)[0] !== "ok") throw new Error("database_integrity_failure");
      const version = Number((this.db.prepare("PRAGMA user_version").get() as Row).user_version);
      if (version !== 0 && version !== 1) throw new Error("unsupported_database_version");
      this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS manifests (workspace TEXT PRIMARY KEY, body TEXT NOT NULL, received INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS versions (workspace TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, last_date TEXT NOT NULL DEFAULT '', PRIMARY KEY(workspace,id));
        CREATE TABLE IF NOT EXISTS runs (key TEXT PRIMARY KEY, workspace TEXT NOT NULL, delegation TEXT NOT NULL, version INTEGER NOT NULL, date TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, owner TEXT, retry_at INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, error TEXT);
        CREATE TABLE IF NOT EXISTS results (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, workspace TEXT NOT NULL, run_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL, ack_at INTEGER);
        CREATE INDEX IF NOT EXISTS results_workspace ON results(workspace,seq);
        CREATE INDEX IF NOT EXISTS runs_workspace ON runs(workspace,state);
        PRAGMA user_version=1;`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
  authorize(workspace: string): void {
    if (!this.grants.has(workspace)) throw new WorkerError(403, "workspace_not_authorized");
  }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  accept(input: unknown): { protocolVersion: 1; acceptedSyncVersion: number; receivedAt: number } {
    const now = this.clock();
    const manifest = parseManifest(input, now);
    this.authorize(manifest.workspaceId);
    return this.transaction(() => {
      const existing = this.db
        .prepare("SELECT body, received FROM manifests WHERE workspace=?")
        .get(manifest.workspaceId) as Row | undefined;
      const old = existing ? (JSON.parse(String(existing.body)) as Manifest) : undefined;
      if (old && manifest.syncVersion <= old.syncVersion) {
        if (JSON.stringify(old) !== JSON.stringify(manifest))
          throw new WorkerError(409, "sync_version_conflict");
        return {
          protocolVersion: 1,
          acceptedSyncVersion: old.syncVersion,
          receivedAt: Number(existing!.received),
        };
      }
      const storedVersions = Number(
        (
          this.db
            .prepare("SELECT count(*) AS count FROM versions WHERE workspace=?")
            .get(manifest.workspaceId) as Row
        ).count,
      );
      const newVersions = manifest.delegations.filter(
        (d) =>
          !this.db
            .prepare("SELECT 1 FROM versions WHERE workspace=? AND id=?")
            .get(manifest.workspaceId, d.id),
      ).length;
      if (storedVersions + newVersions > 10_000)
        throw new WorkerError(503, "delegation_history_capacity");
      for (const delegation of manifest.delegations) {
        const previous = this.db
          .prepare("SELECT version,body FROM versions WHERE workspace=? AND id=?")
          .get(manifest.workspaceId, delegation.id) as Row | undefined;
        const wasPresent = old?.delegations.some((d) => d.id === delegation.id);
        if (
          previous &&
          (delegation.version < Number(previous.version) ||
            (delegation.version === Number(previous.version) &&
              (!wasPresent || String(previous.body) !== JSON.stringify(delegation))))
        )
          throw new WorkerError(409, "delegation_version_conflict");
        if (!previous)
          this.db
            .prepare("INSERT INTO versions(workspace,id,version,body) VALUES(?,?,?,?)")
            .run(
              manifest.workspaceId,
              delegation.id,
              delegation.version,
              JSON.stringify(delegation),
            );
        else if (delegation.version > Number(previous.version))
          this.db
            .prepare("UPDATE versions SET version=?,body=?,last_date='' WHERE workspace=? AND id=?")
            .run(
              delegation.version,
              JSON.stringify(delegation),
              manifest.workspaceId,
              delegation.id,
            );
      }
      this.db
        .prepare(
          "INSERT INTO manifests(workspace,body,received) VALUES(?,?,?) ON CONFLICT(workspace) DO UPDATE SET body=excluded.body,received=excluded.received",
        )
        .run(manifest.workspaceId, JSON.stringify(manifest), now);
      const active = new Map(
        manifest.delegations.filter((d) => d.enabled).map((d) => [d.id, d.version]),
      );
      const runs = this.db
        .prepare(
          "SELECT key,delegation,version FROM runs WHERE workspace=? AND state IN ('pending','running')",
        )
        .all(manifest.workspaceId) as Row[];
      for (const run of runs)
        if (active.get(String(run.delegation)) !== Number(run.version))
          this.db
            .prepare("UPDATE runs SET state='cancelled',owner=NULL,lease_until=NULL WHERE key=?")
            .run(String(run.key));
      return { protocolVersion: 1, acceptedSyncVersion: manifest.syncVersion, receivedAt: now };
    });
  }
  // A claim is persisted separately from execution so a process crash leaves a recoverable lease.
  claim(): Lease | undefined {
    const now = this.clock();
    return this.transaction(() => {
      this.db
        .prepare(
          "UPDATE runs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,owner=NULL,lease_until=NULL,error='lease_expired',retry_at=? WHERE state='running' AND lease_until<=?",
        )
        .run(now, now);
      // Remove acknowledged payloads and terminal runs only after 30 days. Version/date watermarks remain.
      const cutoff = now - 30 * 86_400_000;
      this.db.prepare("DELETE FROM results WHERE ack_at IS NOT NULL AND ack_at<?").run(cutoff);
      this.db
        .prepare(
          "DELETE FROM runs WHERE created<? AND state IN ('succeeded','failed','cancelled') AND key NOT IN (SELECT run_key FROM results)",
        )
        .run(cutoff);
      const manifests = this.db
        .prepare("SELECT body FROM manifests ORDER BY received")
        .all() as Row[];
      for (const row of manifests) {
        const manifest = parseStoredManifest(JSON.parse(String(row.body)));
        if (!this.grants.has(manifest.workspaceId)) continue;
        for (const delegation of manifest.delegations) {
          if (!delegation.enabled) continue;
          const local = localTime(now, delegation.timezone);
          if (local.minute < delegation.schedule.hour * 60 + delegation.schedule.minute) continue;
          this.db
            .prepare(
              "UPDATE runs SET state='cancelled',owner=NULL,lease_until=NULL WHERE workspace=? AND delegation=? AND version=? AND date<? AND state IN ('pending','running')",
            )
            .run(manifest.workspaceId, delegation.id, delegation.version, local.date);
          const key = `${manifest.workspaceId}:${delegation.id}:v${delegation.version}:${local.date}`;
          let run = this.db.prepare("SELECT * FROM runs WHERE key=?").get(key) as Row | undefined;
          if (!run) {
            const watermark = this.db
              .prepare("SELECT last_date FROM versions WHERE workspace=? AND id=?")
              .get(manifest.workspaceId, delegation.id) as Row;
            if (String(watermark.last_date) >= local.date) continue;
            const counts = this.db
              .prepare(
                "SELECT (SELECT count(*) FROM runs WHERE workspace=?) AS runs,(SELECT count(*) FROM results WHERE workspace=?) AS results,(SELECT count(*) FROM versions WHERE workspace=?) AS versions",
              )
              .get(manifest.workspaceId, manifest.workspaceId, manifest.workspaceId) as Row;
            if (Number(counts.runs) >= 10_000 || Number(counts.results) >= 10_000) continue;
            this.db
              .prepare(
                "INSERT INTO runs(key,workspace,delegation,version,date,state,created) VALUES(?,?,?,?,?,'pending',?)",
              )
              .run(key, manifest.workspaceId, delegation.id, delegation.version, local.date, now);
            this.db
              .prepare("UPDATE versions SET last_date=? WHERE workspace=? AND id=?")
              .run(local.date, manifest.workspaceId, delegation.id);
            run = this.db.prepare("SELECT * FROM runs WHERE key=?").get(key) as Row;
          }
          if (run.state !== "pending" || Number(run.retry_at) > now) continue;
          const owner = randomUUID();
          this.db
            .prepare(
              "UPDATE runs SET state='running',attempts=attempts+1,owner=?,lease_until=? WHERE key=?",
            )
            .run(owner, now + this.leaseMs, key);
          return { key, workspaceId: manifest.workspaceId, manifest, delegation, owner };
        }
      }
      return undefined;
    });
  }
  execute(
    lease: Lease,
    reviewer: (m: Manifest, d: Delegation, now: number) => readonly Finding[] = review,
  ): boolean {
    const now = this.clock();
    try {
      const row = this.db
        .prepare("SELECT body FROM manifests WHERE workspace=?")
        .get(lease.workspaceId) as Row | undefined;
      if (!row) return false;
      const manifest = parseStoredManifest(JSON.parse(String(row.body)));
      const current = manifest.delegations.find(
        (d) => d.id === lease.delegation.id && d.version === lease.delegation.version && d.enabled,
      );
      if (!current) return false;
      const findings = reviewer(manifest, current, now);
      return this.transaction(() => {
        const run = this.db
          .prepare("SELECT state,owner,lease_until FROM runs WHERE key=?")
          .get(lease.key) as Row | undefined;
        if (
          !this.grants.has(lease.workspaceId) ||
          !run ||
          run.state !== "running" ||
          run.owner !== lease.owner ||
          Number(run.lease_until) <= now
        )
          return false;
        const result: WorkerResult = {
          id: randomUUID(),
          cursor: "",
          workspaceId: lease.workspaceId,
          delegationId: lease.delegation.id,
          delegationVersion: lease.delegation.version,
          occurrenceKey: lease.key,
          createdAt: now,
          snapshotAt: manifest.snapshotAt,
          syncVersion: manifest.syncVersion,
          coverage: {
            sources: ["uploaded-items"],
            unavailable: ["email", "messages"],
            snapshotAt: manifest.snapshotAt,
            checkedAt: now,
            mode: "snapshot-only",
          },
          findings,
          delivery: "pending",
          acknowledgedAt: null,
        };
        this.db
          .prepare("INSERT INTO results(id,workspace,run_key,body) VALUES(?,?,?,?)")
          .run(result.id, lease.workspaceId, lease.key, JSON.stringify(result));
        this.db
          .prepare(
            "UPDATE runs SET state='succeeded',owner=NULL,lease_until=NULL,error=NULL WHERE key=?",
          )
          .run(lease.key);
        return true;
      });
    } catch {
      this.db
        .prepare(
          "UPDATE runs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,retry_at=?,owner=NULL,lease_until=NULL,error='review_failed' WHERE key=? AND state='running' AND owner=?",
        )
        .run(now + 30_000, lease.key, lease.owner);
      return false;
    }
  }
  tick(max = 100): number {
    let completed = 0;
    for (let i = 0; i < max; i++) {
      const lease = this.claim();
      if (!lease) break;
      if (this.execute(lease)) completed++;
    }
    return completed;
  }
  results(
    workspace: string,
    after = "0",
    limit = 50,
  ): { protocolVersion: 1; results: WorkerResult[]; nextCursor: string; hasMore: boolean } {
    this.authorize(workspace);
    if (
      !/^(0|[1-9][0-9]{0,15})$/.test(after) ||
      !Number.isSafeInteger(Number(after)) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new WorkerError(400, "invalid_pagination");
    const rows = this.db
      .prepare("SELECT * FROM results WHERE workspace=? AND seq>? ORDER BY seq LIMIT ?")
      .all(workspace, Number(after), limit + 1) as Row[];
    const results = rows.slice(0, limit).map((row): WorkerResult => ({
      ...(JSON.parse(String(row.body)) as WorkerResult),
      cursor: String(row.seq),
      delivery: row.ack_at === null ? "pending" : "acknowledged",
      acknowledgedAt: row.ack_at === null ? null : Number(row.ack_at),
    }));
    return {
      protocolVersion: 1,
      results,
      nextCursor: results.at(-1)?.cursor ?? after,
      hasMore: rows.length > limit,
    };
  }
  ack(workspace: string, ids: readonly string[]): number {
    this.authorize(workspace);
    return this.transaction(() => {
      let count = 0;
      for (const id of new Set(ids))
        count += Number(
          this.db
            .prepare("UPDATE results SET ack_at=? WHERE workspace=? AND id=? AND ack_at IS NULL")
            .run(this.clock(), workspace, id).changes,
        );
      return count;
    });
  }
  runs(workspace: string, limit = 50): { protocolVersion: 1; runs: WorkerRun[] } {
    this.authorize(workspace);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new WorkerError(400, "invalid_pagination");
    const rows = this.db
      .prepare(
        "SELECT key,delegation,version,state,attempts,created,error FROM runs WHERE workspace=? ORDER BY created DESC,key DESC LIMIT ?",
      )
      .all(workspace, limit) as Row[];
    return {
      protocolVersion: 1,
      runs: rows.map((row): WorkerRun => ({
        id: String(row.key),
        delegationId: String(row.delegation),
        delegationVersion: Number(row.version),
        state: row.state as WorkerRun["state"],
        attempts: Number(row.attempts),
        createdAt: Number(row.created),
        // Never serialize arbitrary database exception text, lease owner or raw rows.
        errorCode:
          row.error === "review_failed" || row.error === "lease_expired" ? row.error : null,
      })),
    };
  }
  health(): Record<string, unknown> {
    const workspaces = [...this.grants].map((workspaceId) => {
      const row = this.db
        .prepare(
          "SELECT (SELECT count(*) FROM runs WHERE workspace=?) AS runs,(SELECT count(*) FROM results WHERE workspace=?) AS results",
        )
        .get(workspaceId, workspaceId) as Row;
      return {
        workspaceId,
        runs: Number(row.runs),
        results: Number(row.results),
        capacityBlocked: Number(row.runs) >= 10_000 || Number(row.results) >= 10_000,
      };
    });
    return { workspaces };
  }
}
