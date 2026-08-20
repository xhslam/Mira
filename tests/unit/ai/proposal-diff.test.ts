import { describe, expect, test } from "vitest";

import { createProposalDiffPlan, renderProposalDiffPlan } from "../../../src/ai/proposal-diff";

describe("AI proposal diff segments", () => {
  test("accepts or rejects individual local change hunks without losing unchanged text", () => {
    const before = "one\ntwo\nthree\nfour\n";
    const after = "ONE\ntwo\nthree\nFOUR\n";
    const plan = createProposalDiffPlan(before, after);
    const hunks = plan.filter((piece) => piece.kind === "change");
    expect(hunks).toHaveLength(2);
    expect(renderProposalDiffPlan(plan, new Set([0]))).toBe("ONE\ntwo\nthree\nfour\n");
    expect(renderProposalDiffPlan(plan, new Set([1]))).toBe("one\ntwo\nthree\nFOUR\n");
  });
});
