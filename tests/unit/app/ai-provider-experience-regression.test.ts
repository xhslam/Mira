import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("AI provider and learning translation experience", () => {
  it("keeps provider choice extensible and completes the save flow", () => {
    const providerSheet = readSource("src/app/ai-provider-sheet.tsx");

    expect(providerSheet).toContain("AI_PROVIDER_CATALOG.map");
    expect(providerSheet).toContain("modelDiscovery.discover");
    expect(providerSheet).toContain("可从服务获取，也可直接输入任意模型 ID");
    expect(providerSheet).toContain("保存模型服务");
    expect(providerSheet).toContain("await reload()");
    expect(providerSheet).toContain("closeForm()");
  });

  it("keeps translation status visible and writes generated translations through the shared projection", () => {
    const library = readSource("src/learning/library-screen.tsx");
    const practice = readSource("src/learning/practice-screen.tsx");
    const settings = readSource("src/app/learning-screen.tsx");

    expect(library).toContain('"译文完整"');
    expect(library).toContain("translatedCount");
    expect(library).toContain(
      "applyLearningTranslations(snapshotRef.current, resource.id, updates)",
    );
    expect(practice).toContain("snapshot.settings.showTranslationsByDefault");
    expect(practice).toContain("reconcileLearningTranslations(snapshot, resource.id)");
    expect(practice).toContain('translationBusy ? "翻译中" : "生成译文"');
    expect(settings).toContain('title="默认显示译文"');
  });
});
