import { z } from "zod";

import { failure, type Result, success } from "../domain/result";

export const AI_PROVIDER_ADAPTERS = ["openai-compatible-chat", "openai-responses"] as const;
export type AiProviderAdapter = (typeof AI_PROVIDER_ADAPTERS)[number];

export const AI_CONNECTION_STATUSES = [
  "untested",
  "connected",
  "authentication-failed",
  "model-unavailable",
  "rate-limited",
  "network-failed",
  "invalid-response",
] as const;
export type AiConnectionStatus = (typeof AI_CONNECTION_STATUSES)[number];

export type AiProviderProfileId = string & { readonly __brand: "AiProviderProfileId" };

export type AiProviderProfile = Readonly<{
  id: AiProviderProfileId;
  name: string;
  adapter: AiProviderAdapter;
  baseUrl: string;
  model: string;
  connectionStatus: AiConnectionStatus;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AiProviderCapabilities = Readonly<{
  functionTools: boolean;
  nativeWebSearch: boolean;
  streaming: boolean;
}>;

const profileSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    adapter: z.enum(AI_PROVIDER_ADAPTERS),
    baseUrl: z.string().trim().min(1).max(2_048),
    model: z.string().trim().min(1).max(200),
    connectionStatus: z.enum(AI_CONNECTION_STATUSES),
    lastTestedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AiProviderProfileError = Readonly<{
  code: "INVALID_PROFILE" | "INSECURE_BASE_URL";
}>;

/** Normalize well-known human-facing model names without changing custom IDs. */
export function normalizeAiModelId(baseUrl: string, value: string): string {
  const model = value.trim();
  let host = "";
  try {
    host = new URL(baseUrl.trim()).hostname.toLocaleLowerCase();
  } catch {
    return model;
  }
  if (host === "api.deepseek.com" || host.endsWith(".deepseek.com")) {
    const alias = model.toLocaleLowerCase().replace(/[\s_]+/gu, "-");
    if (alias === "deepseek-v4-flash") return "deepseek-v4-flash";
    if (alias === "deepseek-v4-pro") return "deepseek-v4-pro";
  }
  return model;
}

function normalizeBaseUrl(value: string): Result<string, AiProviderProfileError> {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return failure(Object.freeze({ code: "INSECURE_BASE_URL" }));
    }
    return success(url.toString().replace(/\/$/, ""));
  } catch {
    return failure(Object.freeze({ code: "INVALID_PROFILE" }));
  }
}

export function parseAiProviderProfile(
  input: unknown,
): Result<AiProviderProfile, AiProviderProfileError> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return failure(Object.freeze({ code: "INVALID_PROFILE" }));
  const normalizedBaseUrl = normalizeBaseUrl(parsed.data.baseUrl);
  if (!normalizedBaseUrl.ok) return normalizedBaseUrl;
  return success(
    Object.freeze({
      ...parsed.data,
      id: parsed.data.id as AiProviderProfileId,
      name: parsed.data.name.trim(),
      baseUrl: normalizedBaseUrl.value,
      model: normalizeAiModelId(normalizedBaseUrl.value, parsed.data.model),
    }),
  );
}

export function aiProviderCapabilities(adapter: AiProviderAdapter): AiProviderCapabilities {
  return Object.freeze({
    functionTools: true,
    nativeWebSearch: adapter === "openai-responses",
    streaming: true,
  });
}
