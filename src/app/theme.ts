import { createContext, useContext } from "react";

/**
 * Mira 的移动端设计系统令牌与交互规范。
 * 遵循《UI 设计系统与交互规范参考手册 (UI Design System & Heuristics Guide)》：
 * - 离散间距体系与非线性标尺
 * - 注入冷色温灰阶 (Cool Slate) 与高质感 Indigo 品牌色
 * - 双层环境光遮蔽阴影体系 (Dual-Layer Elevation)
 * - 负向强调 (De-emphasis) 与操作金字塔 (Action Pyramid)
 * - 完备的防御性排版与无障碍对比度
 */

export type ThemeMode = "light" | "dark";

export type ShadowToken = Readonly<{
  shadowColor: string;
  shadowOffset: Readonly<{ width: number; height: number }>;
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}>;

export type CoolSlatePalette = Readonly<{
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}>;

export type BrandPalette = Readonly<{
  50: string;
  100: string;
  500: string;
  600: string;
  700: string;
  900: string;
}>;

export type SemanticScale = Readonly<{
  50: string;
  100: string;
  500: string;
  600: string;
  900: string;
}>;

export const COOL_SLATE: CoolSlatePalette = Object.freeze({
  50: "#F8FAFC",
  100: "#F1F5F9",
  200: "#E2E8F0",
  300: "#CBD5E1",
  400: "#94A3B8",
  500: "#64748B",
  600: "#475569",
  700: "#334155",
  800: "#1E293B",
  900: "#0F172A",
});

export const BRAND_INDIGO: BrandPalette = Object.freeze({
  50: "#EEF2FF",
  100: "#E0E7FF",
  500: "#6366F1",
  600: "#4F46E5",
  700: "#4338CA",
  900: "#312E81",
});

export const SEMANTIC_DANGER: SemanticScale = Object.freeze({
  50: "#FEF2F2",
  100: "#FEE2E2",
  500: "#EF4444",
  600: "#DC2626",
  900: "#7F1D1D",
});

export const SEMANTIC_SUCCESS: SemanticScale = Object.freeze({
  50: "#ECFDF5",
  100: "#D1FAE5",
  500: "#10B981",
  600: "#059669",
  900: "#064E3B",
});

export const SEMANTIC_WARNING: SemanticScale = Object.freeze({
  50: "#FFFBEB",
  100: "#FEF3C7",
  500: "#F59E0B",
  600: "#D97706",
  900: "#78350F",
});

