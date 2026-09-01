import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("quality workflow", () => {
  it("uses the validated Android export wrapper", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "quality.yml"),
      "utf8",
    );

    expect(workflow).toContain("run: npm run export:android -- --clear");
    expect(workflow).not.toContain("run: npx expo export --platform android");
  });
});
