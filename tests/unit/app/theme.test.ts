import { describe, expect, it } from "vitest";

import { DARK_THEME, LIGHT_THEME, theme } from "../../../src/app/theme";

describe("app theme", () => {
  it("defaults to light theme with crisp white background and black text", () => {
    expect(theme.mode).toBe("light");
    expect(theme.colors.background).toBe("#FFFFFF");
    expect(theme.colors.headerBackground).toBe("#F4F5F7");
    expect(theme.colors.canvas).toBe("#F8F9FA");
    expect(theme.colors.surface).toBe("#FFFFFF");
    expect(theme.colors.text).toBe("#111827");
    expect(theme.colors.accent).toBe("#111827");
  });

  it("provides light and dark theme configurations with proper contrast", () => {
    expect(LIGHT_THEME.mode).toBe("light");
    expect(LIGHT_THEME.colors.background).toBe("#FFFFFF");
    expect(LIGHT_THEME.colors.headerBackground).toBe("#F4F5F7");
    expect(LIGHT_THEME.colors.text).toBe("#111827");
    expect(LIGHT_THEME.colors.accent).toBe("#111827");

    expect(DARK_THEME.mode).toBe("dark");
    expect(DARK_THEME.colors.background).toBe("#0B0B0F");
    expect(DARK_THEME.colors.headerBackground).toBe("#16161D");
    expect(DARK_THEME.colors.text).toBe("#F2F2F7");
  });

  it("ensures theme objects and colors are deeply frozen", () => {
    expect(Object.isFrozen(LIGHT_THEME)).toBe(true);
    expect(Object.isFrozen(LIGHT_THEME.colors)).toBe(true);
    expect(Object.isFrozen(LIGHT_THEME.spacing)).toBe(true);
    expect(Object.isFrozen(DARK_THEME)).toBe(true);
    expect(Object.isFrozen(DARK_THEME.colors)).toBe(true);
  });

  it("conforms to UI Design System Guide discrete tokens and elevation scale", () => {
    // 2.1 Discrete Spacing scale
    expect(theme.spacing[1]).toBe(4);
    expect(theme.spacing[2]).toBe(8);
    expect(theme.spacing[3]).toBe(12);
    expect(theme.spacing[4]).toBe(16);
    expect(theme.spacing[6]).toBe(24);
    expect(theme.spacing[8]).toBe(32);
    expect(theme.spacing[12]).toBe(48);
    expect(theme.spacing[16]).toBe(64);
    expect(theme.spacing[24]).toBe(96);

    // 2.3 Color Architecture - Cool Slate & Brand Indigo
    expect(theme.colors.palette.gray[50]).toBe("#F8FAFC");
    expect(theme.colors.palette.gray[900]).toBe("#0F172A");
    expect(theme.colors.palette.primary[500]).toBe("#6366F1");
    expect(theme.colors.palette.primary[600]).toBe("#4F46E5");

    // 2.4 Dual-layer elevation shadows
    expect(theme.shadows.sm.elevation).toBe(1);
    expect(theme.shadows.md.elevation).toBe(3);
    expect(theme.shadows.lg.elevation).toBe(6);
    expect(theme.shadows.xl.elevation).toBe(10);

    // 2.2 Typography scale
    expect(theme.typography.sizes.xs).toBe(12);
    expect(theme.typography.sizes.base).toBe(16);
    expect(theme.typography.sizes["2xl"]).toBe(24);
    expect(theme.typography.lineHeights.base).toBe(24);
  });
});
