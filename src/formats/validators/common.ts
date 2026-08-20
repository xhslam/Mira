import type { EditorDiagnostic } from "../../editor-bridge/editor-message";

export type { EditorDiagnostic };

export type StructuredDiagnostic = Readonly<{
  from: number;
  to: number;
  severity: EditorDiagnostic["severity"];
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}>;

export type StructuredValidator = (
  content: string,
  path?: string,
) => readonly StructuredDiagnostic[];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function offsetToPosition(
  content: string,
  offset: number,
): Readonly<{ line: number; column: number }> {
  const limit = Math.max(0, Math.min(offset, content.length));
  let line = 1;
  let column = 1;
  for (let index = 0; index < limit; index += 1) {
    if (content[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return Object.freeze({ line, column });
}

export function positionToOffset(content: string, line: number, column: number): number {
  const lines = content.split(/\r?\n/);
  const safeLine = Math.max(1, Math.min(line, lines.length));
  let offset = 0;
  for (let index = 0; index < safeLine - 1; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return offset + Math.max(0, column - 1);
}

export function diagnosticAt(
  content: string,
  from: number,
  to: number,
  severity: EditorDiagnostic["severity"],
  message: string,
): StructuredDiagnostic {
  const start = Math.max(0, Math.min(from, content.length));
  const end = Math.max(start, Math.min(to, content.length));
  const { line, column } = offsetToPosition(content, start);
  const endPosition = offsetToPosition(content, end);
  return Object.freeze({
    from: start,
    to: end,
    severity,
    message,
    line,
    column,
    endLine: endPosition.line,
    endColumn: endPosition.column,
  });
}

export function toEditorDiagnostics(
  diagnostics: readonly StructuredDiagnostic[],
): readonly EditorDiagnostic[] {
  return Object.freeze(
    diagnostics.map((diagnostic) =>
      Object.freeze({
        from: diagnostic.from,
        to: diagnostic.to,
        severity: diagnostic.severity,
        message: diagnostic.message,
      }),
    ),
  );
}
