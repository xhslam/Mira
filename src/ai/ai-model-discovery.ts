import type { AiSecretStore } from "./ai-secret-store";
import type { AiProviderProfileId } from "./provider-profile";

export type AiModelDiscoveryInput = Readonly<{
  baseUrl: string;
  apiKey?: string;
  profileId?: AiProviderProfileId;
  signal?: AbortSignal;
}>;

export type AiModelDiscovery = Readonly<{
  discover(input: AiModelDiscoveryInput): Promise<readonly string[]>;
}>;

export function aiModelsEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("模型服务地址必须是安全的 HTTPS 地址。");
  }
  return `${url.toString().replace(/\/$/u, "")}/models`;
}

export function parseDiscoveredModels(payload: unknown): readonly string[] {
  const records =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: readonly unknown[] }).data
      : Array.isArray(payload)
        ? payload
        : [];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of records) {
    const id =
      typeof item === "string"
        ? item.trim()
        : item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
          ? (item as { id: string }).id.trim()
          : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return Object.freeze(models.sort((left, right) => left.localeCompare(right)));
}

export function createAiModelDiscovery(
  options: Readonly<{
    secrets: AiSecretStore;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  }>,
): AiModelDiscovery {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  return Object.freeze({
    async discover(input) {
      const inlineKey = input.apiKey?.trim() ?? "";
      const storedKey =
        !inlineKey && input.profileId ? await options.secrets.get(input.profileId) : null;
      const apiKey = inlineKey || storedKey;
      if (!apiKey) throw new Error("请先填写 API Key，再从服务获取模型。");

      const controller = new AbortController();
      const relayAbort = () => controller.abort();
      input.signal?.addEventListener("abort", relayAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(aiModelsEndpoint(input.baseUrl), {
          method: "GET",
          headers: Object.freeze({
            authorization: `Bearer ${apiKey}`,
            accept: "application/json",
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403)
            throw new Error("API Key 未通过验证，无法读取模型列表。");
          throw new Error(`模型列表请求失败（HTTP ${response.status}）。`);
        }
        const models = parseDiscoveredModels((await response.json()) as unknown);
        if (models.length === 0) throw new Error("服务没有返回可用模型；你仍可手动输入模型 ID。");
        return models;
      } catch (error) {
        if (controller.signal.aborted && !input.signal?.aborted) {
          throw new Error("获取模型列表超时；你仍可手动输入模型 ID。");
        }
        if (error instanceof Error) throw error;
        throw new Error("无法获取模型列表；你仍可手动输入模型 ID。");
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", relayAbort);
      }
    },
  });
}
