export type AiSecretStore = Readonly<{
  available(): Promise<boolean>;
  get(profileId: string): Promise<string | null>;
  set(profileId: string, apiKey: string): Promise<void>;
  remove(profileId: string): Promise<void>;
}>;

export type SecureStorageAdapter = Readonly<{
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}>;

const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_API_KEY_LENGTH = 16_384;

function secretKey(profileId: string): string {
  if (!PROFILE_ID.test(profileId)) throw new Error("Invalid AI provider profile identity");
  return `inkstone.ai.provider.${profileId}`;
}

export function createAiSecretStore(adapter: SecureStorageAdapter): AiSecretStore {
  return Object.freeze({
    available: () => adapter.isAvailableAsync(),
    async get(profileId) {
      return adapter.getItemAsync(secretKey(profileId));
    },
    async set(profileId, apiKey) {
      const normalized = apiKey.trim();
      if (!normalized || normalized.length > MAX_API_KEY_LENGTH) {
        throw new Error("Invalid AI provider API key");
      }
      await adapter.setItemAsync(secretKey(profileId), normalized);
    },
    async remove(profileId) {
      await adapter.deleteItemAsync(secretKey(profileId));
    },
  });
}
