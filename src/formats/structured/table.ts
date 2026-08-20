import { parseTomlSafe } from "../validators/toml";
import { parseYamlSafe } from "../validators/yaml";

export type StructuredTable = Readonly<{
  columns: readonly string[];
  rows: readonly Readonly<Record<string, string>>[];
  truncated: boolean;
}>;

const MAX_ROWS = 10_000;
const MAX_COLUMNS = 100;

function parseValue(
  parser: "json" | "yaml" | "toml",
  content: string,
  jsonLines: boolean,
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

function display(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

export function createStructuredTable(
  parser: "json" | "yaml" | "toml",
  content: string,
  jsonLines = false,
): StructuredTable | null {
  const value = parseValue(parser, content, jsonLines);
  if (
    !Array.isArray(value) ||
    !value.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))
  ) {
    return null;
  }
  const sourceRows = value.slice(0, MAX_ROWS) as readonly Record<string, unknown>[];
  const columns = [...new Set(sourceRows.flatMap((row) => Object.keys(row)))].slice(0, MAX_COLUMNS);
  return Object.freeze({
    columns: Object.freeze(columns),
    rows: Object.freeze(
      sourceRows.map((row) =>
        Object.freeze(Object.fromEntries(columns.map((column) => [column, display(row[column])]))),
      ),
    ),
    truncated: value.length > MAX_ROWS || columns.length >= MAX_COLUMNS,
  });
}
