import { describe, expect, it } from "vitest";

import {
  offsetToPosition,
  positionToOffset,
  validateFormatContent,
  validateFormatEditorDiagnostics,
} from "../../../src/formats/validators";

describe("offset/position conversion", () => {
  it("converts offsets to 1-based line and column", () => {
    const content = "line1\nline2\nline3";
    expect(offsetToPosition(content, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToPosition(content, 5)).toEqual({ line: 1, column: 6 });
    expect(offsetToPosition(content, 6)).toEqual({ line: 2, column: 1 });
    expect(offsetToPosition(content, 12)).toEqual({ line: 3, column: 1 });
  });

  it("round-trips positions through offsets", () => {
    const content = "a\nbb\nccc";
    expect(positionToOffset(content, 2, 1)).toBe(2);
    expect(positionToOffset(content, 3, 3)).toBe(7);
    const position = positionToOffset(content, 2, 2);
    expect(offsetToPosition(content, position)).toEqual({ line: 2, column: 2 });
  });
});

describe("JSON validator", () => {
  it("accepts valid JSON without diagnostics", () => {
    expect(validateFormatEditorDiagnostics("json", '{"a": 1, "b": [true, null]}')).toEqual([]);
  });

  it("reports empty documents", () => {
    const diagnostics = validateFormatEditorDiagnostics("json", "   ");
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("locates a JSON syntax error with line and column", () => {
    const content = '{\n  "a": 1,\n  "b": ,\n}';
    const diagnostics = validateFormatEditorDiagnostics("json", content);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("validates JSONL line by line so one bad line does not poison the document", () => {
    const content = '{"ok": 1}\n{broken}\n{"ok": 2}';
    const diagnostics = validateFormatContent("json", content, "data.jsonl");
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.line).toBe(2);
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("skips blank JSONL lines", () => {
    const content = '{"ok": 1}\n\n\n{"ok": 2}';
    expect(validateFormatEditorDiagnostics("json", content, "data.jsonl")).toEqual([]);
  });
});

describe("YAML validator", () => {
  it("accepts valid YAML", () => {
    expect(validateFormatEditorDiagnostics("yaml", "name: vmark\nversion: 1.0\n")).toEqual([]);
  });

  it("reports YAML parse errors with offsets", () => {
    const content = "a: 1\nb: [1, 2\n";
    const diagnostics = validateFormatEditorDiagnostics("yaml", content);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.from).toBeGreaterThanOrEqual(0);
  });

  it("rejects tab indentation as an error", () => {
    const content = "\t bad indent\n";
    const diagnostics = validateFormatEditorDiagnostics("yaml", content);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("returns no diagnostics for empty YAML", () => {
    expect(validateFormatEditorDiagnostics("yaml", "")).toEqual([]);
  });
});

describe("TOML validator", () => {
  it("accepts valid TOML", () => {
    expect(
      validateFormatEditorDiagnostics("toml", '[package]\nname = "vmark"\nversion = "0.1.0"\n'),
    ).toEqual([]);
  });

  it("reports TOML parse errors", () => {
    const content = 'name = "vmark"\nversion = \n';
    const diagnostics = validateFormatEditorDiagnostics("toml", content);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("reports empty TOML documents", () => {
    const diagnostics = validateFormatEditorDiagnostics("toml", "  ");
    expect(diagnostics.length).toBe(1);
  });
});

describe("format validator registry", () => {
  it("maps the three structured parsers", () => {
    expect(validateFormatEditorDiagnostics("json", "{")).toHaveLength(1);
    expect(validateFormatEditorDiagnostics("yaml", "a: 1\nb: [1, 2\n")).not.toEqual([]);
    expect(validateFormatEditorDiagnostics("toml", "a = ")).not.toEqual([]);
  });
});
