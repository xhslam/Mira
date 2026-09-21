import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("learning design implementation", () => {
  it("keeps Craft out of the header and routes it through the import sheet", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const homeScreen = readSource("src/learning/learning-home-screen.tsx");

    expect(learningScreen).not.toContain('accessibilityLabel="创建学习材料"');
    expect(learningScreen).toContain('accessibilityLabel="导入资料"');
    expect(learningScreen).toContain("onOpenCraft={openCraft}");
    expect(learningScreen).toContain('section: "craft"');
    expect(learningScreen).toContain("section: lastMainSection");
    expect(homeScreen).toContain('accessibilityLabel="创建学习材料"');
    expect(homeScreen).toContain("onPress={chooseCraft}");
    expect(homeScreen).toContain("手动输入文稿，直接保存为学习资料");
    expect(homeScreen).not.toContain('title: "录音"');
    expect(homeScreen).not.toContain("craftButton");
  });

  it("separates direct manual creation from the advanced Craft workflow", () => {
    const craftScreen = readSource("src/learning/craft-screen.tsx");

    expect(craftScreen).toContain('type CraftMode = "basic" | "advanced"');
    expect(craftScreen).toContain('{item === "basic" ? "基础" : "高级"}');
    expect(craftScreen).toContain("粘贴或输入文稿，保存后直接成为资料库中的文本资料。");
    expect(craftScreen).toContain("createManualLearningResource");
    expect(craftScreen).toContain("addManualLearningResourceToLibrary");
    expect(craftScreen).toContain("录音与 AI 创作");
    expect(craftScreen).not.toContain('type CraftMode = "quick" | "advanced"');
    expect(craftScreen).not.toContain("高级创作");
    expect(craftScreen).not.toContain("LanguageChip");
  });

  it("implements the concept hierarchy for Today and Learning Settings", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const homeScreen = readSource("src/learning/learning-home-screen.tsx");

    expect(homeScreen).toContain("<ProgressRing");
    expect(homeScreen).toContain("styles.continueArtwork");
    expect(homeScreen).toContain("styles.continueProgressTrack");
    expect(learningScreen).toContain("styles.settingsGroup");
  });

  it("opens URL import as a focused page and removes the duplicate text entry", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const homeScreen = readSource("src/learning/learning-home-screen.tsx");
    const libraryScreen = readSource("src/learning/library-screen.tsx");
    const urlImportScreen = readSource("src/learning/url-import-screen.tsx");

    expect(learningScreen).toContain('section: "url-import"');
    expect(learningScreen).toContain("<UrlImportScreen");
    expect(learningScreen).toContain("onOpenUrl={openUrlImport}");
    expect(homeScreen).toContain('accessibilityLabel="通过 URL 导入"');
    expect(homeScreen).toContain("onPress={chooseUrl}");
    expect(homeScreen).not.toContain('title: "导入文字"');
    expect(libraryScreen).not.toContain("setComposer");
    expect(libraryScreen).not.toContain("<TextInput");
    expect(urlImportScreen).toContain("导入到资料");
    expect(urlImportScreen).toContain('section: "library"');
  });

  it("orders the primary navigation by the requested task priority", () => {
    const appShell = readSource("src/app/app-shell-screen.tsx");
    const learn = appShell.indexOf('id: "learn", labelKey: "nav.learn"');
    const files = appShell.indexOf('id: "files", labelKey: "nav.files"');
    const ai = appShell.indexOf('id: "ai", labelKey: "nav.ai"');
    const drawings = appShell.indexOf('id: "drawings", labelKey: "nav.drawings"');
    const settings = appShell.indexOf('id: "settings", labelKey: "nav.settings"');

    expect(learn).toBeGreaterThan(-1);
    expect(learn).toBeLessThan(files);
    expect(files).toBeLessThan(ai);
    expect(ai).toBeLessThan(drawings);
    expect(drawings).toBeLessThan(settings);
  });
});
