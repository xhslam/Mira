import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("learning library visual hierarchy", () => {
  it("keeps the reference layout order and all four material actions", () => {
    const source = readSource("src/learning/library-screen.tsx");

    const filterIndex = source.indexOf("styles.filterRow");
    const heroIndex = source.indexOf("styles.heroCard");
    const actionsIndex = source.indexOf("styles.processingGrid");

    expect(filterIndex).toBeGreaterThan(-1);
    expect(heroIndex).toBeGreaterThan(filterIndex);
    expect(actionsIndex).toBeGreaterThan(heroIndex);
    expect(source).toContain("<ResourceHeroArtwork />");
    expect(source).toContain('label={selected.mediaKind === "bilibili" ? "导入字幕" : "识别字幕"}');
    expect(source).toContain('label="逐句翻译"');
    expect(source).toContain('label="下载"');
    expect(source).toContain('label={selected.sentences.length ? "逐句学习"');
  });

  it("keeps a dedicated library search affordance and selected learning navigation", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const appShell = readSource("src/app/app-shell-screen.tsx");

    expect(learningScreen).toContain('section === "home" || section === "library"');
    expect(learningScreen).toContain('accessibilityLabel={section === "library" ? "搜索资料库"');
    expect(learningScreen).toContain("key={section}");
    expect(appShell).toContain('selected ? "#3B82FF" : "#858D9E"');
  });
});
