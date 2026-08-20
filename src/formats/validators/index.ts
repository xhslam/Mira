import type { EditorDiagnostic } from "../../editor-bridge/editor-message";
import { toEditorDiagnostics, type StructuredDiagnostic, type StructuredValidator } from "./common";
import { jsonValidator } from "./json";
import { tomlValidator } from "./toml";
import { yamlValidator } from "./yaml";

export type { StructuredDiagnostic, StructuredValidator } from "./common";
export { validateJson, jsonValidator, parseJsonSafe, isJsonlPath } from "./json";
export { validateYaml, yamlValidator, parseYamlSafe } from "./yaml";
export { validateToml, tomlValidator, parseTomlSafe } from "./toml";
export {
  diagnosticAt,
  errorMessage,
  offsetToPosition,
  positionToOffset,
  toEditorDiagnostics,
} from "./common";

const VALIDATORS: Readonly<Record<string, StructuredValidator>> = Object.freeze({
  json: jsonValidator,
  yaml: yamlValidator,
  toml: tomlValidator,
});

export function validateFormatContent(
  parser: "json" | "yaml" | "toml",
  content: string,
  path?: string,
): readonly StructuredDiagnostic[] {
  const validator = VALIDATORS[parser];
  if (!validator) return Object.freeze([]);
  return validator(content, path);
}

export function validateFormatEditorDiagnostics(
  parser: "json" | "yaml" | "toml",
  content: string,
  path?: string,
): readonly EditorDiagnostic[] {
  return toEditorDiagnostics(validateFormatContent(parser, content, path));
}
