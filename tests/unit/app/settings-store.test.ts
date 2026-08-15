import { describe, expect, it } from "vitest";

import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  isThemePreference,
  resolveThemeMode,
} from "../../../src/app/settings-store";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

function memoryStorage(initial: Readonly<Record<string, string>> = {}): VaultStorage {
  const data = new Map(Object.entries(initial));
  return Object.freeze({
    async read(path: string) {
      return data.has(path) ? (data.get(path) ?? null) : null;
    },
    async write(path: string, contents: string) {
      data.set(path, contents);
    },
    async move(from: string, to: string) {
      const value = data.get(from);
      if (value !== undefined) {
        data.set(to, value);
        data.delete(from);
      }
    },
    async remove(path: string) {
      data.delete(path);
    },
    async exists(path: string) {
      return data.has(path);
    },
  });
}

describe("settings store", () => {
  it("returns defaults when no settings exist", async () => {
    const store = createSettingsStore(memoryStorage());
    const result = await store.load();
    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("round-trips saved settings", async () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    const next = { ...DEFAULT_SETTINGS, themePreference: "dark" } as typeof DEFAULT_SETTINGS;
    const saved = await store.save(next);
    expect(saved.ok).toBe(true);

    const loaded = await store.load();
    expect(loaded).toEqual({ ok: true, value: next });
  });

  it("defaults click vibration on and preserves an explicit opt-out", async () => {
    const storage = memoryStorage({
      "app-settings.json": JSON.stringify({ interaction: { clickVibration: false } }),
    });
    const store = createSettingsStore(storage);
    const result = await store.load();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.interaction.clickVibration).toBe(false);
    expect(DEFAULT_SETTINGS.interaction.clickVibration).toBe(true);
  });

  it("keeps interface sounds off by default and preserves valid sound preferences", async () => {
    const storage = memoryStorage({
      "app-settings.json": JSON.stringify({
        interaction: { soundEnabled: true, soundVolume: 0.6 },
      }),
    });
    const store = createSettingsStore(storage);
    const result = await store.load();

    expect(DEFAULT_SETTINGS.interaction.soundEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.interaction.soundVolume).toBe(0.35);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.interaction.soundEnabled).toBe(true);
      expect(result.value.interaction.soundVolume).toBe(0.6);
    }
  });

  it("rejects invalid interface sound volume", async () => {
    const storage = memoryStorage({
      "app-settings.json": JSON.stringify({
        interaction: { soundEnabled: true, soundVolume: 4 },
      }),
    });
    const store = createSettingsStore(storage);
    const result = await store.load();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.interaction.soundEnabled).toBe(true);
      expect(result.value.interaction.soundVolume).toBe(DEFAULT_SETTINGS.interaction.soundVolume);
    }
  });

  it("sanitizes corrupted settings back to defaults", async () => {
    const store = createSettingsStore(memoryStorage({ "app-settings.json": "{broken" }));
    const result = await store.load();
    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("sanitizes out-of-range editor values", async () => {
    const storage = memoryStorage({
      "app-settings.json": JSON.stringify({
        themePreference: "dark",
        editor: { fontSize: 999, lineHeight: 0.5 },
      }),
    });
    const store = createSettingsStore(storage);
    const result = await store.load();
    if (!result.ok) throw new Error("load failed");
    expect(result.value.themePreference).toBe("dark");
    expect(result.value.editor.fontSize).toBe(DEFAULT_SETTINGS.editor.fontSize);
    expect(result.value.editor.lineHeight).toBe(DEFAULT_SETTINGS.editor.lineHeight);
  });

  it("updates through a mutator", async () => {
    const store = createSettingsStore(memoryStorage());
    const updated = await store.update((current) => ({
      ...current,
      themePreference: "light",
    }));
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("update failed");
    expect(updated.value.themePreference).toBe("light");
  });
});

describe("theme preference", () => {
  it("recognizes valid preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it("resolves the effective mode from preference and system state", () => {
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });
});
