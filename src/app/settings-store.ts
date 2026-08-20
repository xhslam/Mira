import { failure, type Result, success } from "../domain/result";
import type { VaultStorage } from "../workspace/vault-storage";
import type { LocalePreference } from "./i18n";

export type ThemePreference = "system" | "light" | "dark";

export type AppSettings = Readonly<{
  themePreference: ThemePreference;
  localePreference: LocalePreference;
  editor: Readonly<{
    fontSize: number;
    lineHeight: number;
    lineNumbers: boolean;
    wordWrap: boolean;
    autoSaveDelayMs: number;
  }>;
  security: Readonly<{
    allowClipboardRead: boolean;
  }>;
  interaction: Readonly<{
    clickVibration: boolean;
    soundEnabled: boolean;
    soundVolume: number;
  }>;
  ai: Readonly<{
    allowWholeWorkspaceSearch: boolean;
    activeProviderProfileId: string | null;
  }>;
}>;

export const DEFAULT_SETTINGS: AppSettings = Object.freeze({
  themePreference: "system",
  localePreference: "system",
  editor: Object.freeze({
    fontSize: 16,
    lineHeight: 1.65,
    lineNumbers: true,
    wordWrap: true,
    autoSaveDelayMs: 2_000,
  }),
  security: Object.freeze({
    allowClipboardRead: true,
  }),
  interaction: Object.freeze({
    clickVibration: true,
    soundEnabled: false,
    soundVolume: 0.35,
  }),
  ai: Object.freeze({
    allowWholeWorkspaceSearch: false,
    activeProviderProfileId: null,
  }),
});

const SETTINGS_PATH = "app-settings.json";

export type SettingsStore = Readonly<{
  load(): Promise<Result<AppSettings, Error>>;
  save(settings: AppSettings): Promise<Result<AppSettings, Error>>;
  update(mutator: (current: AppSettings) => AppSettings): Promise<Result<AppSettings, Error>>;
}>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function sanitizeSettings(input: unknown): AppSettings {
  if (typeof input !== "object" || input === null) return DEFAULT_SETTINGS;
  const record = input as Record<string, unknown>;
  const themePreference = isThemePreference(record.themePreference)
    ? record.themePreference
    : DEFAULT_SETTINGS.themePreference;
  const localePreference: LocalePreference =
    record.localePreference === "en" ||
    record.localePreference === "zh-CN" ||
    record.localePreference === "system"
      ? record.localePreference
      : DEFAULT_SETTINGS.localePreference;

  const editorRecord =
    typeof record.editor === "object" && record.editor !== null
      ? (record.editor as Record<string, unknown>)
      : {};
  const interactionRecord =
    typeof record.interaction === "object" && record.interaction !== null
      ? (record.interaction as Record<string, unknown>)
      : {};
  const fontSize =
    typeof editorRecord.fontSize === "number" &&
    editorRecord.fontSize >= 12 &&
    editorRecord.fontSize <= 24
      ? editorRecord.fontSize
      : DEFAULT_SETTINGS.editor.fontSize;
  const lineHeight =
    typeof editorRecord.lineHeight === "number" &&
    editorRecord.lineHeight >= 1.2 &&
    editorRecord.lineHeight <= 2.2
      ? editorRecord.lineHeight
      : DEFAULT_SETTINGS.editor.lineHeight;

  return Object.freeze({
    themePreference,
    localePreference,
    editor: Object.freeze({
      fontSize,
      lineHeight,
      lineNumbers:
        typeof editorRecord.lineNumbers === "boolean"
          ? editorRecord.lineNumbers
          : DEFAULT_SETTINGS.editor.lineNumbers,
      wordWrap:
        typeof editorRecord.wordWrap === "boolean"
          ? editorRecord.wordWrap
          : DEFAULT_SETTINGS.editor.wordWrap,
      autoSaveDelayMs:
        typeof editorRecord.autoSaveDelayMs === "number" &&
        editorRecord.autoSaveDelayMs >= 500 &&
        editorRecord.autoSaveDelayMs <= 30_000
          ? editorRecord.autoSaveDelayMs
          : DEFAULT_SETTINGS.editor.autoSaveDelayMs,
    }),
    security: Object.freeze({
      allowClipboardRead:
        typeof record.security === "object" &&
        record.security !== null &&
        typeof (record.security as Record<string, unknown>).allowClipboardRead === "boolean"
          ? ((record.security as Record<string, unknown>).allowClipboardRead as boolean)
          : DEFAULT_SETTINGS.security.allowClipboardRead,
    }),
    interaction: Object.freeze({
      clickVibration:
        typeof interactionRecord.clickVibration === "boolean"
          ? interactionRecord.clickVibration
          : DEFAULT_SETTINGS.interaction.clickVibration,
      soundEnabled:
        typeof interactionRecord.soundEnabled === "boolean"
          ? interactionRecord.soundEnabled
          : DEFAULT_SETTINGS.interaction.soundEnabled,
      soundVolume:
        typeof interactionRecord.soundVolume === "number" &&
        interactionRecord.soundVolume >= 0 &&
        interactionRecord.soundVolume <= 1
          ? interactionRecord.soundVolume
          : DEFAULT_SETTINGS.interaction.soundVolume,
    }),
    ai: Object.freeze({
      allowWholeWorkspaceSearch:
        typeof record.ai === "object" &&
        record.ai !== null &&
        typeof (record.ai as Record<string, unknown>).allowWholeWorkspaceSearch === "boolean"
          ? ((record.ai as Record<string, unknown>).allowWholeWorkspaceSearch as boolean)
          : DEFAULT_SETTINGS.ai.allowWholeWorkspaceSearch,
      activeProviderProfileId:
        typeof record.ai === "object" &&
        record.ai !== null &&
        (typeof (record.ai as Record<string, unknown>).activeProviderProfileId === "string" ||
          (record.ai as Record<string, unknown>).activeProviderProfileId === null)
          ? ((record.ai as Record<string, unknown>).activeProviderProfileId as string | null)
          : DEFAULT_SETTINGS.ai.activeProviderProfileId,
    }),
  });
}

export function createSettingsStore(storage: VaultStorage): SettingsStore {
  return Object.freeze({
    async load() {
      try {
        const raw = await storage.read(SETTINGS_PATH);
        if (raw === null) return success(DEFAULT_SETTINGS);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw) as unknown;
        } catch {
          return success(DEFAULT_SETTINGS);
        }
        return success(sanitizeSettings(parsed));
      } catch (error) {
        return failure(error instanceof Error ? error : new Error("Settings could not be loaded"));
      }
    },
    async save(settings) {
      try {
        const serialized = JSON.stringify(settings);
        await storage.write(SETTINGS_PATH, serialized);
        return success(settings);
      } catch (error) {
        return failure(error instanceof Error ? error : new Error("Settings could not be saved"));
      }
    },
    async update(mutator) {
      const loaded = await this.load();
      const next = mutator(loaded.ok ? loaded.value : DEFAULT_SETTINGS);
      return this.save(next);
    },
  });
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemDark: boolean,
): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemDark ? "dark" : "light";
}
