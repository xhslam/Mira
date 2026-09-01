import { describe, expect, it } from "vitest";

import {
  isLearningMainSection,
  LEARNING_MAIN_TABS,
  resolveLearningSurface,
} from "../../../src/learning/learning-navigation";

describe("learning navigation", () => {
  it("exposes only the two frequent learning destinations", () => {
    expect(LEARNING_MAIN_TABS).toEqual([
      { id: "home", label: "今天" },
      { id: "library", label: "资料" },
    ]);
    expect(Object.isFrozen(LEARNING_MAIN_TABS)).toBe(true);
    expect(LEARNING_MAIN_TABS.every(Object.isFrozen)).toBe(true);
  });

  it("folds the legacy discovery destination into the material library", () => {
    expect(resolveLearningSurface("discover")).toBe("library");
    expect(resolveLearningSurface("library")).toBe("library");
  });

  it("keeps focused and secondary screens out of the main tab rail", () => {
    expect(resolveLearningSurface("practice")).toBe("practice");
    expect(resolveLearningSurface("vocabulary")).toBe("phrase-memory");
    expect(resolveLearningSurface("phrase-memory")).toBe("phrase-memory");
    expect(resolveLearningSurface("settings")).toBe("settings");
    expect(resolveLearningSurface("url-import")).toBe("url-import");
    expect(isLearningMainSection(resolveLearningSurface("home"))).toBe(true);
    expect(isLearningMainSection(resolveLearningSurface("url-import"))).toBe(false);
    expect(isLearningMainSection(resolveLearningSurface("practice"))).toBe(false);
  });
});
