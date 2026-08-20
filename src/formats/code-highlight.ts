export type HighlightedCodePart = Readonly<{
  text: string;
  classes: string;
  lineBreak: boolean;
}>;

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  golang: "go",
  sh: "shell",
  bash: "shell",
  rb: "ruby",
});

const KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  typescript: Object.freeze([
    "as",
    "async",
    "await",
    "class",
    "const",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "for",
    "from",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "interface",
    "let",
    "new",
    "null",
    "private",
    "protected",
    "public",
    "readonly",
    "return",
    "static",
    "true",
    "type",
    "typeof",
    "undefined",
    "while",
  ]),
  javascript: Object.freeze([
    "async",
    "await",
    "class",
    "const",
    "else",
    "export",
    "extends",
    "false",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "return",
    "static",
    "true",
    "typeof",
    "undefined",
    "var",
    "while",
  ]),
  python: Object.freeze([
    "and",
    "as",
    "async",
    "await",
    "class",
    "def",
    "elif",
    "else",
    "False",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "None",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "True",
    "while",
    "with",
    "yield",
  ]),
  rust: Object.freeze([
    "as",
    "async",
    "await",
    "const",
    "crate",
    "else",
    "enum",
    "false",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "Self",
    "static",
    "struct",
    "super",
    "trait",
    "true",
    "type",
    "unsafe",
    "use",
    "where",
    "while",
  ]),
  go: Object.freeze([
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "goto",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
  ]),
  css: Object.freeze(["important"]),
  shell: Object.freeze([
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "then",
    "until",
    "while",
  ]),
  ruby: Object.freeze([
    "begin",
    "case",
    "class",
    "def",
    "do",
    "else",
    "elsif",
    "end",
    "ensure",
    "false",
    "for",
    "if",
    "in",
    "module",
    "nil",
    "return",
    "self",
    "then",
    "true",
    "unless",
    "until",
    "when",
    "while",
    "yield",
  ]),
  lua: Object.freeze([
    "and",
    "break",
    "do",
    "else",
    "elseif",
    "end",
    "false",
    "for",
    "function",
    "goto",
    "if",
    "in",
    "local",
    "nil",
    "not",
    "or",
    "repeat",
    "return",
    "then",
    "true",
    "until",
    "while",
  ]),
});

function tokenClass(token: string, language: string): string {
  if (/^(?:\/\/|\/\*|#|--)/.test(token)) return "tok-comment";
  if (/^["'`]/.test(token)) return "tok-string";
  if (/^(?:0x[\da-f]+|\d)/i.test(token)) return "tok-number";
  return KEYWORDS[language]?.includes(token) ? "tok-keyword" : "";
}

export function highlightCodeParts(
  source: string,
  languageName: string,
): readonly HighlightedCodePart[] {
  const requested = languageName.trim().toLowerCase();
  const language = LANGUAGE_ALIASES[requested] ?? requested;
  if (!(language in KEYWORDS)) {
    return Object.freeze([Object.freeze({ text: source, classes: "", lineBreak: false })]);
  }
  const parts: HighlightedCodePart[] = [];
  const tokenPattern =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|0x[\da-f]+|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;
  let cursor = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      const text = source.slice(cursor, index);
      parts.push(Object.freeze({ text, classes: "", lineBreak: text.includes("\n") }));
    }
    const text = match[0];
    parts.push(
      Object.freeze({ text, classes: tokenClass(text, language), lineBreak: text.includes("\n") }),
    );
    cursor = index + text.length;
  }
  if (cursor < source.length) {
    const text = source.slice(cursor);
    parts.push(Object.freeze({ text, classes: "", lineBreak: text.includes("\n") }));
  }
  return Object.freeze(parts);
}

export function renderHighlightedCode(
  target: HTMLElement,
  source: string,
  languageName: string,
): void {
  target.replaceChildren();
  for (const part of highlightCodeParts(source, languageName)) {
    if (!part.classes) {
      target.append(document.createTextNode(part.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = part.classes;
    span.textContent = part.text;
    target.append(span);
  }
}
