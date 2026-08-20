import { parseDocument } from "yaml";

import { diagnosticAt, type StructuredDiagnostic, type StructuredValidator } from "./common";

export interface YamlParseDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
}

export function collectYamlParseErrors(text: string): readonly YamlParseDiagnostic[] {
  if (text.length === 0) return Object.freeze([]);
  let doc: ReturnType<typeof parseDocument>;
  try {
    doc = parseDocument(text, { keepSourceTokens: true });
  } catch {
    return Object.freeze([
      {
        from: 0,
        to: Math.min(text.length, 1),
        severity: "error",
        message: "YAML parse failed catastrophically",
      },
    ]);
  }

  const diagnostics: YamlParseDiagnostic[] = [];
  for (const error of doc.errors) {
    const [from, to] = error.pos ?? [0, Math.min(text.length, 1)];
    diagnostics.push({
      from: Math.max(0, Math.min(from, text.length)),
      to: Math.max(0, Math.min(to, text.length)),
      severity: "error",
      message: error.message,
    });
  }
  for (const warning of doc.warnings) {
    const [from, to] = warning.pos ?? [0, Math.min(text.length, 1)];
    diagnostics.push({
      from: Math.max(0, Math.min(from, text.length)),
      to: Math.max(0, Math.min(to, text.length)),
      severity: "warning",
      message: warning.message,
    });
  }
  return Object.freeze(diagnostics);
}

export function validateYaml(content: string): readonly StructuredDiagnostic[] {
  const parseDiagnostics = collectYamlParseErrors(content);
  return Object.freeze(
    parseDiagnostics.map((diagnostic) =>
      diagnosticAt(
        content,
        diagnostic.from,
        diagnostic.to,
        diagnostic.severity,
        diagnostic.message,
      ),
    ),
  );
}

export const yamlValidator: StructuredValidator = (content) => validateYaml(content);

export function parseYamlSafe(content: string): unknown {
  const doc = parseDocument(content, { keepSourceTokens: false });
  if (doc.errors.length > 0) {
    const message = doc.errors[0]?.message ?? "YAML parse error";
    throw new Error(message);
  }
  return doc.toJS();
}
