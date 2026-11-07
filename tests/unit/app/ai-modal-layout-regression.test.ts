import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("full-screen AI modals", () => {
  it.each(["ai-automation-sheet", "ai-proposal-inbox", "ai-proposal-sheet"])(
    "keeps %s controls inside the app safe area",
    (name) => {
      const source = readFileSync(`src/app/${name}.tsx`, "utf8");
      expect(source).toMatch(/<Modal\b[^]*?<AppSafeArea\b[^]*?<\/AppSafeArea>\s*<\/Modal>/u);
    },
  );
});

it("uses scrollable safe-area sheets for learning forms", () => {
  const phraseMemory = readFileSync("src/learning/phrase-memory-screen.tsx", "utf8");
  const learning = readFileSync("src/app/learning-screen.tsx", "utf8");
  const home = readFileSync("src/learning/learning-home-screen.tsx", "utf8");
  const practice = readFileSync("src/learning/practice-screen.tsx", "utf8");
  expect(phraseMemory.match(/<MiraSheet\b/gu)).toHaveLength(2);
  expect(learning).toMatch(/<MiraSheet\b[^]*?title="媒体转写与语音"/u);
  expect(home).toMatch(/<SafeAreaView\b[^]*?edges=\{\["bottom", "left", "right"\]\}/u);
  expect(practice).toContain("<SafeAreaView style={styles.immersiveOverlay}>");
  expect(practice.match(/<SafeAreaView\b[^]*?style=\{styles.wordSheet\}/gu)).toHaveLength(2);
});
