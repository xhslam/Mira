import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("Phrase & Memory navigation", () => {
  it("keeps Profile as a compact entry and opens a dedicated independent screen", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");

    expect(learningScreen).toContain('section: "phrase-memory"');
    expect(learningScreen).toContain("<PhraseMemoryScreen");
    expect(learningScreen).toContain("短语与记忆");
    expect(learningScreen).toContain("snapshot.memories.length");
    expect(learningScreen).not.toContain("<VocabularyScreen");
  });

  it("keeps phrases and memories separate, searchable, deletable, and back-navigable", () => {
    const screen = readSource("src/learning/phrase-memory-screen.tsx");

    expect(screen).toContain('useState<LibraryTab>("phrases")');
    expect(screen).toContain('accessibilityRole="tablist"');
    expect(screen).toContain("filterAndSortPhrases");
    expect(screen).toContain("filterAndSortMemories");
    expect(screen).toContain("toggleFavorite");
    expect(screen).toContain("deletePhrase");
    expect(screen).toContain("deleteMemory");
    expect(screen).toContain("PhraseDetail");
    expect(screen).toContain("MemoryDetailSheet");
    expect(screen).toContain("ActionMenu");
    expect(screen).toContain("hardwareBackPress");
    expect(screen).toContain("<FlatList<VocabularyCard | LearningMemory>");
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
  });
});
