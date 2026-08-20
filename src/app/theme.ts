import { createContext, useContext } from "react";

/**
 * Mira 的移动端设计令牌。
 * 界面以信息层级和任务流为先：背景保持安静，颜色只表达状态与操作，
 * 间距使用固定节奏，圆角仅用于真实的交互容器。
 */
export type ThemeMode = "light" | "dark";

export type ThemeColors = Readonly<{
  background: string;
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

const APPLE_COLORS: ThemeColors = Object.freeze({
  background: "#0B0B0F",
  canvas: "#101015",
  surface: "#17171D",
  surfaceMuted: "#202027",
  text: "#F2F2F7",
  mutedText: "#98989F",
  divider: "rgba(255, 255, 255, 0.13)",
  accent: "#0A84FF",
  accentPressed: "#0071D8",
  accentSoft: "#132B49",
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
    colors: APPLE_COLORS,
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

/** 视觉使用同一套深色阅读环境，模式字段仅保留作兼容层。 */
export const LIGHT_THEME = buildTheme("light");
export const DARK_THEME = buildTheme("dark");
export const ThemeContext = createContext<Theme>(DARK_THEME);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export const theme: Theme = DARK_THEME;
