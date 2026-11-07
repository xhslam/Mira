import { describe, expect, it } from "vitest";

import {
  isLearningMainSection,
  resolveLearningSurface,
} from "../../../src/learning/learning-navigation";

describe("learning navigation", () => {
  it("keeps home and the library as valid return destinations", () => {
    expect(isLearningMainSection(resolveLearningSurface("home"))).toBe(true);
    expect(isLearningMainSection(resolveLearningSurface("library"))).toBe(true);
  });

  it("folds the legacy discovery destination into the material library", () => {
    expect(resolveLearningSurface("discover")).toBe("library");
    expect(resolveLearningSurface("library")).toBe("library");
  });

  it("keeps focused and secondary screens distinct from the return destinations", () => {
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
