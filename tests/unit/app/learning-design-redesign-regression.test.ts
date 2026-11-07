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
    expect(homeScreen).not.toContain('title: "录音"');
    expect(homeScreen).not.toContain("craftButton");
  });

  it("implements the concept hierarchy for Today and Learning Settings", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const homeScreen = readSource("src/learning/learning-home-screen.tsx");

    const practiceScreen = readSource("src/learning/practice-screen.tsx");
    expect(homeScreen).toContain("learningHomePreview(snapshot)");
    expect(homeScreen.indexOf("{preview.sentence.text}")).toBeLessThan(
      homeScreen.indexOf("style={styles.goal}"),
    );
    expect(homeScreen).not.toContain("<ProgressRing");
    expect(practiceScreen).toContain("styles.followButton");
    expect(practiceScreen).toContain("逐句列表");
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
    const navigation = readSource("src/app/primary-navigation.tsx");
    const learn = navigation.indexOf('id: "learn", labelKey: "nav.learn"');
    const files = navigation.indexOf('id: "files", labelKey: "nav.files"');
    const agent = navigation.indexOf('id: "agent", labelKey: "nav.agent"');
    const settings = navigation.indexOf('id: "settings", labelKey: "nav.settings"');

    expect(agent).toBeGreaterThan(-1);
    expect(agent).toBeLessThan(learn);
    expect(learn).toBeLessThan(files);
    expect(files).toBeLessThan(settings);
    expect(navigation).not.toContain('id: "drawings"');
  });
});
