import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentService } from "../../../src/agent/agent-service";
import { createExpoAgentStore } from "../../../src/agent/expo-agent-store";
import { createExpoWorkerClient } from "../../../src/agent/presentation/expo-worker-client";

const native = vi.hoisted(() => ({
  files: new Map<string, string>(),
  directories: new Set<string>(),
  secrets: new Map<string, string>(),
  fetch: vi.fn(),
}));
vi.mock("expo-file-system", () => {
  const path = (parts: readonly unknown[]) =>
    parts
      .map((part) => (typeof part === "object" && part && "uri" in part ? part.uri : String(part)))
      .join("/");
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = path(parts);
    }
    get exists() {
      return native.directories.has(this.uri);
    }
    create() {
      native.directories.add(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = path(parts);
    }
    get exists() {
      return native.files.has(this.uri);
    }
    async text() {
      if (!this.exists) throw new Error("missing");
      return native.files.get(this.uri)!;
    }
    write(text: string) {
      native.files.set(this.uri, text);
    }
  }
  return { Directory, File, Paths: { document: "document:" } };
});
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  getItemAsync: async (key: string) => native.secrets.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    native.secrets.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    native.secrets.delete(key);
  },
}));
beforeEach(() => {
  native.files.clear();
  native.directories.clear();
  native.secrets.clear();
  native.fetch.mockReset();
  vi.stubGlobal("fetch", native.fetch);
});

describe("native Agent adapter contracts (mocked Expo, not device evidence)", () => {
  it("writes authoritative data to the separate native directory and reopens it", async () => {
    const options = {
      workspaceId: "native-store",
      store: createExpoAgentStore({ workspaceId: "native-store" }),
      clock: () => "2026-11-05T04:00:00Z",
      createId: () => "item-1",
    };
    const service = createAgentService(options);
    await service.load();
    await service.addCommitment({ title: "回信", source: { kind: "manual", reference: "user" } });
    expect(
      [...native.files.keys()].every((key) => key.startsWith("document:/personal-agent/")),
    ).toBe(true);
    const reopened = createAgentService({
      ...options,
      store: createExpoAgentStore({ workspaceId: "native-store" }),
    });
    expect((await reopened.load()).commitments[0]!.title).toBe("回信");
  });
  it("keeps a verified worker credential out of config files", async () => {
    const token = "test-only-adapter-token-123456789012345";
    native.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          protocolVersion: 1,
          service: "mira-agent-worker",
          workspaces: ["native-worker"],
          serverTime: 1,
          capabilities: {
            execution: "deterministic-item-review",
            email: false,
            messages: false,
            systemPush: false,
          },
          storage: {},
        }),
    });
    const client = createExpoWorkerClient("native-worker");
    await client.connect("https://worker.example", token);
    expect(native.secrets.get("mira.agent-worker.native-worker")).toBe(token);
    expect([...native.files.values()].join("")).not.toContain(token);
  });
  it("never falls back to an old worker endpoint with a newer credential", async () => {
    const prefix = "document:/personal-agent-worker/native-broken.json";
    native.files.set(prefix, "broken");
    native.files.set(
      "document:/personal-agent-worker/native-broken.backup.json",
      JSON.stringify({
        version: 1,
        workspaceId: "native-broken",
        endpoint: "https://old.example",
        syncVersion: 1,
        cursor: "0",
        lastSyncAt: null,
        results: [],
        runs: [],
      }),
    );
    native.secrets.set("mira.agent-worker.native-broken", "new-endpoint-token");
    await expect(createExpoWorkerClient("native-broken").load()).rejects.toThrow(
      "不会自动回退旧服务地址",
    );
    expect(native.files.get(prefix)).toBe("broken");
    expect(native.fetch).not.toHaveBeenCalled();
  });
});
