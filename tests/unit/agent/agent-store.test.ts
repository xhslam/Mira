import { describe, expect, it } from "vitest";
import {
  agentStorePaths,
  createAgentStore,
  emptyAgentSnapshot,
  parseAgentSnapshot,
  migrateAgentSnapshot,
  type TextFileBackend,
  type AgentSnapshot,
  assertConnectorGrant,
} from "../../../src/agent";

function fixture() {
  const files = new Map<string, string>();
  let corruptWritePath: string | null = null;
  let failRead = false;
  const backend: TextFileBackend = {
    async read(path) {
      if (failRead) throw new Error("permission denied");
      return files.get(path) ?? null;
    },
    async write(path, text) {
      files.set(path, path === corruptWritePath ? "corrupt" : text);
    },
  };
  const store = createAgentStore({ backend, workspaceId: "w" });
  return {
    files,
    backend,
    store,
    corrupt: (path: string) => {
      corruptWritePath = path;
    },
    deny: () => {
      failRead = true;
    },
  };
}
const next = (state: AgentSnapshot): AgentSnapshot => ({ ...state, revision: state.revision + 1 });

describe("versioned independent Agent store", () => {
  it("persists separately from rebuildable indexes and verifies exact readback", async () => {
    const f = fixture();
    const before = await f.store.load();
    const after = await f.store.save(next(before), 0);
    expect(after.revision).toBe(1);
    expect((await f.store.load()).revision).toBe(1);
    const paths = agentStorePaths("w");
    expect(f.files.has(paths.primary)).toBe(true);
    expect(f.files.has(paths.backup)).toBe(true);
    expect(f.files.has(paths.staging)).toBe(true);
    expect(JSON.parse(f.files.get(paths.backup)!).revision).toBe(0);
  });
  it("refuses corrupt staged writes before touching authoritative data", async () => {
    const f = fixture();
    await f.store.save(next(await f.store.load()), 0);
    const paths = agentStorePaths("w");
    const original = f.files.get(paths.primary);
    f.corrupt(paths.staging);
    await expect(f.store.save(next(await f.store.load()), 1)).rejects.toThrow("读回验证");
    expect(f.files.get(paths.primary)).toBe(original);
  });
  it("requires explicit recovery and preserves all damaged/prepared bytes", async () => {
    const f = fixture();
    await f.store.save(next(await f.store.load()), 0);
    await f.store.save(next(await f.store.load()), 1);
    const paths = agentStorePaths("w");
    f.files.set(paths.primary, "{broken");
    await expect(f.store.load()).rejects.toMatchObject({ code: "AGENT_RECOVERY_REQUIRED" });
    expect(f.files.get(paths.primary)).toBe("{broken");
    const restored = await f.store.recover("2026-11-05T03:00:00Z");
    expect(restored.revision).toBe(3);
    expect(restored.recovery?.prepared).toBe(true);
    expect(JSON.parse(f.files.get(restored.recovery!.quarantinePath)!).primary).toBe("{broken");
    expect((await f.store.load()).revision).toBe(3);
  });
  it("refuses destructive reset when both primary and backup are corrupt", async () => {
    const f = fixture();
    const paths = agentStorePaths("w");
    f.files.set(paths.primary, "broken primary");
    f.files.set(paths.backup, "broken backup");
    await expect(f.store.load()).rejects.toThrow();
    expect(f.files.get(paths.primary)).toBe("broken primary");
    expect(f.files.get(paths.backup)).toBe("broken backup");
  });
  it("does not interpret an I/O or permission failure as an empty workspace", async () => {
    const f = fixture();
    f.deny();
    await expect(f.store.load()).rejects.toThrow("permission denied");
  });
  it("serializes independent store instances sharing a backend and detects stale writers", async () => {
    const f = fixture();
    const other = createAgentStore({ backend: f.backend, workspaceId: "w" });
    const initial = await f.store.load();
    const result = await Promise.allSettled([
      f.store.save(next(initial), 0),
      other.save(next(initial), 0),
    ]);
    expect(result.map((entry) => entry.status)).toEqual(["fulfilled", "rejected"]);
    expect((await other.load()).revision).toBe(1);
  });
  it("isolates encoded workspace paths and refuses embedded cross-workspace state", async () => {
    const f = fixture();
    const other = createAgentStore({ backend: f.backend, workspaceId: "../other" });
    expect(agentStorePaths("../other").primary).not.toContain("../");
    await f.store.save(next(await f.store.load()), 0);
    expect((await other.load()).revision).toBe(0);
    await expect(other.save(next(await f.store.load()), 0)).rejects.toThrow("工作区");
  });
  it("does not read data disguised as another workspace", async () => {
    const f = fixture();
    f.files.set(agentStorePaths("w").primary, JSON.stringify(emptyAgentSnapshot("elsewhere")));
    await expect(f.store.load()).rejects.toThrow();
  });
  it("migrates v1 delivery collection without mutating or dropping prior fields", () => {
    const raw = { ...emptyAgentSnapshot("w"), schemaVersion: 1, revision: 7 };
    const { outbox: _, ...legacy } = raw;
    const migrated = migrateAgentSnapshot(legacy, "w");
    expect(migrated).toMatchObject({ schemaVersion: 2, revision: 7, outbox: [] });
    expect(legacy.schemaVersion).toBe(1);
    expect(Object.isFrozen(migrated)).toBe(true);
  });
  it("rejects unknown future versions and unknown fields instead of stripping user data", () => {
    expect(() =>
      migrateAgentSnapshot({ ...emptyAgentSnapshot("w"), schemaVersion: 99 }, "w"),
    ).toThrow();
    expect(() =>
      parseAgentSnapshot({ ...emptyAgentSnapshot("w"), extra: "important data" }, "w"),
    ).toThrow();
  });
  it("never overwrites a future-version primary with an older valid backup", async () => {
    const f = fixture();
    const paths = agentStorePaths("w");
    const future = JSON.stringify({ ...emptyAgentSnapshot("w"), schemaVersion: 3 });
    f.files.set(paths.primary, future);
    f.files.set(paths.backup, JSON.stringify(emptyAgentSnapshot("w")));
    await expect(f.store.load()).rejects.toThrow("升级应用");
    expect(f.files.get(paths.primary)).toBe(future);
  });
  it("rejects a failed primary readback and preserves the prior verified backup", async () => {
    const f = fixture();
    const initial = await f.store.load();
    await f.store.save(next(initial), 0);
    f.corrupt(agentStorePaths("w").primary);
    await expect(f.store.save(next(await f.store.load()), 1)).rejects.toThrow("读回验证");
    expect(JSON.parse(f.files.get(agentStorePaths("w").backup)!).revision).toBe(1);
  });
  it("retains v1 primary until the next successful explicit mutation", async () => {
    const f = fixture();
    const paths = agentStorePaths("w");
    const raw = { ...emptyAgentSnapshot("w"), schemaVersion: 1 };
    const { outbox: _, ...legacy } = raw;
    f.files.set(paths.primary, JSON.stringify(legacy));
    const loaded = await f.store.load();
    expect(loaded.schemaVersion).toBe(2);
    expect(JSON.parse(f.files.get(paths.primary)!).schemaVersion).toBe(1);
    await f.store.save(next(loaded), 0);
    expect(JSON.parse(f.files.get(paths.primary)!).schemaVersion).toBe(2);
  });
});

describe("readonly connector grant guard", () => {
  const grant = {
    workspaceId: "w",
    connectorId: "mail",
    scope: ["email"] as const,
    version: 1,
    revokedAt: null,
  };
  it("checks workspace, connector, requested scope and revocation", () => {
    expect(() => assertConnectorGrant(grant, "w", "mail", "email")).not.toThrow();
    expect(() => assertConnectorGrant(grant, "other", "mail", "email")).toThrow();
    expect(() => assertConnectorGrant(grant, "w", "else", "email")).toThrow();
    expect(() => assertConnectorGrant(grant, "w", "mail", "calendar")).toThrow();
    expect(() =>
      assertConnectorGrant({ ...grant, revokedAt: "2026-11-05T00:00:00Z" }, "w", "mail", "email"),
    ).toThrow();
  });
});
