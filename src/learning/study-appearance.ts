import type { Theme } from "../app/theme";

export function studyAccent(theme: Theme): string {
  return theme.mode === "dark" ? "#FFAA79" : "#A94317";
}

export function studyHighlight(theme: Theme): string {
  return theme.mode === "dark" ? "#38291F" : "#FAEDE2";
}
