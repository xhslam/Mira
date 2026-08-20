import type { AiHttpTransport } from "./http-transport";
import { createOpenAiCompatibleProvider } from "./openai-compatible-provider";
import { createOpenAiResponsesProvider } from "./openai-responses-provider";
import type { AiProvider } from "./provider";
import type { AiProviderAdapter } from "./provider-profile";

export type AiProviderRegistry = Readonly<{
  get(adapter: AiProviderAdapter): AiProvider;
}>;

export function createAiProviderRegistry(transport: AiHttpTransport): AiProviderRegistry {
  const providers: Readonly<Record<AiProviderAdapter, AiProvider>> = Object.freeze({
    "openai-compatible-chat": createOpenAiCompatibleProvider(transport),
    "openai-responses": createOpenAiResponsesProvider(transport),
  });
  return Object.freeze({ get: (adapter) => providers[adapter] });
}
