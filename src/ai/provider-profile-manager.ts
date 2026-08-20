import type { AiSecretStore } from "./ai-secret-store";
import type { AiStore } from "./ai-store";
import {
  normalizeAiModelId,
  parseAiProviderProfile,
  type AiProviderProfile,
  type AiProviderProfileId,
} from "./provider-profile";

export type AiProviderProfileSummary = Readonly<{
  profile: AiProviderProfile;
  hasApiKey: boolean;
}>;

export type SaveAiProviderProfileInput = Readonly<{
  id?: string;
  name: string;
  adapter: AiProviderProfile["adapter"];
  baseUrl: string;
  model: string;
  apiKey?: string;
}>;

export type AiProviderProfileManager = Readonly<{
  list(): Promise<readonly AiProviderProfileSummary[]>;
  save(input: SaveAiProviderProfileInput): Promise<AiProviderProfileSummary>;
  remove(id: AiProviderProfileId): Promise<void>;
  markConnection(
    id: AiProviderProfileId,
    status: AiProviderProfile["connectionStatus"],
  ): Promise<AiProviderProfile>;
}>;

export function createAiProviderProfileManager(
  options: Readonly<{
    store: AiStore;
    secrets: AiSecretStore;
    createId: () => string;
    now: () => Date;
  }>,
): AiProviderProfileManager {
  async function summary(profile: AiProviderProfile): Promise<AiProviderProfileSummary> {
    return Object.freeze({ profile, hasApiKey: (await options.secrets.get(profile.id)) !== null });
  }

  return Object.freeze({
    async list() {
      const stored = await options.store.listProviderProfiles();
      const profiles = await Promise.all(
        stored.map(async (profile) => {
          const model = normalizeAiModelId(profile.baseUrl, profile.model);
          if (model === profile.model) return profile;
          const migrated = Object.freeze({
            ...profile,
            model,
            connectionStatus: "untested" as const,
          });
          await options.store.upsertProviderProfile(migrated);
          return migrated;
        }),
      );
      return Object.freeze(await Promise.all(profiles.map(summary)));
    },
    async save(input) {
      const existing = input.id
        ? await options.store.getProviderProfile(input.id as AiProviderProfileId)
        : null;
      const now = options.now().toISOString();
      const parsed = parseAiProviderProfile({
        id: input.id ?? options.createId(),
        name: input.name,
        adapter: input.adapter,
        baseUrl: input.baseUrl,
        model: input.model,
        connectionStatus: existing?.connectionStatus ?? "untested",
        lastTestedAt: existing?.lastTestedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      if (!parsed.ok) throw new Error(parsed.error.code);
      await options.store.upsertProviderProfile(parsed.value);
      if (input.apiKey !== undefined) await options.secrets.set(parsed.value.id, input.apiKey);
      return summary(parsed.value);
    },
    async remove(id) {
      await options.secrets.remove(id);
      await options.store.removeProviderProfile(id);
    },
    async markConnection(id, status) {
      const current = await options.store.getProviderProfile(id);
      if (current === null) throw new Error("AI provider profile not found");
      const updatedAt = options.now().toISOString();
      const next = Object.freeze({
        ...current,
        connectionStatus: status,
        lastTestedAt: updatedAt,
        updatedAt,
      });
      await options.store.upsertProviderProfile(next);
      return next;
    },
  });
}
