import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENE_IDS } from "../../../src/app/scene-palettes";
import { resolveAppTheme, theme } from "../../../src/app/theme";
import { createSettingsStore, isThemePreference } from "../../../src/app/settings-store";
import type { VaultStorage } from "../../../src/workspace/vault-storage";

function contrast(a: string, b: string) {
  function luminance(hex: string) {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    return rgb.reduce(
      (total, c, i) =>
        total +
        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]!,
      0,
    );
  }
  const pair = [luminance(a), luminance(b)];
  return (Math.max(...pair) + 0.05) / (Math.min(...pair) + 0.05);
}

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("scene appearance", () => {
  it("ships exactly five distinct, readable scene palettes and preserves the default", () => {
    expect(SCENE_IDS).toEqual([
      "claude-code",
      "cloud-drift",
      "honu-lagoon",
      "koi-pond",
      "jellyfish",
    ]);
    expect(resolveAppTheme("light", true)).toBe(theme);
    expect(resolveAppTheme("system", true).mode).toBe("dark");
    expect(new Set(SCENE_IDS.map((id) => resolveAppTheme(id, false).colors.background)).size).toBe(
      5,
    );
    for (const id of SCENE_IDS) {
      const resolved = resolveAppTheme(id, false);
      expect(resolved.scene).toBe(id);
      expect(resolveAppTheme(id, true)).toBe(resolved);
      const {
        background,
        surface,
        canvas,
        text,
        mutedText,
        accent,
        chatBubble,
        chatInk,
        accentFill,
      } = resolved.colors;
      for (const bg of [background, surface, canvas]) {
        for (const ink of [text, mutedText, accent])
          expect(contrast(bg, ink)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(chatBubble, chatInk)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentFill, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("round trips each scene and retains existing settings; unknown themes fall back", async () => {
    let raw = JSON.stringify({ themePreference: "dark", editor: { fontSize: 22 } });
    const storage = {
      read: async () => raw,
      write: async (_path: string, value: string) => {
        raw = value;
      },
      move: async () => {},
      remove: async () => {},
      exists: async () => true,
    } satisfies VaultStorage;
    for (const id of SCENE_IDS) {
      expect(isThemePreference(id)).toBe(true);
      await createSettingsStore(storage).update((current) => ({ ...current, themePreference: id }));
      const reopened = await createSettingsStore(storage).load();
      expect(reopened).toMatchObject({
        ok: true,
        value: { themePreference: id, editor: { fontSize: 22 } },
      });
    }
    raw = JSON.stringify({ themePreference: "__proto__", editor: { fontSize: 22 } });
    expect(await createSettingsStore(storage).load()).toMatchObject({
      ok: true,
      value: { themePreference: "light", editor: { fontSize: 22 } },
    });
  });

  it("serializes settings updates so selecting a scene does not replace another change", async () => {
    let raw: string | null = null;
    const store = createSettingsStore({
      read: async () => raw,
      write: async (_path, value) => {
        raw = value;
      },
      move: async () => {},
      remove: async () => {},
      exists: async () => raw !== null,
    });
    await Promise.all([
      store.update((settings) => ({ ...settings, themePreference: "jellyfish" })),
      store.update((settings) => ({
        ...settings,
        editor: { ...settings.editor, fontSize: 22 },
      })),
    ]);
    expect(await store.load()).toMatchObject({
      ok: true,
      value: { themePreference: "jellyfish", editor: { fontSize: 22 } },
    });
  });

  it("changes editor colors by CSS without treating theme as a structural editor input", () => {
    const source = read("src/editor-kernel/editor-kernel.dom.tsx");
    const rebuild = source.slice(
      source.indexOf("// Structural inputs only."),
      source.indexOf(
        "const base = bridgeBaseRef.current;",
        source.indexOf("// Structural inputs only."),
      ),
    );
    expect(rebuild).not.toMatch(/themeMode|sceneTheme/u);
    expect(source).toContain('backgroundColor: "var(--canvas)"');
    expect(source).toContain("kernelStyles(themeMode, sceneTheme,");
    expect(read("src/app/ai-workspace-screen.tsx")).toContain("<SceneWallpaper");
    expect(read("src/app/settings-screen.tsx")).toContain("<AppearanceSettings");
  });
});
