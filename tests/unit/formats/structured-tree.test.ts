import { describe, expect, it } from "vitest";

import {
  buildStructuredTree,
  formatJsonPath,
  parseStructuredValue,
  STRUCTURED_TREE_LIMITS,
  valueTypeOf,
} from "../../../src/formats/structured/tree";

describe("valueTypeOf", () => {
  it.each([
    [null, "null"],
    [[], "array"],
    [{}, "object"],
    ["text", "string"],
    [42, "number"],
    [true, "boolean"],
    [undefined, "null"],
  ] as const)("classifies %p as %s", (value, expected) => {
    expect(valueTypeOf(value)).toBe(expected);
  });
});

describe("buildStructuredTree", () => {
  it("builds a frozen tree from a plain object", () => {
    const value = { name: "vmark", version: "0.1.0", tags: ["mobile", "editor"] };
    const tree = buildStructuredTree(value);

    expect(tree.root.type).toBe("object");
    expect(tree.root.childCount).toBe(3);
    expect(tree.root.children).toHaveLength(3);
    expect(tree.nodeCount).toBe(2); // root object + tags array containers
    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree.root)).toBe(true);
    expect(Object.isFrozen(tree.root.children)).toBe(true);
  });

  it("assigns stable paths to nodes", () => {
    const tree = buildStructuredTree({ a: { b: [1, 2] } });
    const a = tree.root.children[0];
    const b = a?.children[0];
    const item = b?.children[0];

    expect(a?.path).toBe("$/a");
    expect(b?.path).toBe("$/a/b");
    expect(item?.path).toBe("$/a/b/0");
  });

  it("formats array indices with brackets", () => {
    const tree = buildStructuredTree([1, 2]);
    expect(tree.root.children[1]?.path).toBe("$/1");
    expect(formatJsonPath("$/a/b/0")).toBe("$.a.b[0]");
    expect(formatJsonPath("$")).toBe("$");
    expect(formatJsonPath("$/0")).toBe("$[0]");
  });

  it("stops expanding nested containers beyond the node limit", () => {
    const value = Array.from({ length: STRUCTURED_TREE_LIMITS.maxNodes + 100 }, (_, index) => ({
      item: index,
    }));
    const tree = buildStructuredTree(value);
    expect(tree.nodeCount).toBe(STRUCTURED_TREE_LIMITS.maxNodes);
  });

  it("stops expanding beyond the depth limit", () => {
    let value: unknown = 1;
    for (let index = 0; index < STRUCTURED_TREE_LIMITS.maxDepth + 20; index += 1) {
      value = { nested: value };
    }
    const tree = buildStructuredTree(value);
    expect(tree.depth).toBeLessThanOrEqual(STRUCTURED_TREE_LIMITS.maxDepth + 1);
  });

  it("truncates long string previews", () => {
    const tree = buildStructuredTree({ text: "x".repeat(500) });
    const text = tree.root.children[0];
    expect(text?.displayValue.endsWith("…")).toBe(true);
  });
});

describe("parseStructuredValue", () => {
  it("parses JSON", () => {
    expect(parseStructuredValue("json", '{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses YAML", () => {
    expect(parseStructuredValue("yaml", "name: vmark\n")).toEqual({ name: "vmark" });
  });

  it("parses TOML", () => {
    expect(parseStructuredValue("toml", '[package]\nname = "vmark"\n')).toEqual({
      package: { name: "vmark" },
    });
  });

  it("parses JSON Lines as an array without changing ordinary JSON behavior", () => {
    expect(parseStructuredValue("json", '{"id":1}\n\n{"id":2}\r\n', true)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(() => parseStructuredValue("json", '{"id":1}\n{"broken":', true)).toThrow();
  });
});
