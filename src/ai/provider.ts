import type { AiProviderProfile } from "./provider-profile";

export type AiProviderRole = "system" | "user" | "assistant" | "tool";

export type AiProviderMessage = Readonly<{
  role: AiProviderRole;
  content: string;
  toolCallId?: string;
  toolCalls?: readonly Readonly<{
    id: string;
    name: string;
    argumentsJson: string;
  }>[];
}>;

export type AiToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters: Readonly<Record<string, unknown>>;
}>;

export type AiProviderRequest = Readonly<{
  messages: readonly AiProviderMessage[];
  tools?: readonly AiToolDefinition[];
  nativeWebSearch?: boolean;
}>;

export type AiProviderEvent =
  | Readonly<{ type: "text-delta"; text: string }>
  | Readonly<{ type: "tool-call"; id: string; name: string; argumentsJson: string }>
  | Readonly<{ type: "citation"; url: string; title: string | null }>
  | Readonly<{ type: "usage"; inputTokens: number | null; outputTokens: number | null }>
  | Readonly<{ type: "completed" }>;

export type AiProviderErrorCode =
  | "authentication-failed"
  | "model-unavailable"
  | "rate-limited"
  | "network-failed"
  | "timeout"
  | "cancelled"
  | "invalid-response";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly retryAfterMs: number | null;

  constructor(code: AiProviderErrorCode, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export type AiProvider = Readonly<{
  stream(
    options: Readonly<{
      profile: AiProviderProfile;
      apiKey: string;
      request: AiProviderRequest;
      signal?: AbortSignal;
    }>,
  ): AsyncIterable<AiProviderEvent>;
}>;
