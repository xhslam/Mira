import { createContext, useContext } from "react";

/**
 * Shared surfaces and controls for the Mira mobile interface.
 * Ink is reserved for primary actions, with color used for identity and status.
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

const MIRA_COLORS: ThemeColors = Object.freeze({
  background: "#FAFAF9",
  canvas: "#FFFFFF",
  surface: "#F0F0EF",
  surfaceMuted: "#E9E9E8",
  text: "#171717",
  mutedText: "#626262",
  divider: "#DDDDDB",
  accent: "#171717",
  accentPressed: "#3B3B3A",
  accentSoft: "#E7E7E6",
  overlay: "rgba(0, 0, 0, 0.30)",
  success: "#267A54",
  warning: "#9A5A12",
  warningSurface: "#FFF2DB",
  warningText: "#774406",
  danger: "#B5273B",
  error: "#B5273B",
  fileTypes: Object.freeze({
    markdown: "#4A63A0",
    yaml: "#966218",
    json: "#7B4D91",
    toml: "#9B5141",
    mermaid: "#267A68",
    code: "#396B84",
    other: "#626262",
  }),
});

export const identityColors = Object.freeze({
  learn: "#315ECC",
  notes: "#2C826B",
  today: "#3478D3",
  delegations: "#A9541C",
  results: "#2C826B",
});

function buildTheme(): Theme {
  return Object.freeze({
    mode: "light",
    colors: MIRA_COLORS,
    spacing: Object.freeze({
      xSmall: 4,
      small: 8,
      compact: 12,
      standard: 16,
      medium: 24,
      large: 32,
      xLarge: 40,
    }),
    radius: Object.freeze({ small: 8, medium: 16, large: 24, pill: 999 }),
    fontSizes: Object.freeze({ caption: 12, body: 16, title: 18 }),
  });
}

export const theme: Theme = buildTheme();
export const ThemeContext = createContext<Theme>(theme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
