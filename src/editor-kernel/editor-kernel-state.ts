export type MarkdownBlockRange = Readonly<{
  from: number;
  to: number;
  markdown: string;
}>;

export type MarkdownOutlineItem = Readonly<{
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  offset: number;
}>;

export type MarkdownTextCount = Readonly<{
  words: number;
  characters: number;
}>;

export type MarkdownCursorPosition = Readonly<{
  line: number;
  column: number;
  offset: number;
}>;

type SourceLine = Readonly<{
  text: string;
  from: number;
  to: number;
}>;

function sourceLines(markdown: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  for (const text of markdown.split("\n")) {
    const to = from + text.length;
    lines.push(Object.freeze({ text, from, to }));
    from = to + 1;
  }
  return Object.freeze(lines);
}

function lineIndexAt(lines: readonly SourceLine[], offset: number): number {
  const safeOffset = Math.max(0, Math.min(offset, lines.at(-1)?.to ?? 0));
  const index = lines.findIndex((line) => safeOffset <= line.to);
  return index < 0 ? Math.max(0, lines.length - 1) : index;
}

function lineKind(line: string): "heading" | "list" | "quote" | "other" {
  if (/^#{1,6}\s/.test(line)) return "heading";
  if (/^(?:[-*+]\s|\d+[.)]\s)/.test(line)) return "list";
  if (/^>/.test(line)) return "quote";
  return "other";
}

function fencedRange(
  lines: readonly SourceLine[],
  activeIndex: number,
): readonly [number, number] | null {
  let opening = -1;
  for (let index = 0; index <= activeIndex; index += 1) {
    if (lines[index]?.text.startsWith("```")) {
      opening = opening < 0 ? index : -1;
    }
  }
  if (opening < 0) return null;

  for (let index = opening + 1; index < lines.length; index += 1) {
    if (lines[index]?.text.startsWith("```")) return Object.freeze([opening, index]);
  }
  return Object.freeze([opening, lines.length - 1]);
}

export function findMarkdownBlockRange(markdown: string, offset: number): MarkdownBlockRange {
  const lines = sourceLines(markdown);
  if (lines.length === 0) return Object.freeze({ from: 0, to: 0, markdown: "" });
  const activeIndex = lineIndexAt(lines, offset);
  const active = lines[activeIndex];
  if (!active) return Object.freeze({ from: 0, to: 0, markdown: "" });
  const fenced = fencedRange(lines, activeIndex);
  if (fenced) {
    const first = lines[fenced[0]];
    const last = lines[fenced[1]];
    if (!first || !last)
      return Object.freeze({ from: active.from, to: active.to, markdown: active.text });
    return Object.freeze({
      from: first.from,
      to: last.to,
      markdown: markdown.slice(first.from, last.to),
    });
  }

  if (active.text.trim().length === 0) {
    return Object.freeze({ from: active.from, to: active.to, markdown: "" });
  }

  const kind = lineKind(active.text);
  if (kind === "heading") {
    return Object.freeze({ from: active.from, to: active.to, markdown: active.text });
  }

  let firstIndex = activeIndex;
  let lastIndex = activeIndex;
  while (firstIndex > 0) {
    const previous = lines[firstIndex - 1];
    if (!previous || previous.text.trim().length === 0 || lineKind(previous.text) !== kind) break;
    firstIndex -= 1;
  }
  while (lastIndex < lines.length - 1) {
    const next = lines[lastIndex + 1];
    if (!next || next.text.trim().length === 0 || lineKind(next.text) !== kind) break;
    lastIndex += 1;
  }

  const first = lines[firstIndex] ?? active;
  const last = lines[lastIndex] ?? active;
  return Object.freeze({
    from: first.from,
    to: last.to,
    markdown: markdown.slice(first.from, last.to),
  });
}

export function extractMarkdownOutline(markdown: string): readonly MarkdownOutlineItem[] {
  const outline: MarkdownOutlineItem[] = [];
  let inFence = false;
  for (const line of sourceLines(markdown)) {
    if (line.text.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.text);
    if (!match) continue;
    outline.push(
      Object.freeze({
        level: (match[1]?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
        text: match[2] ?? "",
        offset: line.from,
      }),
    );
  }
  return Object.freeze(outline);
}

export function countMarkdownText(markdown: string): MarkdownTextCount {
  const text = markdown
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[`*_~=\[\]()<>{}]/g, "");
  const latinWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const cjkCharacters =
    text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const nonCjkWords = latinWords.filter(
    (word) =>
      !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word),
  );
  return Object.freeze({
    words: nonCjkWords.length + cjkCharacters.length,
    characters: text.replace(/\s/gu, "").length,
  });
}

export function markdownCursorPosition(markdown: string, offset: number): MarkdownCursorPosition {
  const safeOffset = Math.max(0, Math.min(offset, markdown.length));
  const before = markdown.slice(0, safeOffset);
  const lines = before.split("\n");
  return Object.freeze({
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    offset: safeOffset,
  });
}

function renderedText(source: string): string {
  return source
    .replace(/^---\s*[\s\S]*?\n---\s*$/u, "frontmatter")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s+|\d+[.)]\s+|[-*+]\s+\[[ xX]\])\s*/gmu, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_match, target, label) => label ?? target)
    .replace(/[`*_~=]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function renderedBlockMarkdownOffset(
  markdown: string,
  blockText: string,
  preferredOffset: number,
): number {
  const target = blockText.replace(/\s+/gu, " ").trim();
  if (!target) return Math.max(0, Math.min(preferredOffset, markdown.length));
  const candidates: Readonly<{ from: number; distance: number }>[] = [];
  let from = 0;
  for (const match of markdown.matchAll(/(?:^|\n\n+)([\s\S]*?)(?=\n\n+|$)/g)) {
    const raw = match[1] ?? "";
    const prefixLength = match[0].length - raw.length;
    const blockFrom = (match.index ?? from) + prefixLength;
    const plain = renderedText(raw);
    if (plain.includes(target) || target.includes(plain)) {
      candidates.push(
        Object.freeze({ from: blockFrom, distance: Math.abs(blockFrom - preferredOffset) }),
      );
    }
    from = blockFrom + raw.length;
  }
  return (
    [...candidates].sort((left, right) => left.distance - right.distance)[0]?.from ??
    Math.max(0, Math.min(preferredOffset, markdown.length))
  );
}
