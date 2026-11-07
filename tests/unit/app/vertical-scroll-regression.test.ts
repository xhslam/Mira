import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("vertical page scrolling", () => {
  it("scrolls practice controls and virtualized subtitles on the same vertical surface", () => {
    const source = readSource("src/learning/practice-screen.tsx");
    const transcript = readSource("src/learning/presentation/transcript/transcript-panel.tsx");

    expect(source).not.toContain("<ScrollView");
    expect(source).toMatch(/<TranscriptPanel\s+header=\{\s*<View style=\{styles.content\}>/u);
    expect(transcript).toContain("<FlatList");
    expect(transcript).toContain("ListHeaderComponent={");
    expect(transcript).toContain('keyboardShouldPersistTaps="handled"');
    expect(transcript).toContain("style={styles.scroll}");
    expect(transcript).toContain("scroll: { flex: 1, minHeight: 0 }");
  });

  it("keeps Markdown import and library content inside a constrained, touch-friendly scroller", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const importSheet = readSource("src/learning/learning-home-screen.tsx");

    expect(learningScreen).toContain("style={styles.contentScroll}");
    expect(learningScreen).toContain("contentScroll: { flex: 1, minHeight: 0 }");
    expect(learningScreen).toContain("content: { flexGrow: 1, paddingBottom: 64 }");
    expect(importSheet).toContain("style={styles.optionsScroll}");
    expect(importSheet).toContain("optionsScroll: { flexShrink: 1 }");
    expect(importSheet).toContain('keyboardShouldPersistTaps="handled"');
    expect(importSheet).toContain("nestedScrollEnabled");
  });
});

describe("nested vertical scrolling", () => {
  it("keeps the vocabulary list compatible with the learning page scroller", () => {
    const vocabularyScreen = readSource("src/learning/vocabulary-screen.tsx");

    expect(vocabularyScreen).toContain("<ScrollView");
    expect(vocabularyScreen).toContain('keyboardShouldPersistTaps="handled"');
    expect(vocabularyScreen).toContain("nestedScrollEnabled");
  });
});
