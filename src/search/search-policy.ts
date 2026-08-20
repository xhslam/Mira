const SENSITIVE_FILE_PATTERN = /(^|\/)(\.env(?:\.|$)|[^/]+\.(?:key|pem|p12|pfx|cer|crt))$/i;

export function isSearchableWorkspacePath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return false;
  return !SENSITIVE_FILE_PATTERN.test(path);
}

export function toFtsQuery(input: string): string {
  return (
    input
      .normalize("NFKC")
      .match(/[\p{L}\p{N}_-]+/gu)
      ?.map((term) => `"${term.replaceAll('"', '""')}"*`)
      .join(" AND ") ?? ""
  );
}

export function createSearchSnippet(
  content: string,
  query: string,
  maxLength = 180,
): Readonly<{ snippet: string; line: number | null }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return Object.freeze({ snippet: "", line: null });
  const position = content.toLocaleLowerCase().indexOf(normalizedQuery);
  if (position < 0)
    return Object.freeze({ snippet: content.slice(0, maxLength).trim(), line: null });
  const lineStart = content.lastIndexOf("\n", position) + 1;
  const lineEnd = content.indexOf("\n", position);
  const line = content.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim();
  const lineNumber = content.slice(0, position).split("\n").length;
  return Object.freeze({ snippet: line.slice(0, maxLength), line: lineNumber });
}
