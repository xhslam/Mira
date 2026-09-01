import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("learning discover layout and navigation", () => {
  it("keeps material discovery before the import actions", () => {
    const source = readSource("src/learning/discover-screen.tsx");
    const headingIndex = source.indexOf("选择下一段想听的内容");
    const materialIndex = source.indexOf("styles.materials");
    const importIndex = source.indexOf("styles.importArea");

    expect(headingIndex).toBeGreaterThan(-1);
    expect(materialIndex).toBeGreaterThan(headingIndex);
    expect(importIndex).toBeGreaterThan(materialIndex);
    expect(source).toContain("listDiscoverResources(snapshot.resources, filter, 2)");
    expect(source).toContain("resourceProgress(snapshot, resource)");
  });

  it("keeps every visible action connected to the learning workflow", () => {
    const discoverScreen = readSource("src/learning/discover-screen.tsx");
    const learningScreen = readSource("src/app/learning-screen.tsx");

    expect(discoverScreen).toContain("onPress={() => onOpenResource(resource)}");
    expect(discoverScreen).toContain("onPress={onOpenImport}");
    expect(discoverScreen).toContain('openLibrary("url")');
    expect(discoverScreen).toContain('openLibrary("local")');
    expect(discoverScreen).toContain('openLibrary("subtitle")');
    expect(learningScreen).toContain("onOpenImport={() => setShowImportSheet(true)}");
    expect(learningScreen).toContain("onOpenResource={openResource}");
  });
});
