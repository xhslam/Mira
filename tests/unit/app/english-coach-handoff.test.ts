import { describe, expect, test } from "vitest";
import {
  completeWorkspaceCheck,
  createAppShellState,
  selectPrimaryTab,
} from "../../../src/app/app-shell-state";
import { createEnglishPracticeNavigationSnapshot } from "../../../src/learning/english-coach-storage";
import { createInitialLearningSnapshot } from "../../../src/learning/learning-types";

const NOW = "2026-08-15T08:00:00.000Z";

describe("English coach practice handoff", () => {
  test("hands the first saved sentence to Learning and switches the app shell to Learning", () => {
    const resource = Object.freeze({
      id: "lesson-resource-1",
      title: "Coffee lesson",
      description: "One sentence",
      language: "English",
      source: "generated" as const,
      content: "Could I get tea?",
      sentences: Object.freeze([
        Object.freeze({
          id: "lesson-sentence-1",
          resourceId: "lesson-resource-1",
          order: 0,
          text: "Could I get tea?",
          translation: "我可以要茶吗？",
          startMs: null,
          endMs: null,
          sourceAudioUri: null,
        }),
      ]),
      mediaKind: "text" as const,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const learning = createEnglishPracticeNavigationSnapshot(
      Object.freeze({ ...createInitialLearningSnapshot(), resources: Object.freeze([resource]) }),
      resource.id,
    );
    const shell = selectPrimaryTab(completeWorkspaceCheck(createAppShellState(), 1), "learn");
    expect(learning.ui).toMatchObject({
      section: "practice",
      selectedResourceId: resource.id,
      selectedSentenceId: "lesson-sentence-1",
    });
    expect(shell.activeTab).toBe("learn");
  });
});
