import { createContext, useContext } from "react";

/**
 * Mira 的移动端设计令牌。
 * 界面以信息层级和任务流为先：背景保持安静，颜色只表达状态与操作，
 * 间距使用固定节奏，圆角仅用于真实的交互容器。
 */
export type ThemeMode = "light" | "dark";

export type ThemeColors = Readonly<{
  background: string;
  headerBackground: string;
  canvas: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  mutedText: string;
  divider: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  overlay: string;
  success: string;
  warning: string;
  warningSurface: string;
  warningText: string;
  danger: string;
  error: string;
  fileTypes: Readonly<{
    markdown: string;
    yaml: string;
    json: string;
    toml: string;
    mermaid: string;
    code: string;
    other: string;
  }>;
}>;

export type Theme = Readonly<{
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: Readonly<{
    xSmall: number;
    small: number;
    compact: number;
    standard: number;
    medium: number;
    large: number;
    xLarge: number;
  }>;
  radius: Readonly<{
    small: number;
    medium: number;
    large: number;
    pill: number;
  }>;
  fontSizes: Readonly<{
    caption: number;
    body: number;
    title: number;
  }>;
}>;

const LIGHT_COLORS: ThemeColors = Object.freeze({
  background: "#FFFFFF",
  headerBackground: "#F4F5F7",
  canvas: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F3F5",
  text: "#111827",
  mutedText: "#64748B",
  divider: "rgba(0, 0, 0, 0.08)",
  accent: "#111827",
  accentPressed: "#27272A",
  accentSoft: "#F1F3F5",
  overlay: "rgba(0, 0, 0, 0.45)",
  success: "#16A34A",
  warning: "#D97706",
  warningSurface: "#FEF3C7",
  warningText: "#92400E",
  danger: "#DC2626",
  error: "#DC2626",
  fileTypes: Object.freeze({
    markdown: "#111827",
    yaml: "#4B5563",
    json: "#4B5563",
    toml: "#4B5563",
    mermaid: "#2563EB",
    code: "#4B5563",
    other: "#64748B",
  }),
});

const DARK_COLORS: ThemeColors = Object.freeze({
  background: "#0B0B0F",
  headerBackground: "#16161D",
  canvas: "#101015",
  surface: "#17171D",
  surfaceMuted: "#202027",
  text: "#F2F2F7",
  mutedText: "#98989F",
  divider: "rgba(255, 255, 255, 0.13)",
  accent: "#F2F2F7",
  accentPressed: "#D8D8DE",
  accentSoft: "#202027",
  overlay: "rgba(0, 0, 0, 0.68)",
  success: "#64D2FF",
  warning: "#FF9F0A",
  warningSurface: "#392608",
  warningText: "#FFB340",
  danger: "#FF453A",
  error: "#FF453A",
  fileTypes: Object.freeze({
    markdown: "#F2F2F7",
    yaml: "#C8C8CF",
    json: "#B5B5BD",
    toml: "#D8D8DE",
    mermaid: "#E4E4EA",
    code: "#C0C0C7",
    other: "#98989F",
  }),
});

function buildTheme(mode: ThemeMode): Theme {
  return Object.freeze({
    mode,
    colors: mode === "dark" ? DARK_COLORS : LIGHT_COLORS,
    spacing: Object.freeze({
      xSmall: 4,
      small: 8,
      compact: 12,
      standard: 16,
      medium: 24,
      large: 32,
      xLarge: 40,
    }),
    radius: Object.freeze({ small: 6, medium: 10, large: 16, pill: 999 }),
    fontSizes: Object.freeze({ caption: 12, body: 15, title: 17 }),
  });
}

/** 默认采用高可读性的白底黑字明亮设计，深色模式按需切换。 */
export const LIGHT_THEME = buildTheme("light");
export const DARK_THEME = buildTheme("dark");
export const ThemeContext = createContext<Theme>(LIGHT_THEME);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export const theme: Theme = LIGHT_THEME;
