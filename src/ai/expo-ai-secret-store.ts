import * as SecureStore from "expo-secure-store";

import { createAiSecretStore, type AiSecretStore } from "./ai-secret-store";

export function createExpoAiSecretStore(): AiSecretStore {
  return createAiSecretStore(
    Object.freeze({
      isAvailableAsync: () => SecureStore.isAvailableAsync(),
      getItemAsync: (key) => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) =>
        SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    }),
  );
}
