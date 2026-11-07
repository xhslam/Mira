import type { LearningSection } from "./learning-types";

export type LearningMainSection = "home" | "library";
export type LearningSurface =
  | LearningMainSection
  | "craft"
  | "url-import"
  | "practice"
  | "phrase-memory"
  | "settings"
  | "english-coach";

/**
 * Keeps the visible learning information architecture intentionally small while
 * preserving compatibility with sections stored by previous releases.
 */
export function resolveLearningSurface(section: LearningSection): LearningSurface {
  if (section === "discover" || section === "library") return "library";
  if (section === "english-coach") return "english-coach";
  if (section === "practice") return "practice";
  if (section === "settings") return "settings";
  if (section === "phrase-memory" || section === "vocabulary") return "phrase-memory";
  if (section === "craft") return "craft";
  if (section === "url-import") return "url-import";
  return "home";
}

export function isLearningMainSection(surface: LearningSurface): surface is LearningMainSection {
  return surface === "home" || surface === "library";
}
