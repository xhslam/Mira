import { describe, expect, it } from "vitest";

import { selectionForSearchLine } from "../../../src/search/search-navigation";

describe("selectionForSearchLine", () => {
  it("selects the exact one-based result line", () => {
    expect(selectionForSearchLine("first\nsecond line\nthird", 2)).toEqual({
      anchor: 6,
      head: 17,
    });
  });

  it("clamps absent and out-of-range lines safely", () => {
    expect(selectionForSearchLine("one", null)).toEqual({ anchor: 0, head: 0 });
    expect(selectionForSearchLine("one", 99)).toEqual({ anchor: 3, head: 3 });
  });
});
