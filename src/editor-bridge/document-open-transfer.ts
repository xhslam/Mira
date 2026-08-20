import { failure, type Result, success } from "../domain/result";
import type { EditorMode } from "../session/document-session";
import {
  EDITOR_PROTOCOL_VERSION,
  MAX_EDITOR_DOCUMENT_BYTES,
  MAX_EDITOR_MARKDOWN_BYTES,
  parseEditorMessage,
  type EditorDocumentOpenBeginMessage,
  type EditorDocumentOpenChunkMessage,
  type EditorDocumentOpenCommitMessage,
  type EditorDocumentOpenMessage,
  type EditorMessage,
  type EditorSelection,
} from "./editor-message";
import {
  createEditorDocumentOpenMessage,
  type EditorEnvelopeInput,
} from "./editor-message-builder";

export type DocumentOpenTransferError = Readonly<{
  code:
    | "DOCUMENT_TOO_LARGE"
    | "INVALID_TRANSFER"
    | "IDENTITY_MISMATCH"
    | "REVISION_MISMATCH"
    | "SIZE_MISMATCH";
}>;

function transferFailure(
  code: DocumentOpenTransferError["code"],
): Result<never, DocumentOpenTransferError> {
  return failure(Object.freeze({ code }));
}

function splitUtf8(content: string): readonly string[] {
  const bytes = new TextEncoder().encode(content);
  const decoder = new TextDecoder();
  const chunkByteLimit = MAX_EDITOR_MARKDOWN_BYTES - 4;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkByteLimit) {
    const end = Math.min(bytes.length, offset + chunkByteLimit);
    const chunk = decoder.decode(bytes.slice(offset, end), { stream: end < bytes.length });
    if (chunk.length > 0) chunks.push(chunk);
  }
  const tail = decoder.decode();
  if (tail.length > 0) chunks.push(tail);
  return Object.freeze(chunks);
}

export function createDocumentOpenTransfer(
  input: EditorEnvelopeInput &
    Readonly<{
      revision: number;
      content: string;
      view: EditorMode;
      selection: EditorSelection;
    }>,
): Result<readonly EditorMessage[], DocumentOpenTransferError> {
  const totalBytes = new TextEncoder().encode(input.content).byteLength;
  if (totalBytes > MAX_EDITOR_DOCUMENT_BYTES) return transferFailure("DOCUMENT_TOO_LARGE");
  if (totalBytes <= MAX_EDITOR_MARKDOWN_BYTES) {
    return success(Object.freeze([createEditorDocumentOpenMessage(input)]));
  }

  const chunks = splitUtf8(input.content);
  const envelope = Object.freeze({
    protocolVersion: EDITOR_PROTOCOL_VERSION,
    sessionId: input.sessionId as EditorDocumentOpenMessage["sessionId"],
    documentId: input.documentId as EditorDocumentOpenMessage["documentId"],
  });
  const begin: EditorDocumentOpenBeginMessage = Object.freeze({
    ...envelope,
    type: "document.open.begin",
    revision: input.revision,
    totalBytes,
    chunkCount: chunks.length,
    view: input.view,
    selection: Object.freeze({ ...input.selection }),
  });
  const messages: readonly EditorMessage[] = Object.freeze([
    begin,
    ...chunks.map((content, index): EditorDocumentOpenChunkMessage =>
      Object.freeze({
        ...envelope,
        type: "document.open.chunk",
        revision: input.revision,
        index,
        content,
      }),
    ),
    Object.freeze({
      ...envelope,
      type: "document.open.commit",
      revision: input.revision,
    } satisfies EditorDocumentOpenCommitMessage),
  ]);
  return success(messages);
}

export function assembleDocumentOpenTransfer(
  inputs: readonly unknown[],
): Result<EditorDocumentOpenMessage, DocumentOpenTransferError> {
  const parsed = inputs.map(parseEditorMessage);
  if (parsed.some((result) => !result.ok)) return transferFailure("INVALID_TRANSFER");
  const messages = parsed.flatMap((result) => (result.ok ? [result.value] : []));
  if (messages.length === 1 && messages[0]?.type === "document.open") {
    return success(messages[0]);
  }
  const begin = messages[0];
  const commit = messages.at(-1);
  if (begin?.type !== "document.open.begin" || commit?.type !== "document.open.commit") {
    return transferFailure("INVALID_TRANSFER");
  }
  const chunks = messages.slice(1, -1);
  if (
    chunks.length !== begin.chunkCount ||
    chunks.some((message) => message.type !== "document.open.chunk")
  ) {
    return transferFailure("INVALID_TRANSFER");
  }
  for (const [index, message] of chunks.entries()) {
    if (message.type !== "document.open.chunk" || message.index !== index) {
      return transferFailure("INVALID_TRANSFER");
    }
    if (message.sessionId !== begin.sessionId || message.documentId !== begin.documentId) {
      return transferFailure("IDENTITY_MISMATCH");
    }
    if (message.revision !== begin.revision) return transferFailure("REVISION_MISMATCH");
  }
  if (commit.sessionId !== begin.sessionId || commit.documentId !== begin.documentId) {
    return transferFailure("IDENTITY_MISMATCH");
  }
  if (commit.revision !== begin.revision) return transferFailure("REVISION_MISMATCH");
  const content = chunks
    .flatMap((message) => (message.type === "document.open.chunk" ? [message.content] : []))
    .join("");
  if (new TextEncoder().encode(content).byteLength !== begin.totalBytes) {
    return transferFailure("SIZE_MISMATCH");
  }
  return success(
    Object.freeze({
      protocolVersion: EDITOR_PROTOCOL_VERSION,
      type: "document.open",
      sessionId: begin.sessionId,
      documentId: begin.documentId,
      revision: begin.revision,
      content,
      view: begin.view,
      selection: Object.freeze({ ...begin.selection }),
    }),
  );
}
