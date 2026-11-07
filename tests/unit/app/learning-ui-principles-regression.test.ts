import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(__dirname, "../../..", path), "utf8");
}

// Inspect declared styles without importing native Expo modules in the Node test runner.
function style(path: string, name: string): Record<string, string> {
  const file = ts.createSourceFile(
    path,
    source(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let result: Record<string, string> | undefined;
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === name &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      result = Object.fromEntries(
        node.initializer.properties
          .filter(ts.isPropertyAssignment)
          .map((property) => [property.name.getText(file), property.initializer.getText(file)]),
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(result, `Missing style ${name}`).toBeDefined();
  return result!;
}

const home = "src/learning/learning-home-screen.tsx";
const library = "src/learning/library-screen.tsx";
const shell = "src/app/learning-screen.tsx";

describe("learning UI principles", () => {
  it("uses flat surfaces for ordinary lists, daily progress and settings", () => {
    for (const [path, name] of [
      [home, "goal"],
      [library, "resourceList"],
      [shell, "settingsGroup"],
    ] as const) {
      const declared = style(path, name);
      expect(declared.backgroundColor).toBeUndefined();
      expect(declared.borderRadius).toBeUndefined();
      expect(declared.borderWidth).toBeUndefined();
    }
    expect(style(home, "feature").backgroundColor).toBeUndefined();
  });

  it("puts the circular create action between the other learning actions in the home footer beside global navigation", () => {
    expect(style(home, "homeActions").flexDirection).toBe('"row"');
    expect(style(home, "homeAction").flex).toBe("1");
    const create = style(home, "createAction");
    expect(create.width).toBe(create.height);
    expect(create.borderRadius).toBe("theme.radius.pill");
    expect(style(home, "homeActionsTrack").backgroundColor).toBe("theme.colors.surface");
    const content = source(home);
    expect(
      Array.from(
        content.matchAll(/label: "(资料库|创建资料|英语陪练)", icon:/gu),
        (match) => match[1],
      ),
    ).toEqual(["资料库", "创建资料", "英语陪练"]);
    expect(source(shell)).toMatch(
      /<\/View>,\s*section === "home" \? \(\s*<LearningHomeActions[\s\S]*?onOpenCoach=\{openCoach\}/u,
    );
  });

  it("uses flat action rows instead of nested cards and prioritizes learning", () => {
    const declared = style(library, "processingAction");
    expect(declared.flexDirection).toBe('"row"');
    expect(declared.borderRadius).toBeUndefined();
    expect(declared.height).toBeUndefined();
    expect(Number(declared.minHeight)).toBeGreaterThanOrEqual(48);
    expect(source(library)).toContain("featured={resource.sentences.length > 0}");
    expect(source(library)).not.toContain("进入新版学习页");
    expect(source(library)).not.toContain("逐句中译");
    expect(source(library)).toContain("设备中的原始文件不会被删除");
  });

  it("removes redundant guidance but preserves import prerequisites", () => {
    const content = source(home);
    expect(content).not.toContain("选择一种来源。");
    expect(content).not.toContain("从一段喜欢的内容开始。");
    expect(content).not.toContain("导入后，你可以逐句阅读、查词、跟读和复习。");
    expect(content).toContain("需先在资料库选择视频");
    expect(content).toContain("onPress={chooseCraft}");
    expect(content).toContain("onPress={chooseUrl}");
  });

  it("leaves the local back control unobstructed on dedicated learning pages", () => {
    expect(source(shell)).not.toContain("FloatingSidebarButton");
    expect(source("src/learning/craft-screen.tsx")).toContain('accessibilityLabel="返回学习首页"');
  });

  it("keeps touch targets generous and typography restrained", () => {
    for (const [path, name] of [
      [home, "homeAction"],
      [home, "doneButton"],
      [home, "continueAction"],
      [library, "filterChip"],
      [library, "deleteAction"],
      [shell, "iconButton"],
    ] as const) {
      const declared = style(path, name);
      expect(Number(declared.minHeight ?? declared.height)).toBeGreaterThanOrEqual(48);
    }
    expect(Number(style(home, "sentence").fontSize)).toBeGreaterThan(32);
    expect(style(library, "resourceTitle").fontWeight).toBe('"500"');
    expect(style(shell, "headerTitle").fontWeight).toBe('"600"');
  });
});
