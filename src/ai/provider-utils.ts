import { AiProviderError } from "./provider";
import type { AiHttpResponse } from "./http-transport";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function retryAfterMs(headers: Readonly<Record<string, string>>): number | null {
  const raw = headers["retry-after"];
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function assertSuccessfulAiResponse(response: AiHttpResponse): void {
  if (response.status >= 200 && response.status < 300) return;
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderError("authentication-failed", "The AI provider rejected the API key");
  }
  if (response.status === 404) {
    throw new AiProviderError("model-unavailable", "The AI endpoint or model was not found");
  }
  if (response.status === 429) {
    throw new AiProviderError(
      "rate-limited",
      "The AI provider rate limit was reached",
      retryAfterMs(response.headers),
    );
  }
  throw new AiProviderError("invalid-response", `The AI provider returned HTTP ${response.status}`);
}

export function parseJsonRecord(source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new AiProviderError("invalid-response", "The AI provider returned invalid JSON");
  }
  if (!isRecord(parsed)) {
    throw new AiProviderError("invalid-response", "The AI provider returned an invalid event");
  }
  return parsed;
}
