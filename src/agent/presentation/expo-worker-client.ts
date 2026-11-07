import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import {
  createWorkerClient,
  workerCacheSchema,
  type AgentWorkerClient,
  type WorkerCache,
} from "./worker-client";

const clients = new Map<string, AgentWorkerClient>();
export function createExpoWorkerClient(workspaceId: string): AgentWorkerClient {
  const existing = clients.get(workspaceId);
  if (existing) return existing;
  const root = new Directory(Paths.document, "personal-agent-worker");
  const name = encodeURIComponent(workspaceId);
  const primary = new File(root, `${name}.json`);
  const backup = new File(root, `${name}.backup.json`);
  const staging = new File(root, `${name}.staging.json`);
  const secretKey = `mira.agent-worker.${workspaceId.replace(/[^a-zA-Z0-9_.-]/gu, "_")}`;
  const parse = (text: string) => {
    const state = workerCacheSchema.parse(JSON.parse(text) as unknown);
    if (
      state.workspaceId !== workspaceId ||
      state.results.some((r) => r.workspaceId !== workspaceId)
    )
      throw new Error("服务缓存工作区不匹配。");
    return state;
  };
  const client = createWorkerClient({
    workspaceId,
    transport: (url, init) => fetch(url, init),
    storage: {
      async load() {
        if (!primary.exists && !backup.exists && !staging.exists) return null;
        if (primary.exists) {
          try {
            return parse(await primary.text());
          } catch {
            /* Fail closed: an old endpoint must never receive a newer credential. */
          }
        }
        throw new Error("服务缓存无法读取；原文件已保留，不会自动回退旧服务地址。请勿清空数据。");
      },
      async save(state: WorkerCache) {
        if (!root.exists) root.create({ intermediates: true, idempotent: true });
        const text = JSON.stringify(state);
        staging.write(text);
        if ((await staging.text()) !== text) throw new Error("服务缓存写入校验失败。");
        parse(text);
        if (primary.exists) {
          const old = await primary.text();
          let valid = false;
          try {
            parse(old);
            valid = true;
          } catch {
            if (!backup.exists) throw new Error("服务缓存备份不可用。");
            parse(await backup.text());
          }
          if (valid) {
            backup.write(old);
            if ((await backup.text()) !== old) throw new Error("备份校验失败。");
          }
        }
        primary.write(text);
        if ((await primary.text()) !== text) throw new Error("服务缓存保存失败。");
      },
      getToken: () => SecureStore.getItemAsync(secretKey),
      setToken: (token) =>
        SecureStore.setItemAsync(secretKey, token, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      clearToken: () => SecureStore.deleteItemAsync(secretKey),
    },
  });
  clients.set(workspaceId, client);
  return client;
}
