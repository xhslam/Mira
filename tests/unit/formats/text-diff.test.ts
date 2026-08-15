import { describe, expect, it } from "vitest";

import { createTextDiff } from "../../../src/formats/text-diff";

describe("createTextDiff", () => {
  it("returns immutable line additions, removals, and context", () => {
    const result = createTextDiff("one\ntwo\n", "one\nthree\n");

    expect(result.map((segment) => segment.kind)).toEqual(["unchanged", "removed", "added"]);
    expect(result[1]?.lines).toEqual(["two"]);
    expect(result[2]?.lines).toEqual(["three"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0]?.lines)).toBe(true);
  });
});
