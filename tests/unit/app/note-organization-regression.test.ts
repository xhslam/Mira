import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("note organization regression", () => {
  it("opens common note actions from a long press without a native modal", () => {
    const overview = readSource("src/app/notes-overview-screen.tsx");

    expect(overview).toContain("onLongPress={onLongPress}");
    expect(overview).toContain('label="重命名"');
    expect(overview).toContain('label="移动到文件夹"');
    expect(overview).toContain('label="删除笔记"');
    expect(overview).toContain("controller.removeBrowserEntry");
    expect(overview).not.toContain("<Modal");
  });

  it("creates folders visibly and moves notes with a physical drag handle", () => {
    const sidebar = readSource("src/app/global-sidebar.tsx");
    const shell = readSource("src/app/app-shell-screen.tsx");

    expect(sidebar).toContain('accessibilityLabel="新建文件夹"');
    expect(sidebar).toContain("await onCreateFolder(value)");
    expect(sidebar).toContain("PanResponder.create");
    expect(sidebar).toContain("pan.getTranslateTransform()");
    expect(sidebar).toContain("await onMoveFile(entry, target.path)");
    expect(sidebar).toContain("dragTarget === folder.path");
    expect(shell).toContain("onCreateFolder={editorController.createBrowserDirectory}");
    expect(shell).toContain("onMoveFile={editorController.moveBrowserEntry}");
  });
});
