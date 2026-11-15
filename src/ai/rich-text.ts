import { Lexer, type Tokens } from "marked";

/** Native rendering never interprets HTML or loads remote image resources. */
export function parseRichText(content: string) {
  return Lexer.lex(content, { gfm: true });
}
export function safeRichTextUrl(source: string): string | null {
  try {
    const url = new URL(source);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Marked 18 emits a separate checkbox token; the native list already draws this marker. */
export function richListItemContent(item: Tokens.ListItem) {
  return item.tokens.filter((token) => token.type !== "checkbox");
}
