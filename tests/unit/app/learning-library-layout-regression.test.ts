import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("learning library visual hierarchy", () => {
  it("keeps all four material actions inside a single-item accordion", () => {
    const source = readSource("src/learning/library-screen.tsx");

    const filterIndex = source.indexOf("styles.filterRow");
    const resourceListIndex = source.indexOf("styles.resourceList");
    const actionsIndex = source.indexOf("styles.processingGrid");

    expect(filterIndex).toBeGreaterThan(-1);
    expect(resourceListIndex).toBeGreaterThan(filterIndex);
    expect(actionsIndex).toBeGreaterThan(resourceListIndex);
    expect(source).toContain("filteredResources.map");
    expect(source).toContain("selectResource(resource)");
    expect(source).toContain("setExpandedResourceId(resource.id)");
    expect(source).toContain("resource.id === expandedResourceId");
    expect(source).toContain("accessibilityState={{ expanded: resourceExpanded }}");
    expect(source).toContain("{resourceExpanded ? (");
    expect(source).not.toContain("ResourceHeroArtwork");
    expect(source).toContain('label={resource.mediaKind === "bilibili" ? "导入字幕" : "识别字幕"}');
    expect(source).toContain('label="逐句翻译"');
    expect(source).toContain('label="下载"');
    expect(source).toContain('label={resource.sentences.length ? "逐句学习"');
  });

  it("deletes only after confirmation through the learning deletion domain", () => {
    const source = readSource("src/learning/library-screen.tsx");

    expect(source).toContain("Alert.alert(");
    expect(source).toContain('style: "destructive" as const');
    expect(source).toContain("deleteLearningResource(snapshot, resource.id)");
    expect(source).toContain("设备中的原始文件不会被删除");
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
