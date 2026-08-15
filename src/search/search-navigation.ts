export type SearchSelection = Readonly<{ anchor: number; head: number }>;

export function selectionForSearchLine(content: string, line: number | null): SearchSelection {
  if (line === null || !Number.isSafeInteger(line) || line <= 1) {
    return Object.freeze({ anchor: 0, head: 0 });
  }
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < content.length) {
    const next = content.indexOf("\n", offset);
    if (next < 0) return Object.freeze({ anchor: content.length, head: content.length });
    offset = next + 1;
    currentLine += 1;
  }
  const end = content.indexOf("\n", offset);
  const head = end < 0 ? content.length : end;
  return Object.freeze({ anchor: offset, head });
}
