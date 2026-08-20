import { describe, expect, it } from "vitest";

import { resolveLocale, translate, TRANSLATION_KEYS } from "../../../src/app/i18n";

describe("i18n", () => {
  it("resolves system Chinese and falls back to English", () => {
    expect(resolveLocale("system", "zh-Hans-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "fr-FR")).toBe("en");
    expect(resolveLocale("en", "zh-CN")).toBe("en");
  });

  it("provides complete keyed copies in both shipped locales", () => {
    expect(translate("en", "settings.security")).toBe("Security & privacy");
    expect(translate("zh-CN", "settings.security")).toBe("安全与隐私");
  });

  it("ships a non-empty copy for every key in both locales", () => {
    expect(TRANSLATION_KEYS.length).toBeGreaterThan(0);
    for (const key of TRANSLATION_KEYS) {
      expect(translate("en", key).trim().length, `en/${key}`).toBeGreaterThan(0);
      expect(translate("zh-CN", key).trim().length, `zh-CN/${key}`).toBeGreaterThan(0);
    }
  });

  it("leaves no untranslated English copy in the Chinese locale for shell chrome", () => {
    // Keys whose copy is intentionally identical across locales because the
    // term is a proper noun or an acronym that is not translated in Chinese.
    const sharedTerms: readonly string[] = Object.freeze(["nav.ai"]);
    // These are the surfaces the user reported as mixed-language.
    const shellKeys = TRANSLATION_KEYS.filter(
      (key) =>
        !sharedTerms.includes(key) &&
        (key.startsWith("nav.") ||
          key.startsWith("drawer.") ||
          key.startsWith("save.") ||
          key.startsWith("mode.") ||
          key.startsWith("menu.")),
    );
    for (const key of shellKeys) {
      expect(translate("zh-CN", key), `zh-CN/${key}`).not.toBe(translate("en", key));
    }
  });

  it("interpolates named values and keeps unknown placeholders intact", () => {
    expect(translate("en", "header.switchMode", { mode: "Source" })).toBe("Switch to Source mode");
    expect(translate("zh-CN", "header.switchMode", { mode: "源码" })).toBe("切换到源码模式");
    expect(translate("zh-CN", "mode.reading")).toBe("阅读");
    expect(translate("en", "header.switchMode", {})).toBe("Switch to {mode} mode");
  });
});
