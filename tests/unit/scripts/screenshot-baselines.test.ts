import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("screenshot baselines", () => {
  it("match their checked-in manifest", () => {
    expect(
      execFileSync(process.execPath, ["scripts/verify-screenshot-baselines.mjs"], {
        encoding: "utf8",
      }),
    ).toContain("Verified 4 screenshot baselines.");
  });
});
