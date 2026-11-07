export type Item = Readonly<{
  id: string;
  title: string;
  status: "open" | "awaiting_confirmation" | "completed" | "dismissed";
  dueAt: number | null;
  snoozedUntil: number | null;
  source: string;
}>;
export type Delegation = Readonly<{
  id: string;
  version: number;
  name: string;
  prompt: string;
  enabled: boolean;
  scope: readonly ["commitments"];
  schedule: Readonly<{ kind: "daily"; hour: number; minute: number }>;
  timezone: string;
}>;
export type Manifest = Readonly<{
  protocolVersion: 1;
  workspaceId: string;
  syncVersion: number;
  snapshotAt: number;
  delegations: readonly Delegation[];
  items: readonly Item[];
}>;
export type Finding = Readonly<{
  itemId: string;
  title: string;
  source: string;
  reason: "overdue" | "due_today" | "awaiting_confirmation";
}>;
export type WorkerResult = {
  id: string;
  cursor: string;
  workspaceId: string;
  delegationId: string;
  delegationVersion: number;
  occurrenceKey: string;
  createdAt: number;
  snapshotAt: number;
  syncVersion: number;
  coverage: {
    sources: ["uploaded-items"];
    unavailable: ["email", "messages"];
    snapshotAt: number;
    checkedAt: number;
    mode: "snapshot-only";
  };
  findings: readonly Finding[];
  delivery: "pending" | "acknowledged";
  acknowledgedAt: number | null;
};
export type WorkerRun = Readonly<{
  id: string;
  delegationId: string;
  delegationVersion: number;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  createdAt: number;
  errorCode: string | null;
}>;

export class WorkerError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    invalid();
  return record;
}
export function invalid(): never {
  throw new WorkerError(400, "invalid_request");
}
export function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) invalid();
  return value;
}
export function id(value: unknown): string {
  const result = text(value, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(result)) invalid();
  return result;
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    invalid();
  return value;
}
function timestamp(value: unknown): number {
  return integer(value, 0, 8_640_000_000_000_000);
}
function nullableTime(value: unknown): number | null {
  return value === null ? null : timestamp(value);
}
export function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value;
}
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length) invalid();
  return values;
}
// Persisted snapshots need structural validation, not upload-time clock freshness.
export function parseStoredManifest(value: unknown): Manifest {
  const m = object(value, [
    "protocolVersion",
    "workspaceId",
    "syncVersion",
    "snapshotAt",
    "delegations",
    "items",
  ]);
  if (m.protocolVersion !== 1) invalid();
  const snapshotAt = timestamp(m.snapshotAt);
  const delegations = unique(
    array(m.delegations, 100).map((value): Delegation => {
      const d = object(value, [
        "id",
        "version",
        "name",
        "prompt",
        "enabled",
        "scope",
        "schedule",
        "timezone",
      ]);
      if (!Array.isArray(d.scope) || d.scope.length !== 1 || d.scope[0] !== "commitments")
        invalid();
      const s = object(d.schedule, ["kind", "hour", "minute"]);
      if (s.kind !== "daily" || typeof d.enabled !== "boolean") invalid();
      const timezone = text(d.timezone, 100);
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
      } catch {
        invalid();
      }
      return {
        id: id(d.id),
        version: integer(d.version, 1),
        name: text(d.name, 200),
        prompt: text(d.prompt, 8000),
        enabled: d.enabled,
        scope: ["commitments"],
        schedule: { kind: "daily", hour: integer(s.hour, 0, 23), minute: integer(s.minute, 0, 59) },
        timezone,
      };
    }),
  );
  const items = unique(
    array(m.items, 500).map((value): Item => {
      const i = object(value, ["id", "title", "status", "dueAt", "snoozedUntil", "source"]);
      if (
        typeof i.status !== "string" ||
        !["open", "awaiting_confirmation", "completed", "dismissed"].includes(i.status)
      )
        invalid();
      return {
        id: id(i.id),
        title: text(i.title),
        status: i.status as Item["status"],
        dueAt: nullableTime(i.dueAt),
        snoozedUntil: nullableTime(i.snoozedUntil),
        source: text(i.source),
      };
    }),
  );
  return {
    protocolVersion: 1,
    workspaceId: id(m.workspaceId),
    syncVersion: integer(m.syncVersion, 1),
    snapshotAt,
    delegations,
    items,
  };
}
export function parseManifest(value: unknown, now: number): Manifest {
  const manifest = parseStoredManifest(value);
  if (manifest.snapshotAt > now + 60_000) invalid();
  return manifest;
}

export function localTime(now: number, timezone: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
export function review(manifest: Manifest, delegation: Delegation, now: number): Finding[] {
  const today = localTime(now, delegation.timezone).date;
  return manifest.items.flatMap((item): Finding[] => {
    if (
      item.status === "completed" ||
      item.status === "dismissed" ||
      (item.snoozedUntil !== null && item.snoozedUntil > now)
    )
      return [];
    const base = { itemId: item.id, title: item.title, source: item.source };
    if (item.status === "awaiting_confirmation")
      return [{ ...base, reason: "awaiting_confirmation" }];
    if (item.dueAt !== null && item.dueAt < now) return [{ ...base, reason: "overdue" }];
    if (item.dueAt !== null && localTime(item.dueAt, delegation.timezone).date === today)
      return [{ ...base, reason: "due_today" }];
    return [];
  });
}
