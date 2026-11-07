import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import {
  createWorkerClient,
  createWorkerManifest,
  normalizeWorkerEndpoint,
  type WorkerCache,
  type WorkerClientStorage,
  type WorkerTransport,
} from "../../../src/agent/presentation/worker-client";
import { createAgentService, createAgentStore, emptyAgentSnapshot } from "../../../src/agent";
import { WorkerStore } from "../../../services/agent-worker/store.ts";
import { createWorkerServer } from "../../../services/agent-worker/server.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const TOKEN = "test-only-worker-client-token-1234567890";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  const store = new WorkerStore(":memory:", ["alpha"], () => NOW);
  const server = createWorkerServer(store, TOKEN);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cache: WorkerCache | null = null;
  let secret: string | null = null;
  let failSave = false;
  let loseAck = false;
  let ackCalls = 0;
  let putCalls = 0;
  const storage: WorkerClientStorage = {
    load: async () => (cache === null ? null : structuredClone(cache)),
    save: async (state) => {
      if (failSave && state.results.length) throw new Error("disk full");
      cache = structuredClone(state);
    },
    getToken: async () => secret,
    setToken: async (value) => {
      secret = value;
    },
    clearToken: async () => {
      secret = null;
    },
  };
  const transport: WorkerTransport = async (url, init) => {
    if (init.method === "PUT") putCalls++;
    if (url.endsWith("/ack")) ackCalls++;
    const response = await fetch(url, init);
    if (init.method === "PUT" && response.ok) store.tick();
    if (url.endsWith("/ack") && loseAck) {
      loseAck = false;
      throw new Error("response lost after delivery");
    }
    return response;
  };
  const options = { workspaceId: "alpha", storage, transport, clock: () => NOW };
  const client = createWorkerClient(options);
  const files = new Map<string, string>();
  let sequence = 0;
  const service = createAgentService({
    workspaceId: "alpha",
    store: createAgentStore({
      workspaceId: "alpha",
      backend: {
        read: async (path) => files.get(path) ?? null,
        write: async (path, value) => {
          files.set(path, value);
        },
      },
    }),
    clock: () => new Date(NOW).toISOString(),
    createId: () => `id-${++sequence}`,
  });
  await service.load();
  await service.addCommitment({
    title: "回信",
    dueAt: new Date(NOW - 10000).toISOString(),
    source: { kind: "manual", reference: "user" },
  });
  const draft = await service.addDelegation({
    goal: "每日检查事项",
    scope: ["commitments"],
    schedule: { kind: "daily", time: "20:00" },
    timezone: "Asia/Shanghai",
  });
  const snapshot = await service.toggleDelegation(draft.delegations[0]!.id, true);
  return {
    store,
    client,
    options,
    service,
    snapshot,
    endpoint,
    cache: () => cache,
    ackCalls: () => ackCalls,
    putCalls: () => putCalls,
    failSave: () => {
      failSave = true;
    },
    loseAck: () => {
      loseAck = true;
    },
  };
}

describe("worker client source and credential boundaries", () => {
  it("only allows clean HTTPS origins or explicit HTTP loopback", () => {
    expect(normalizeWorkerEndpoint("https://example.com/")).toBe("https://example.com");
    expect(normalizeWorkerEndpoint("http://127.0.0.1:9123")).toContain("9123");
    for (const invalid of [
      "http://192.168.1.2:9123",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com?token=secret",
    ])
      expect(() => normalizeWorkerEndpoint(invalid)).toThrow();
  });
  it("never converts unsupported active source scopes into item authority", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    const changed = await f.service.updateDelegation(f.snapshot.delegations[0]!.id, {
      scope: ["email"],
    });
    const unsupported = await f.service.toggleDelegation(changed.delegations[0]!.id, true);
    await expect(f.client.sync(unsupported)).rejects.toThrow("仅支持");
    expect(f.putCalls()).toBe(0);
    const paused = await f.service.toggleDelegation(changed.delegations[0]!.id, false);
    expect(createWorkerManifest(paused, 1, NOW).items).toEqual([]);
    expect(createWorkerManifest(paused, 1, NOW).delegations).toEqual([]);
  });
  it("does not upload unconfirmed candidates or any note bodies/provider credentials", async () => {
    const f = await fixture();
    const extracted = await f.service.review({
      reason: "manual",
      notes: [{ id: "n", workspaceId: "alpha", title: "note", text: "发送合同", authorized: true }],
      extract: async () => [{ title: "合同", noteId: "n", quote: "发送合同" }],
    });
    const manifest = createWorkerManifest(extracted, 1, NOW);
    expect(manifest.items).toHaveLength(1);
    expect(JSON.stringify(manifest)).not.toContain("发送合同");
    expect(JSON.stringify(manifest)).not.toContain("apiKey");
    expect(manifest.delegations[0]!.scope).toEqual(["commitments"]);
  });
  it("refuses cross-workspace synchronization before sending any manifest", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    await expect(f.client.sync(emptyAgentSnapshot("beta"))).rejects.toThrow("跨工作区");
    expect(f.putCalls()).toBe(0);
  });
});

describe("durable-before-ack protocol integration", () => {
  it("pairs without upload, synchronizes a real review and persists results before ack", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    expect(f.putCalls()).toBe(0);
    const result = await f.client.sync(f.snapshot);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.findings[0]!.title).toBe("回信");
    expect(result.results[0]!.delivery).toBe("acknowledged");
    expect(f.store.results("alpha").results[0]!.delivery).toBe("acknowledged");
    expect(result.runs[0]!.state).toBe("succeeded");
    const again = await f.client.sync(f.snapshot);
    expect(again.results).toHaveLength(1);
    expect(f.store.health().workspaces).toBeDefined();
  });
  it("never acknowledges when local durable reception fails", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    f.failSave();
    await expect(f.client.sync(f.snapshot)).rejects.toThrow("disk full");
    expect(f.ackCalls()).toBe(0);
    expect(f.store.results("alpha").results[0]!.delivery).toBe("pending");
    expect(f.cache()!.cursor).toBe("0");
  });
  it("recovers an unknown ack after App restart without re-execution or duplicate results", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    f.loseAck();
    await expect(f.client.sync(f.snapshot)).rejects.toThrow("response lost");
    expect(f.cache()!.results).toHaveLength(1);
    expect(f.cache()!.cursor).toBe("0");
    const restarted = createWorkerClient(f.options);
    const result = await restarted.sync(f.snapshot);
    expect(result.results).toHaveLength(1);
    expect(f.ackCalls()).toBe(2);
    expect(f.store.runs("alpha").runs).toHaveLength(1);
  });
  it("uploads cancellation, then no new daily result is created", async () => {
    const f = await fixture();
    await f.client.connect(f.endpoint, TOKEN);
    await f.client.sync(f.snapshot);
    const paused = await f.service.toggleDelegation(f.snapshot.delegations[0]!.id, false);
    await f.client.sync(paused);
    expect(f.store.tick()).toBe(0);
    expect(f.store.runs("alpha").runs).toHaveLength(1);
  });
});
