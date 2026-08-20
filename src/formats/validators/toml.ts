import { parse as parseToml, TomlError } from "smol-toml";

import {
  diagnosticAt,
  positionToOffset,
  type StructuredDiagnostic,
  type StructuredValidator,
} from "./common";

export function validateToml(content: string): readonly StructuredDiagnostic[] {
  if (content.trim().length === 0) {
    return Object.freeze([
      diagnosticAt(content, 0, Math.min(content.length, 1), "error", "Empty document"),
    ]);
  }
  try {
    parseToml(content);
    return Object.freeze([]);
  } catch (error) {
    if (error instanceof TomlError) {
      const from = positionToOffset(content, error.line, error.column);
      return Object.freeze([
        diagnosticAt(content, from, Math.min(from + 1, content.length), "error", error.message),
      ]);
    }
    return Object.freeze([
      diagnosticAt(content, 0, Math.min(content.length, 1), "error", String(error)),
    ]);
  }
}

export const tomlValidator: StructuredValidator = (content) => validateToml(content);

export function parseTomlSafe(content: string): unknown {
  try {
    return parseToml(content);
  } catch (error) {
    if (error instanceof TomlError) throw error;
    throw new Error(String(error));
  }
}
