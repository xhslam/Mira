export const MAX_RENDERABLE_MATH_LENGTH = 16_384;

export type MathMarkdownMatch = Readonly<{
  raw: string;
  source: string;
}>;

const DISPLAY_MATH_START = /^(?:\$\$|\\{1,3}\[)/m;

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function lineEndAfter(source: string, index: number): number | null {
  let cursor = index;
  while (source[cursor] === " " || source[cursor] === "\t") cursor += 1;
  if (cursor === source.length) return cursor;
  if (source[cursor] === "\n") return cursor + 1;
  if (source[cursor] === "\r" && source[cursor + 1] === "\n") return cursor + 2;
  return null;
}

function startsLineAfterWhitespace(source: string, index: number): boolean {
  const lineStart =
    Math.max(source.lastIndexOf("\n", index - 1), source.lastIndexOf("\r", index - 1)) + 1;
  return source.slice(lineStart, index).trim().length === 0;
}

function openingDelimiterOccupiesLine(source: string, contentStart: number): boolean {
  const newline = source.indexOf("\n", contentStart);
  const carriageReturn = source.indexOf("\r", contentStart);
  const candidates = [newline, carriageReturn].filter((index) => index >= 0);
  const lineEnd = candidates.length === 0 ? source.length : Math.min(...candidates);
  return source.slice(contentStart, lineEnd).trim().length === 0 && lineEnd < source.length;
}

function exactSlashRunAt(source: string, index: number, count: number): boolean {
  if (index > 0 && source[index - 1] === "\\") return false;
  for (let offset = 0; offset < count; offset += 1) {
    if (source[index + offset] !== "\\") return false;
  }
  return source[index + count] !== "\\";
}

function slashDelimiterAt(
  source: string,
  index: number,
): Readonly<{ count: number; bracket: "(" | "[" }> | null {
  if (source[index] !== "\\" || (index > 0 && source[index - 1] === "\\")) return null;
  let count = 0;
  while (count < 3 && source[index + count] === "\\") count += 1;
  if (source[index + count] === "\\") return null;
  const bracket = source[index + count];
  return bracket === "(" || bracket === "[" ? Object.freeze({ count, bracket }) : null;
}

function trimMathSource(source: string): string {
  return source
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "")
    .trim();
}

function findBackslashBlockClose(
  source: string,
  start: number,
  slashCount: number,
  mustOccupyLine: boolean,
): Readonly<{ closeStart: number; rawEnd: number }> | null {
  const closing = `${"\\".repeat(slashCount)}]`;
  const maximum = Math.min(source.length, start + MAX_RENDERABLE_MATH_LENGTH + closing.length + 4);
  for (let cursor = start; cursor < maximum; cursor += 1) {
    if (!exactSlashRunAt(source, cursor, slashCount) || !source.startsWith(closing, cursor)) {
      continue;
    }
    if (mustOccupyLine && !startsLineAfterWhitespace(source, cursor)) continue;
    const rawEnd = lineEndAfter(source, cursor + closing.length);
    if (rawEnd !== null) return Object.freeze({ closeStart: cursor, rawEnd });
  }
  return null;
}

function tokenizeDollarBlock(source: string): MathMarkdownMatch | null {
  if (!source.startsWith("$$") || source.startsWith("$$$")) return null;
  const multiline = openingDelimiterOccupiesLine(source, 2);
  const maximum = Math.min(source.length, MAX_RENDERABLE_MATH_LENGTH + 8);
  for (let cursor = 2; cursor < maximum - 1; cursor += 1) {
    if (!source.startsWith("$$", cursor) || isEscaped(source, cursor)) continue;
    if (multiline && !startsLineAfterWhitespace(source, cursor)) continue;
    const rawEnd = lineEndAfter(source, cursor + 2);
    if (rawEnd === null) continue;
    const formula = source.slice(2, cursor);
    if (!formula.trim()) return null;
    return Object.freeze({ raw: source.slice(0, rawEnd), source: trimMathSource(formula) });
  }
  return null;
}

export function findMathBlockStart(source: string): number {
  return DISPLAY_MATH_START.exec(source)?.index ?? -1;
}

export function tokenizeMathBlock(source: string): MathMarkdownMatch | null {
  const dollar = tokenizeDollarBlock(source);
  if (dollar) return dollar;

  const opening = slashDelimiterAt(source, 0);
  if (!opening || opening.bracket !== "[") return null;
  const contentStart = opening.count + 1;
  const closing = findBackslashBlockClose(
    source,
    contentStart,
    opening.count,
    openingDelimiterOccupiesLine(source, contentStart),
  );
  if (!closing) return null;
  const formula = source.slice(contentStart, closing.closeStart);
  if (!formula.trim()) return null;
  return Object.freeze({
    raw: source.slice(0, closing.rawEnd),
    source: trimMathSource(formula),
  });
}

