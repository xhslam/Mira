import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage, type Language } from "@codemirror/language";
import { go } from "@codemirror/legacy-modes/mode/go";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { shell } from "@codemirror/legacy-modes/mode/shell";

export type CodeLanguageId =
  "typescript" | "javascript" | "python" | "rust" | "go" | "css" | "shell" | "ruby" | "lua";

export function codeLanguageIdForPath(path: string): CodeLanguageId | null {
  const extension = path.toLowerCase().split(".").at(-1);
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "js" || extension === "jsx") return "javascript";
  if (extension === "py") return "python";
  if (extension === "rs") return "rust";
  if (extension === "go") return "go";
  if (extension === "css") return "css";
  if (extension === "sh" || extension === "bash") return "shell";
  if (extension === "rb") return "ruby";
  if (extension === "lua") return "lua";
  return null;
}

export function codeLanguageForPath(path: string): Language | null {
  const id = codeLanguageIdForPath(path);
  return codeLanguageForId(id, path);
}

export function codeLanguageIdForName(name: string): CodeLanguageId | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "ts" || normalized === "typescript" || normalized === "tsx") {
    return "typescript";
  }
  if (normalized === "js" || normalized === "javascript" || normalized === "jsx") {
    return "javascript";
  }
  if (normalized === "py" || normalized === "python") return "python";
  if (normalized === "rs" || normalized === "rust") return "rust";
  if (normalized === "go" || normalized === "golang") return "go";
  if (normalized === "css") return "css";
  if (normalized === "sh" || normalized === "bash" || normalized === "shell") return "shell";
  if (normalized === "rb" || normalized === "ruby") return "ruby";
  if (normalized === "lua") return "lua";
  return null;
}

export function codeLanguageForName(name: string): Language | null {
  return codeLanguageForId(codeLanguageIdForName(name), name);
}

function codeLanguageForId(id: CodeLanguageId | null, path: string): Language | null {
  if (id === "typescript") {
    return javascript({
      typescript: true,
      jsx: path.toLowerCase().endsWith(".tsx") || path.toLowerCase() === "tsx",
    }).language;
  }
  if (id === "javascript") {
    return javascript({
      jsx: path.toLowerCase().endsWith(".jsx") || path.toLowerCase() === "jsx",
    }).language;
  }
  if (id === "python") return python().language;
  if (id === "rust") return rust().language;
  if (id === "css") return css().language;
  const stream =
    id === "go" ? go : id === "shell" ? shell : id === "ruby" ? ruby : id === "lua" ? lua : null;
  return stream === null ? null : StreamLanguage.define(stream);
}
