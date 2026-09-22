import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("learning library visual hierarchy", () => {
  it("opens a resource directly and reveals only download and delete on a right swipe", () => {
    const source = readSource("src/learning/library-screen.tsx");

    const filterIndex = source.indexOf("styles.filterRow");
    const resourceListIndex = source.indexOf("styles.resourceList");

    expect(filterIndex).toBeGreaterThan(-1);
    expect(resourceListIndex).toBeGreaterThan(filterIndex);
    expect(source).toContain("filteredResources.map");
    expect(source).toContain("<SwipeableResourceRow");
    expect(source).toContain("PanResponder.create");
    expect(source).toContain("gesture.dx > 10");
    expect(source).toContain("onOpenPractice(resource)");
    expect(source).toContain("accessibilityLabel={`下载资料 ${resource.title}`}");
    expect(source).toContain("accessibilityLabel={`删除资料 ${resource.title}`}");
    expect(source).not.toContain("styles.processingGrid");
    expect(source).not.toContain('label="逐句翻译"');
    expect(source).not.toContain("styles.translationPreview");
    expect(source).not.toContain("styles.deleteAction");
  });

  it("deletes only after confirmation through the learning deletion domain", () => {
    const source = readSource("src/learning/library-screen.tsx");

    expect(source).toContain("Alert.alert(");
    expect(source).toContain('style: "destructive" as const');
    expect(source).toContain("deleteLearningResource(snapshot, resource.id)");
    expect(source).toContain("设备中的原始文件不会被删除");
  });

  it("moves smart translation into practice and skips AI when every sentence is translated", () => {
    const practice = readSource("src/learning/practice-screen.tsx");

    expect(practice).toContain("missingLearningTranslations(snapshot, resource.id)");
    expect(practice).toContain("全部句子已有译文");
    expect(practice).toContain('label={translationBusy ? "翻译中" : "生成译文"}');
    expect(practice).toContain("applyLearningTranslations(");
  });

  it("keeps library actions focused and the learning navigation compact", () => {
    const learningScreen = readSource("src/app/learning-screen.tsx");
    const appShell = readSource("src/app/app-shell-screen.tsx");

    expect(learningScreen).toContain('accessibilityLabel="搜索资料"');
    expect(learningScreen).toContain('accessibilityLabel="导入资料"');
    expect(learningScreen).toContain('accessibilityLabel="学习设置"');
    expect(learningScreen).not.toContain('accessibilityLabel="创建学习材料"');
    expect(learningScreen).toContain("LEARNING_MAIN_TABS.map");
    expect(learningScreen).not.toContain("<DiscoverScreen");
    expect(learningScreen).toContain("key={section}");
    expect(appShell).toContain("selected ? theme.colors.accent : theme.colors.mutedText");
  });
});