function validDollarClose(source: string, index: number): boolean {
  const before = source[index - 1];
  const after = source[index + 1];
  return before !== undefined && !/\s/.test(before) && (after === undefined || !/\d/.test(after));
}

function tokenizeDollarInline(source: string): MathMarkdownMatch | null {
  if (source[0] !== "$" || source[1] === "$" || source[1] === undefined || /\s/.test(source[1])) {
    return null;
  }
  const maximum = Math.min(source.length, MAX_RENDERABLE_MATH_LENGTH + 2);
  for (let cursor = 1; cursor < maximum; cursor += 1) {
    if (source[cursor] === "\n" || source[cursor] === "\r") return null;
    if (source[cursor] !== "$" || isEscaped(source, cursor) || !validDollarClose(source, cursor)) {
      continue;
    }
    const formula = source.slice(1, cursor);
    if (!formula.trim()) return null;
    return Object.freeze({ raw: source.slice(0, cursor + 1), source: formula });
  }
  return null;
}

function tokenizeBackslashInline(source: string): MathMarkdownMatch | null {
  const opening = slashDelimiterAt(source, 0);
  if (!opening) return null;
  const closingBracket = opening.bracket === "(" ? ")" : "]";
  const closing = `${"\\".repeat(opening.count)}${closingBracket}`;
  const contentStart = opening.count + 1;
  const maximum = Math.min(
    source.length,
    contentStart + MAX_RENDERABLE_MATH_LENGTH + closing.length,
  );
  for (let cursor = contentStart; cursor < maximum; cursor += 1) {
    if (source[cursor] === "\n" || source[cursor] === "\r") return null;
    if (!exactSlashRunAt(source, cursor, opening.count) || !source.startsWith(closing, cursor)) {
      continue;
    }
    const formula = source.slice(contentStart, cursor);
    if (!formula.trim()) return null;
    return Object.freeze({ raw: source.slice(0, cursor + closing.length), source: formula });
  }
  return null;
}

export function findMathInlineStart(source: string): number {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "$" && !isEscaped(source, index) && source[index + 1] !== "$") {
      return index;
    }
    if (slashDelimiterAt(source, index)) return index;
  }
  return -1;
}

export function tokenizeMathInline(source: string): MathMarkdownMatch | null {
  return tokenizeDollarInline(source) ?? tokenizeBackslashInline(source);
}

function unwrapOuterMathDelimiter(source: string): string {
  const dollar = tokenizeDollarInline(source);
  if (dollar?.raw.length === source.length) return dollar.source.trim();

  const opening = slashDelimiterAt(source, 0);
  if (!opening) return source;
  const closingBracket = opening.bracket === "(" ? ")" : "]";
  const closing = `${"\\".repeat(opening.count)}${closingBracket}`;
  if (!source.endsWith(closing)) return source;
  return source.slice(opening.count + 1, -closing.length).trim();
}

function replaceNestedMathDelimiters(source: string, opening: "(" | "["): string {
  const closing = opening === "(" ? ")" : "]";
  let result = source;
  for (let slashCount = 3; slashCount >= 1; slashCount -= 1) {
    const openToken = `${"\\".repeat(slashCount)}${opening}`;
    const closeToken = `${"\\".repeat(slashCount)}${closing}`;
    let searchFrom = 0;
    while (searchFrom < result.length) {
      const openIndex = result.indexOf(openToken, searchFrom);
      if (openIndex < 0) break;
      const closeIndex = result.indexOf(closeToken, openIndex + openToken.length);
      if (closeIndex < 0) break;
      result =
        result.slice(0, openIndex) +
        opening +
        result.slice(openIndex + openToken.length, closeIndex) +
        closing +
        result.slice(closeIndex + closeToken.length);
      searchFrom = closeIndex - openToken.length - closeToken.length + 2;
    }
  }
  return result;
}

/**
 * Repairs common provider/JSON escape layers only for rendering. The Markdown
 * node keeps the original `raw` value, so saving never rewrites user content.
 */
export function normalizeLatexForRendering(input: string): string {
  let source = unwrapOuterMathDelimiter(input.trim());
  source = source
    // A doubled slash before a multi-letter TeX command is a common JSON/model
    // escape layer. Keep `\\\\b`-style matrix row breaks followed by a
    // one-letter cell intact; that sequence is otherwise ambiguous.
    .replace(/\\\\(?=[A-Za-z]{2}|[,;:!])/g, "\\")
    .replace(/\\([_^])/g, "$1")
    // Model responses occasionally leak Markdown headings/setext separators
    // into an otherwise valid display formula. These line-level tokens are
    // invalid TeX; clean only the render copy and retain the raw note verbatim.
    .replace(/^[\t ]*(?:={3,}|-{3,})[\t ]*$/gm, "")
    .replace(/^[\t ]{0,3}#{1,6}[\t ]+/gm, "");
  source = replaceNestedMathDelimiters(source, "[");
  source = replaceNestedMathDelimiters(source, "(");
  return source.trim();
}
