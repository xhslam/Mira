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
});
