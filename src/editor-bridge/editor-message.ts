import { z } from "zod";

import {
  parseDocumentId,
  parseSessionId,
  type DocumentId,
  type SessionId,
} from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import { EDITOR_MODES, type EditorMode } from "../session/document-session";

export const EDITOR_PROTOCOL_VERSION = 1 as const;
export const MAX_EDITOR_MARKDOWN_BYTES = 2 * 1024 * 1024;

export type EditorSnapshotMessage = Readonly<{
  protocolVersion: typeof EDITOR_PROTOCOL_VERSION;
  type: "editor.snapshot";
  sessionId: SessionId;
  documentId: DocumentId;
  baseRevision: number;
  revision: number;
  mode: EditorMode;
  markdown: string;
  selection: Readonly<{ anchor: number; head: number }>;
}>;

export type EditorMessageErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_PROTOCOL"
  | "UNKNOWN_MESSAGE_TYPE"
  | "INVALID_REVISION_ORDER"
  | "PAYLOAD_TOO_LARGE";

export type EditorMessageError = Readonly<{
  code: EditorMessageErrorCode;
}>;

const selectionSchema = z
  .object({
    anchor: z.number().int().nonnegative(),
    head: z.number().int().nonnegative(),
  })
  .strict();

const editorSnapshotSchema = z
  .object({
    protocolVersion: z.literal(EDITOR_PROTOCOL_VERSION),
    type: z.literal("editor.snapshot"),
    sessionId: z.string(),
    documentId: z.string(),
    baseRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    mode: z.enum(EDITOR_MODES),
    markdown: z.string(),
    selection: selectionSchema,
  })
  .strict();

function messageFailure(code: EditorMessageErrorCode): Result<never, EditorMessageError> {
  return failure(Object.freeze({ code }));
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.values(descriptors).every((descriptor) => "value" in descriptor);
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function parseEditorMessage(
  input: unknown,
): Result<EditorSnapshotMessage, EditorMessageError> {
  try {
    if (!isPlainDataRecord(input)) {
      return messageFailure("INVALID_MESSAGE");
    }

    const selection = ownValue(input, "selection");
    if (typeof selection === "object" && selection !== null && !isPlainDataRecord(selection)) {
      return messageFailure("INVALID_MESSAGE");
    }

    const protocolVersion = ownValue(input, "protocolVersion");
    if (typeof protocolVersion === "number" && protocolVersion !== EDITOR_PROTOCOL_VERSION) {
      return messageFailure("UNSUPPORTED_PROTOCOL");
    }

    const messageType = ownValue(input, "type");
    if (typeof messageType === "string" && messageType !== "editor.snapshot") {
      return messageFailure("UNKNOWN_MESSAGE_TYPE");
    }

    const markdown = ownValue(input, "markdown");
    if (
      typeof markdown === "string" &&
      new TextEncoder().encode(markdown).byteLength > MAX_EDITOR_MARKDOWN_BYTES
    ) {
      return messageFailure("PAYLOAD_TOO_LARGE");
    }

    const parsed = editorSnapshotSchema.safeParse(input);
    if (!parsed.success) {
      return messageFailure("INVALID_MESSAGE");
    }

    if (parsed.data.revision <= parsed.data.baseRevision) {
      return messageFailure("INVALID_REVISION_ORDER");
    }

    const sessionId = parseSessionId(parsed.data.sessionId);
    const documentId = parseDocumentId(parsed.data.documentId);
    if (!sessionId.ok || !documentId.ok) {
      return messageFailure("INVALID_MESSAGE");
    }

    const message: EditorSnapshotMessage = Object.freeze({
      protocolVersion: EDITOR_PROTOCOL_VERSION,
      type: "editor.snapshot",
      sessionId: sessionId.value,
      documentId: documentId.value,
      baseRevision: parsed.data.baseRevision,
      revision: parsed.data.revision,
      mode: parsed.data.mode,
      markdown: parsed.data.markdown,
      selection: Object.freeze({
        anchor: parsed.data.selection.anchor,
        head: parsed.data.selection.head,
      }),
    });

    return success(message);
  } catch {
    return messageFailure("INVALID_MESSAGE");
  }
}
