import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

describe("drawings create regression", () => {
  it("keeps creation in the app window and reports thrown workspace failures", () => {
    const source = fs.readFileSync(path.join(root, "src/app/drawings-screen.tsx"), "utf8");

    expect(source).not.toContain("<Modal");
    expect(source).toContain("<KeyboardAvoidingView");
    expect(source).toContain("const target = drawingCreateTarget(name)");
    expect(source).toContain('setError(t("drawings.createFailed"))');
  });
});