export type ThemeColors = Readonly<{
  background: string;
  headerBackground: string;
  canvas: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  mutedText: string;
  divider: string;
  borderSubtle: string;
  borderDefault: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryText: string;
  overlay: string;
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSurface: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  error: string;
  palette: Readonly<{
    gray: CoolSlatePalette;
    primary: BrandPalette;
    danger: SemanticScale;
    success: SemanticScale;
    warning: SemanticScale;
  }>;
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

export type ThemeSpacing = Readonly<{
  xSmall: number;
  small: number;
  compact: number;
  standard: number;
  medium: number;
  large: number;
  xLarge: number;
  xxLarge: number;
  xxxLarge: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  8: number;
  12: number;
  16: number;
  24: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  "2xl": number;
  "3xl": number;
  "4xl": number;
  xxl: number;
  xxxl: number;
  xxxxl: number;
}>;

export type ThemeRadius = Readonly<{
  small: number;
  medium: number;
  large: number;
  pill: number;
  none: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  "2xl": number;
  full: number;
  card: number;
  modal: number;
}>;

export type ThemeFontSizes = Readonly<{
  caption: number;
  body: number;
  title: number;
  xs: number;
  sm: number;
  base: number;
  lg: number;
  xl: number;
  "2xl": number;
  "3xl": number;
  "4xl": number;
}>;

export type ThemeLineHeights = Readonly<{
  xs: number;
  sm: number;
  base: number;
  lg: number;
  xl: number;
  "2xl": number;
  "3xl": number;
  "4xl": number;
}>;

export type ThemeTypography = Readonly<{
  sizes: ThemeFontSizes;
  lineHeights: ThemeLineHeights;
  letterSpacings: Readonly<{
    tight: number;
    normal: number;
    wide: number;
    wider: number;
  }>;
}>;

export type ThemeShadows = Readonly<{
  sm: ShadowToken;
  md: ShadowToken;
  lg: ShadowToken;
  xl: ShadowToken;
}>;

export type ThemeElevation = Readonly<{
  card: ShadowToken;
  dialog: ShadowToken;
  popover: ShadowToken;
  modal: ShadowToken;
}>;

export type Theme = Readonly<{
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  fontSizes: ThemeFontSizes;
  typography: ThemeTypography;
  shadows: ThemeShadows;
  elevation: ThemeElevation;
}>;

const LIGHT_COLORS: ThemeColors = Object.freeze({
  background: "#FFFFFF",
  headerBackground: "#F4F5F7",
  canvas: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceMuted: COOL_SLATE[100],
  text: "#111827", // 注入冷灰深色 (#111827 遵循规范 2.3.A)
  mutedText: COOL_SLATE[500], // #64748B - 高质感次级说明色
  divider: COOL_SLATE[200], // #E2E8F0 - 柔和细分界
  borderSubtle: COOL_SLATE[200],
  borderDefault: COOL_SLATE[300],
  accent: "#111827",
  accentPressed: COOL_SLATE[800],
  accentSoft: COOL_SLATE[100],
  primary: BRAND_INDIGO[600], // #4F46E5 基准主操作色
  primaryHover: BRAND_INDIGO[700],
  primarySoft: BRAND_INDIGO[50], // #EEF2FF
  primaryText: BRAND_INDIGO[900], // #312E81
  overlay: "rgba(15, 23, 42, 0.48)",
  success: SEMANTIC_SUCCESS[500], // #10B981
  successSoft: SEMANTIC_SUCCESS[50],
  successText: SEMANTIC_SUCCESS[900],
  warning: SEMANTIC_WARNING[600], // #D97706
  warningSurface: SEMANTIC_WARNING[100], // #FEF3C7
  warningText: SEMANTIC_WARNING[900], // #78350F
  danger: SEMANTIC_DANGER[600], // #DC2626
  dangerSoft: SEMANTIC_DANGER[50],
  dangerText: SEMANTIC_DANGER[900],
  error: SEMANTIC_DANGER[600],
  palette: Object.freeze({
    gray: COOL_SLATE,
    primary: BRAND_INDIGO,
    danger: SEMANTIC_DANGER,
    success: SEMANTIC_SUCCESS,
    warning: SEMANTIC_WARNING,
  }),
  fileTypes: Object.freeze({
    markdown: COOL_SLATE[900],
    yaml: COOL_SLATE[600],
    json: COOL_SLATE[600],
    toml: COOL_SLATE[600],
    mermaid: BRAND_INDIGO[500],
    code: COOL_SLATE[600],
    other: COOL_SLATE[500],
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
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderDefault: "rgba(255, 255, 255, 0.18)",
  accent: "#F2F2F7",
  accentPressed: "#D8D8DE",
  accentSoft: "#202027",
  primary: BRAND_INDIGO[500],
  primaryHover: BRAND_INDIGO[600],
  primarySoft: "rgba(99, 102, 241, 0.18)",
  primaryText: "#E0E7FF",
  overlay: "rgba(0, 0, 0, 0.68)",
  success: "#64D2FF",
  successSoft: "rgba(16, 185, 129, 0.18)",
  successText: "#6EE7B7",
  warning: "#FF9F0A",
  warningSurface: "#392608",
  warningText: "#FFB340",
  danger: "#FF453A",
  dangerSoft: "rgba(239, 68, 68, 0.18)",
  dangerText: "#FCA5A5",
  error: "#FF453A",
  palette: Object.freeze({
    gray: COOL_SLATE,
    primary: BRAND_INDIGO,
    danger: SEMANTIC_DANGER,
    success: SEMANTIC_SUCCESS,
    warning: SEMANTIC_WARNING,
  }),
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

const LIGHT_SHADOWS: ThemeShadows = Object.freeze({
  sm: Object.freeze({
    shadowColor: COOL_SLATE[900],
    shadowOffset: Object.freeze({ width: 0, height: 1 }),
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  }),
  md: Object.freeze({
    shadowColor: COOL_SLATE[900],
    shadowOffset: Object.freeze({ width: 0, height: 4 }),
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  }),
  lg: Object.freeze({
    shadowColor: COOL_SLATE[900],
    shadowOffset: Object.freeze({ width: 0, height: 10 }),
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 6,
  }),
  xl: Object.freeze({
    shadowColor: COOL_SLATE[900],
    shadowOffset: Object.freeze({ width: 0, height: 20 }),
    shadowOpacity: 0.1,
    shadowRadius: 25,
    elevation: 10,
  }),
});

const DARK_SHADOWS: ThemeShadows = Object.freeze({
  sm: Object.freeze({
    shadowColor: "#000000",
    shadowOffset: Object.freeze({ width: 0, height: 1 }),
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  }),
  md: Object.freeze({
    shadowColor: "#000000",
    shadowOffset: Object.freeze({ width: 0, height: 4 }),
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  }),
  lg: Object.freeze({
    shadowColor: "#000000",
    shadowOffset: Object.freeze({ width: 0, height: 10 }),
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 6,
  }),
  xl: Object.freeze({
    shadowColor: "#000000",
    shadowOffset: Object.freeze({ width: 0, height: 20 }),
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 10,
  }),
});

const TYPOGRAPHY: ThemeTypography = Object.freeze({
  sizes: Object.freeze({
    caption: 12,
    body: 15,
    title: 17,
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
  }),
  lineHeights: Object.freeze({
    xs: 18,
    sm: 21,
    base: 24,
    lg: 27,
    xl: 28,
    "2xl": 31,
    "3xl": 36,
    "4xl": 41,
  }),
  letterSpacings: Object.freeze({
    tight: -0.5,
    normal: 0,
    wide: 0.4,
    wider: 1.0,
  }),
});

function buildTheme(mode: ThemeMode): Theme {
  const isDark = mode === "dark";
  const shadows = isDark ? DARK_SHADOWS : LIGHT_SHADOWS;
  return Object.freeze({
    mode,
    colors: isDark ? DARK_COLORS : LIGHT_COLORS,
    spacing: Object.freeze({
      xSmall: 4,
      small: 8,
      compact: 12,
      standard: 16,
      medium: 24,
      large: 32,
      xLarge: 48,
      xxLarge: 64,
      xxxLarge: 96,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      12: 48,
      16: 64,
      24: 96,
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      "2xl": 48,
      "3xl": 64,
      "4xl": 96,
      xxl: 48,
      xxxl: 64,
      xxxxl: 96,
    }),
    radius: Object.freeze({
      small: 6, // rounded-md
      medium: 10, // rounded-lg / rounded-xl
      large: 16, // rounded-2xl
      pill: 9999, // rounded-full
      none: 0,
      xs: 2,
      sm: 4,
      md: 8,
      lg: 12,
      xl: 16,
      "2xl": 24,
      full: 9999,
      card: 12,
      modal: 16,
    }),
    fontSizes: TYPOGRAPHY.sizes,
    typography: TYPOGRAPHY,
    shadows,
    elevation: Object.freeze({
      card: shadows.sm,
      dialog: shadows.md,
      popover: shadows.lg,
      modal: shadows.xl,
    }),
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
