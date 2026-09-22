import type { AiProviderAdapter } from "./provider-profile";

export type AiProviderCatalogEntry = Readonly<{
  id: string;
  name: string;
  description: string;
  adapter: AiProviderAdapter;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: readonly string[];
}>;

export const AI_PROVIDER_CATALOG: readonly AiProviderCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "deepseek",
    name: "DeepSeek",
    description: "官方 API · OpenAI 兼容",
    adapter: "openai-compatible-chat",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    suggestedModels: Object.freeze(["deepseek-v4-flash", "deepseek-v4-pro"]),
  }),
  Object.freeze({
    id: "openai",
    name: "OpenAI",
    description: "Responses API · 支持原生搜索",
    adapter: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-terra",
    suggestedModels: Object.freeze(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]),
  }),
  Object.freeze({
    id: "openrouter",
    name: "OpenRouter",
    description: "统一接入多家模型",
    adapter: "openai-compatible-chat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    suggestedModels: Object.freeze([]),
  }),
  Object.freeze({
    id: "siliconflow",
    name: "SiliconFlow",
    description: "硅基流动 · OpenAI 兼容",
    adapter: "openai-compatible-chat",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "",
    suggestedModels: Object.freeze([]),
  }),
  Object.freeze({
    id: "groq",
    name: "Groq",
    description: "高速推理 · OpenAI 兼容",
    adapter: "openai-compatible-chat",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "",
    suggestedModels: Object.freeze([]),
  }),
  Object.freeze({
    id: "custom",
    name: "自定义服务",
    description: "任何 HTTPS OpenAI 兼容接口",
    adapter: "openai-compatible-chat",
    baseUrl: "",
    defaultModel: "",
    suggestedModels: Object.freeze([]),
  }),
]);

export function providerCatalogEntry(id: string): AiProviderCatalogEntry {
  return AI_PROVIDER_CATALOG.find((item) => item.id === id) ?? AI_PROVIDER_CATALOG.at(-1)!;
}
