import { describe, expect, it } from "vitest";
import { lookupPhrase, lookupWord } from "../../../src/learning/word-lookup";

describe("word and phrase lookup", () => {
  it("keeps multi-word phrases on the dedicated detail path", async () => {
    const result = await lookupPhrase("  these   days ");
    expect(result.source).toBe("phrase");
    expect(result.word).toBe("these days");
    expect(result.definitions[0]?.definition).toContain("近来");
  });

  it("continues to reject phrases on the single-word dictionary path", async () => {
    await expect(lookupWord("these days")).rejects.toThrow("英文单词");
  });
});
