import { describe, expect, it } from "vitest";

import { formatStructuredDocument } from "../../../src/formats/structured/format";

describe("formatStructuredDocument", () => {
  it("formats JSON and JSON Lines only when explicitly called", () => {
    expect(formatStructuredDocument("json", '{"a":1}')).toBe('{\n  "a": 1\n}\n');
    expect(formatStructuredDocument("json", '{"a":1}\n{"a":2}', true)).toBe('{"a":1}\n{"a":2}\n');
  });

  it("round-trips safe YAML and TOML", () => {
    expect(formatStructuredDocument("yaml", "name: Mira\nitems: [1, 2]\n")).toContain("name: Mira");
    expect(formatStructuredDocument("toml", '[app]\nname="Mira"\n')).toContain(
      '[app]\nname = "Mira"',
    );
  });
});
