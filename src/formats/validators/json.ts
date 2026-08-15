import {
  diagnosticAt,
  errorMessage,
  positionToOffset,
  type StructuredDiagnostic,
  type StructuredValidator,
} from "./common";

export function isJsonlPath(path: string | undefined): boolean {
  return Boolean(path?.toLowerCase().endsWith(".jsonl"));
}

interface JsonParseError {
  line: number;
  column: number;
  message: string;
}

function locateParseError(content: string, error: unknown): JsonParseError {
  const message = errorMessage(error);
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) {
    return {
      line: parseInt(lineColumnMatch[1] ?? "1", 10),
      column: parseInt(lineColumnMatch[2] ?? "1", 10),
      message,
    };
  }
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    const position = parseInt(positionMatch[1] ?? "0", 10);
    let line = 1;
    let column = 1;
    for (let index = 0; index < position && index < content.length; index += 1) {
      if (content[index] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column, message };
  }
  return { line: 1, column: 1, message };
}

export function validateJson(content: string, path?: string): readonly StructuredDiagnostic[] {
  if (isJsonlPath(path)) {
    const diagnostics: StructuredDiagnostic[] = [];
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index] ?? "";
      if (raw.trim().length === 0) continue;
      try {
        JSON.parse(raw);
      } catch (error) {
        const message = errorMessage(error);
        const from = positionToOffset(content, index + 1, 1);
        diagnostics.push(
          diagnosticAt(
            content,
            from,
            Math.min(from + raw.length, content.length),
            "error",
            message,
          ),
        );
      }
    }
    return Object.freeze(diagnostics);
  }

  if (content.trim().length === 0) {
    return Object.freeze([
      diagnosticAt(content, 0, Math.min(content.length, 1), "error", "Empty document"),
    ]);
  }

  try {
    JSON.parse(content);
    return Object.freeze([]);
  } catch (error) {
    const located = locateParseError(content, error);
    const from = positionToOffset(content, located.line, located.column);
    return Object.freeze([
      diagnosticAt(content, from, Math.min(from + 1, content.length), "error", located.message),
    ]);
  }
}

export const jsonValidator: StructuredValidator = (content, path) => validateJson(content, path);

export function parseJsonSafe(content: string): unknown {
  return JSON.parse(content);
}
