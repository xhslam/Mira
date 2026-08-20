import { parseTomlSafe } from "../validators/toml";
import { parseYamlSafe } from "../validators/yaml";

export type StructuredValueType = "object" | "array" | "string" | "number" | "boolean" | "null";

export type StructuredTreeNode = Readonly<{
  key: string;
  path: string;
  type: StructuredValueType;
  value: unknown;
  displayValue: string;
  childCount: number;
  children: readonly StructuredTreeNode[];
}>;

export type StructuredTree = Readonly<{
  root: StructuredTreeNode;
  nodeCount: number;
  depth: number;
}>;

export const STRUCTURED_TREE_LIMITS = Object.freeze({
  maxNodes: 10_000,
  maxDepth: 64,
  maxPreviewLength: 120,
} as const);

export function valueTypeOf(value: unknown): StructuredValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "null";
}

function previewValue(value: unknown, type: StructuredValueType): string {
  if (type === "null") return "null";
  if (type === "string") {
    const text = String(value);
    return text.length > STRUCTURED_TREE_LIMITS.maxPreviewLength
      ? `${text.slice(0, STRUCTURED_TREE_LIMITS.maxPreviewLength)}…`
      : text;
  }
  if (type === "array") return `Array(${String((value as readonly unknown[]).length)})`;
  if (type === "object") return `Object(${String(Object.keys(value as object).length)})`;
  return String(value);
}

function childCountFor(value: unknown, type: StructuredValueType): number {
  if (type === "array") return (value as readonly unknown[]).length;
  if (type === "object") return Object.keys(value as object).length;
  return 0;
}

function childEntries(
  value: unknown,
  type: StructuredValueType,
): readonly Readonly<{ key: string; value: unknown }>[] {
  if (type === "array") {
    return Object.freeze(
      (value as readonly unknown[]).map((item, index) =>
        Object.freeze({ key: String(index), value: item }),
      ),
    );
  }
  if (type === "object") {
    return Object.freeze(
      Object.entries(value as Record<string, unknown>).map(([key, childValue]) =>
        Object.freeze({ key, value: childValue }),
      ),
    );
  }
  return Object.freeze([]);
}

function buildNode(
  key: string,
  path: string,
  value: unknown,
  depth: number,
  state: { nodes: number },
): StructuredTreeNode {
  const type = valueTypeOf(value);
  if (type !== "object" && type !== "array") {
    return Object.freeze({
      key,
      path,
      type,
      value,
      displayValue: previewValue(value, type),
      childCount: 0,
      children: Object.freeze([]),
    });
  }

  const count = childCountFor(value, type);
  const exceedsDepth = depth + 1 > STRUCTURED_TREE_LIMITS.maxDepth;
  const exceedsNodeBudget = state.nodes >= STRUCTURED_TREE_LIMITS.maxNodes;
  if (exceedsDepth || exceedsNodeBudget) {
    return Object.freeze({
      key,
      path,
      type,
      value,
      displayValue: previewValue(value, type),
      childCount: count,
      children: Object.freeze([]),
    });
  }
  state.nodes += 1;

  const children = Object.freeze(
    childEntries(value, type).map((entry) =>
      buildNode(entry.key, `${path}/${entry.key}`, entry.value, depth + 1, state),
    ),
  );
  return Object.freeze({
    key,
    path,
    type,
    value,
    displayValue: previewValue(value, type),
    childCount: count,
    children,
  });
}

export function buildStructuredTree(value: unknown, rootKey = "$"): StructuredTree {
  const state = { nodes: 0 };
  const root = buildNode(rootKey, rootKey, value, 0, state);
  return Object.freeze({ root, nodeCount: state.nodes, depth: maxDepth(root) });
}

function maxDepth(node: StructuredTreeNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(maxDepth));
}

export function formatJsonPath(path: string): string {
  if (path === "$") return "$";
  const segments = path.split("/").slice(1);
  const parts = segments.map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`));
  return `$${parts.join("")}`;
}

export function parseStructuredValue(
  parser: "json" | "yaml" | "toml",
  content: string,
  jsonLines = false,
): unknown {
  if (parser === "json" && jsonLines) {
    return content
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
  if (parser === "json") return JSON.parse(content);
  if (parser === "yaml") return parseYamlSafe(content);
  return parseTomlSafe(content);
}
