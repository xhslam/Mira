import { describe, expect, it } from "vitest";

import { createStructuredTable } from "../../../src/formats/structured/table";

describe("createStructuredTable", () => {
  it("normalizes an array of objects into frozen display rows", () => {
    const table = createStructuredTable(
      "json",
      '[{"name":"Mira","active":true},{"name":"Inkstone","count":2}]',
    );

    expect(table).toEqual({
      columns: ["name", "active", "count"],
      rows: [
        { name: "Mira", active: "true", count: "" },
        { name: "Inkstone", active: "", count: "2" },
      ],
      truncated: false,
    });
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table?.rows[0])).toBe(true);
  });

  it("supports JSON Lines and rejects non-tabular roots", () => {
    expect(createStructuredTable("json", '{"id":1}\n{"id":2}\n', true)?.rows).toEqual([
      { id: "1" },
      { id: "2" },
    ]);
    expect(createStructuredTable("yaml", "name: Mira\n")).toBeNull();
  });
});
