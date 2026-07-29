import { failure, type Result, success } from "../domain/result";

export type SourceLineEnding = "\r\n" | "\n" | "\r" | "mixed" | null;

export type SourceDocument = Readonly<{
  originalBytes: readonly number[];
  markdown: string;
  lineEnding: SourceLineEnding;
  hasFinalNewline: boolean;
  contentHash: string;
}>;

export type SourceDocumentError = Readonly<{
  code: "INVALID_BYTES" | "INVALID_UTF8" | "HASH_FAILED";
}>;

export type HashSourceBytes = (bytes: Uint8Array) => Promise<string>;

function sourceFailure(code: SourceDocumentError["code"]): Result<never, SourceDocumentError> {
  return failure(Object.freeze({ code }));
}

function detectLineEnding(markdown: string): SourceLineEnding {
  const hasCrLf = markdown.includes("\r\n");
  const withoutCrLf = markdown.replaceAll("\r\n", "");
  const hasLf = withoutCrLf.includes("\n");
  const hasCr = withoutCrLf.includes("\r");
  const detectedCount = Number(hasCrLf) + Number(hasLf) + Number(hasCr);

  if (detectedCount === 0) {
    return null;
  }
  if (detectedCount > 1) {
    return "mixed";
  }
  if (hasCrLf) {
    return "\r\n";
  }
  return hasLf ? "\n" : "\r";
}

export async function openSourceDocument(
  input: Uint8Array,
  hashBytes: HashSourceBytes,
): Promise<Result<SourceDocument, SourceDocumentError>> {
  if (!(input instanceof Uint8Array)) {
    return sourceFailure("INVALID_BYTES");
  }

  const ownedBytes = Uint8Array.from(input);
  let markdown: string;
  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(ownedBytes);
  } catch {
    return sourceFailure("INVALID_UTF8");
  }

  let contentHash: string;
  try {
    contentHash = await hashBytes(Uint8Array.from(ownedBytes));
    if (contentHash.length === 0) {
      return sourceFailure("HASH_FAILED");
    }
  } catch {
    return sourceFailure("HASH_FAILED");
  }

  const document: SourceDocument = Object.freeze({
    originalBytes: Object.freeze(Array.from(ownedBytes)),
    markdown,
    lineEnding: detectLineEnding(markdown),
    hasFinalNewline:
      markdown.endsWith("\r\n") || markdown.endsWith("\n") || markdown.endsWith("\r"),
    contentHash,
  });

  return success(document);
}

export function serializeSourceDocument(
  document: SourceDocument,
  replacement?: string,
): Uint8Array {
  return replacement === undefined
    ? Uint8Array.from(document.originalBytes)
    : new TextEncoder().encode(replacement);
}
