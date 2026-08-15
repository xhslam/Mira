import { stringify as stringifyToml } from "smol-toml";
import { stringify as stringifyYaml } from "yaml";

import { parseStructuredValue } from "./tree";

export function formatStructuredDocument(
  format: "json" | "yaml" | "toml",
  content: string,
  jsonLines = false,
): string {
  const value = parseStructuredValue(format, content, jsonLines);
  if (format === "json" && jsonLines) {
    if (!Array.isArray(value)) throw new Error("JSON Lines must contain one value per line");
    return `${value.map((item) => JSON.stringify(item)).join("\n")}\n`;
  }
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (format === "yaml") return stringifyYaml(value, { indent: 2, lineWidth: 0 });
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("TOML root must be a table");
  }
  return stringifyToml(value as Record<string, unknown>);
}
