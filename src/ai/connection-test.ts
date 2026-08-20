import type { AiSecretStore } from "./ai-secret-store";
import type { AiStore } from "./ai-store";
import { AiProviderError, type AiProviderErrorCode } from "./provider";
import type { AiProviderProfileManager } from "./provider-profile-manager";
import type { AiConnectionStatus, AiProviderProfileId } from "./provider-profile";
import type { AiProviderRegistry } from "./provider-registry";

export type AiConnectionTestResult = Readonly<{
  ok: boolean;
  status: AiConnectionStatus;
}>;

function connectionStatus(code: AiProviderErrorCode): AiConnectionStatus {
  switch (code) {
    case "authentication-failed":
      return "authentication-failed";
    case "model-unavailable":
      return "model-unavailable";
    case "rate-limited":
      return "rate-limited";
    case "network-failed":
    case "timeout":
    case "cancelled":
      return "network-failed";
    case "invalid-response":
      return "invalid-response";
  }
}

export function createAiConnectionTester(
  options: Readonly<{
    store: AiStore;
    secrets: AiSecretStore;
    profiles: AiProviderProfileManager;
    providers: AiProviderRegistry;
  }>,
): Readonly<{
  test(id: AiProviderProfileId, signal?: AbortSignal): Promise<AiConnectionTestResult>;
}> {
  return Object.freeze({
    async test(id, signal) {
      const profile = await options.store.getProviderProfile(id);
      if (profile === null) throw new Error("AI provider profile not found");
      const apiKey = await options.secrets.get(id);
      if (apiKey === null) {
        await options.profiles.markConnection(id, "authentication-failed");
        return Object.freeze({ ok: false, status: "authentication-failed" });
      }
      try {
        let completed = false;
        for await (const event of options.providers.get(profile.adapter).stream({
          profile,
          apiKey,
          request: Object.freeze({
            messages: Object.freeze([
              Object.freeze({ role: "user" as const, content: "Reply with OK." }),
            ]),
          }),
          ...(signal ? { signal } : {}),
        })) {
          if (event.type === "completed") completed = true;
        }
        if (!completed) throw new AiProviderError("invalid-response", "Connection test incomplete");
        await options.profiles.markConnection(id, "connected");
        return Object.freeze({ ok: true, status: "connected" });
      } catch (error) {
        const status =
          error instanceof AiProviderError ? connectionStatus(error.code) : "network-failed";
        await options.profiles.markConnection(id, status);
        return Object.freeze({ ok: false, status });
      }
    },
  });
}
