const CJK = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}";
const LATIN_OR_NUMBER = "A-Za-z0-9";
const cjkBeforeLatin = new RegExp(`([${CJK}])([${LATIN_OR_NUMBER}])`, "gu");
const latinBeforeCjk = new RegExp(`([${LATIN_OR_NUMBER}])([${CJK}])`, "gu");

function formatPlainText(value: string): string {
  return value.replace(cjkBeforeLatin, "$1 $2").replace(latinBeforeCjk, "$1 $2");
}

function formatInlineSegments(line: string): string {
  const segments = line.split(/(`+[^`\n]*`+)/g);
  const cjkAtEnd = new RegExp(`[${CJK}]$`, "u");
  const cjkAtStart = new RegExp(`^[${CJK}]`, "u");
  return segments
    .map((segment, index) => {
      if (index % 2 === 0) return formatPlainText(segment);
      const before = segments[index - 1] ?? "";
      const after = segments[index + 1] ?? "";
      return `${cjkAtEnd.test(before) ? " " : ""}${segment}${cjkAtStart.test(after) ? " " : ""}`;
    })
    .join("");
}

export function formatCjkSpacing(markdown: string): string {
  let fence: "```" | "~~~" | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1] as "```" | "~~~" | undefined;
      if (marker) {
        fence = fence === null ? marker : fence === marker ? null : fence;
        return line;
      }
      return fence === null ? formatInlineSegments(line) : line;
    })
    .join("\n");
}
