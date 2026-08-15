import { z } from "zod";

import {
  parseDocumentId,
  parseSessionId,
  type DocumentId,
  type SessionId,
} from "../domain/identifiers";
import { failure, type Result, success } from "../domain/result";
import { EDITOR_MODES, type EditorMode } from "../session/document-session";
import type { TextChange } from "./text-change";

export const EDITOR_PROTOCOL_VERSION = 1 as const;
export const MAX_EDITOR_MARKDOWN_BYTES = 2 * 1024 * 1024;
export const MAX_EDITOR_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EDITOR_CHANGE_COUNT = 1_000;

export type EditorSelection = Readonly<{
  anchor: number;
  head: number;
}>;

type EditorEnvelope = Readonly<{
  protocolVersion: typeof EDITOR_PROTOCOL_VERSION;
  sessionId: SessionId;
  documentId: DocumentId;
}>;

export type EditorReadyMessage = EditorEnvelope &
  Readonly<{
    type: "editor.ready";
  }>;

export type EditorSnapshotMessage = Readonly<{
  protocolVersion: typeof EDITOR_PROTOCOL_VERSION;
  type: "editor.snapshot";
  sessionId: SessionId;
  documentId: DocumentId;
  baseRevision: number;
  revision: number;
  mode: EditorMode;
  markdown: string;
  selection: EditorSelection;
}>;

export type EditorChangeMessage = Readonly<{
  protocolVersion: typeof EDITOR_PROTOCOL_VERSION;
  type: "document.change";
  sessionId: SessionId;
  documentId: DocumentId;
  baseRevision: number;
  revision: number;
  mode: EditorMode;
  changes: readonly TextChange[];
  selection: EditorSelection;
}>;

export type EditorDocumentOpenMessage = EditorEnvelope &
  Readonly<{
    type: "document.open";
    revision: number;
    content: string;
    view: EditorMode;
    selection: EditorSelection;
  }>;

export type EditorDocumentOpenBeginMessage = EditorEnvelope &
  Readonly<{
    type: "document.open.begin";
    revision: number;
    totalBytes: number;
    chunkCount: number;
    view: EditorMode;
    selection: EditorSelection;
  }>;

export type EditorDocumentOpenChunkMessage = EditorEnvelope &
  Readonly<{
    type: "document.open.chunk";
    revision: number;
    index: number;
    content: string;
  }>;

export type EditorDocumentOpenCommitMessage = EditorEnvelope &
  Readonly<{
    type: "document.open.commit";
    revision: number;
  }>;

export type EditorSaveRequestedMessage = EditorEnvelope &
  Readonly<{
    type: "document.saveRequested";
    revision: number;
    requestId: number;
  }>;

export type EditorSavedMessage = EditorEnvelope &
  Readonly<{
    type: "document.saved";
    revision: number;
    contentHash: string;
  }>;

export type EditorSelectionChangeMessage = EditorEnvelope &
  Readonly<{
    type: "selection.change";
    revision: number;
    ranges: readonly EditorSelection[];
  }>;

export type EditorDiagnostic = Readonly<{
  from: number;
  to: number;
  severity: "info" | "warning" | "error";
  message: string;
}>;

export type EditorDiagnosticsUpdateMessage = EditorEnvelope &
  Readonly<{
    type: "diagnostics.update";
    revision: number;
    items: readonly EditorDiagnostic[];
  }>;

export type EditorEditMessage = EditorSnapshotMessage | EditorChangeMessage;

export type EditorMessage =
  | EditorReadyMessage
  | EditorDocumentOpenMessage
  | EditorDocumentOpenBeginMessage
  | EditorDocumentOpenChunkMessage
  | EditorDocumentOpenCommitMessage
  | EditorEditMessage
  | EditorSaveRequestedMessage
  | EditorSavedMessage
  | EditorSelectionChangeMessage
  | EditorDiagnosticsUpdateMessage;

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

const envelopeSchema = {
  protocolVersion: z.literal(EDITOR_PROTOCOL_VERSION),
  sessionId: z.string(),
  documentId: z.string(),
} as const;

const editorReadySchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("editor.ready"),
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

const textChangeSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    insert: z.string(),
  })
  .strict()
  .refine((change) => change.from <= change.to);

const editorChangeSchema = z
  .object({
    protocolVersion: z.literal(EDITOR_PROTOCOL_VERSION),
    type: z.literal("document.change"),
    sessionId: z.string(),
    documentId: z.string(),
    baseRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    mode: z.enum(EDITOR_MODES),
    changes: z.array(textChangeSchema).min(1).max(MAX_EDITOR_CHANGE_COUNT),
    selection: selectionSchema,
  })
  .strict();

const editorDocumentOpenSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.open"),
    revision: z.number().int().nonnegative(),
    content: z.string(),
    view: z.enum(EDITOR_MODES),
    selection: selectionSchema,
  })
  .strict();

const editorDocumentOpenBeginSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.open.begin"),
    revision: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative().max(MAX_EDITOR_DOCUMENT_BYTES),
    chunkCount: z.number().int().positive().max(64),
    view: z.enum(EDITOR_MODES),
    selection: selectionSchema,
  })
  .strict();

const editorDocumentOpenChunkSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.open.chunk"),
    revision: z.number().int().nonnegative(),
    index: z.number().int().nonnegative().max(63),
    content: z.string(),
  })
  .strict();

const editorDocumentOpenCommitSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.open.commit"),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const editorSaveRequestedSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.saveRequested"),
    revision: z.number().int().nonnegative(),
    requestId: z.number().int().positive(),
  })
  .strict();

const editorSavedSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("document.saved"),
    revision: z.number().int().nonnegative(),
    contentHash: z.string().min(1).max(256),
  })
  .strict();

const editorSelectionChangeSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("selection.change"),
    revision: z.number().int().nonnegative(),
    ranges: z.array(selectionSchema).min(1).max(MAX_EDITOR_CHANGE_COUNT),
  })
  .strict();

const diagnosticSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1).max(4_096),
  })
  .strict()
  .refine((diagnostic) => diagnostic.from <= diagnostic.to);

const editorDiagnosticsUpdateSchema = z
  .object({
    ...envelopeSchema,
    type: z.literal("diagnostics.update"),
    revision: z.number().int().nonnegative(),
    items: z.array(diagnosticSchema).max(MAX_EDITOR_CHANGE_COUNT),
  })
  .strict();

const editorMessageSchema = z.discriminatedUnion("type", [
  editorReadySchema,
  editorDocumentOpenSchema,
  editorDocumentOpenBeginSchema,
  editorDocumentOpenChunkSchema,
  editorDocumentOpenCommitSchema,
  editorSnapshotSchema,
  editorChangeSchema,
  editorSaveRequestedSchema,
  editorSavedSchema,
  editorSelectionChangeSchema,
  editorDiagnosticsUpdateSchema,
]);

const EDITOR_MESSAGE_TYPES = Object.freeze([
  "editor.ready",
  "document.open",
  "document.open.begin",
  "document.open.chunk",
  "document.open.commit",
  "editor.snapshot",
  "document.change",
  "document.saveRequested",
  "document.saved",
  "selection.change",
  "diagnostics.update",
] as const);

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

export function parseEditorMessage(input: unknown): Result<EditorMessage, EditorMessageError> {
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
    if (
      typeof messageType === "string" &&
      !EDITOR_MESSAGE_TYPES.some((supportedType) => supportedType === messageType)
    ) {
      return messageFailure("UNKNOWN_MESSAGE_TYPE");
    }

    const markdown = ownValue(input, "markdown");
    if (
      typeof markdown === "string" &&
      new TextEncoder().encode(markdown).byteLength > MAX_EDITOR_MARKDOWN_BYTES
    ) {
      return messageFailure("PAYLOAD_TOO_LARGE");
    }

    const content = ownValue(input, "content");
    if (
      typeof content === "string" &&
      new TextEncoder().encode(content).byteLength > MAX_EDITOR_MARKDOWN_BYTES
    ) {
      return messageFailure("PAYLOAD_TOO_LARGE");
    }

    const changes = ownValue(input, "changes");
    if (Array.isArray(changes)) {
      let insertedBytes = 0;
      for (const change of changes) {
        if (!isPlainDataRecord(change)) return messageFailure("INVALID_MESSAGE");
        const insert = ownValue(change, "insert");
        if (typeof insert === "string") {
          insertedBytes += new TextEncoder().encode(insert).byteLength;
          if (insertedBytes > MAX_EDITOR_MARKDOWN_BYTES) {
            return messageFailure("PAYLOAD_TOO_LARGE");
          }
        }
      }
    }

    for (const key of ["ranges", "items"] as const) {
      const values = ownValue(input, key);
      if (Array.isArray(values) && values.some((value) => !isPlainDataRecord(value))) {
        return messageFailure("INVALID_MESSAGE");
      }
    }

    const diagnostics = ownValue(input, "items");
    if (Array.isArray(diagnostics)) {
      let diagnosticBytes = 0;
      for (const diagnostic of diagnostics) {
        if (!isPlainDataRecord(diagnostic)) return messageFailure("INVALID_MESSAGE");
        const message = ownValue(diagnostic, "message");
        if (typeof message === "string") {
          diagnosticBytes += new TextEncoder().encode(message).byteLength;
          if (diagnosticBytes > MAX_EDITOR_MARKDOWN_BYTES) {
            return messageFailure("PAYLOAD_TOO_LARGE");
          }
        }
      }
    }

    const parsed = editorMessageSchema.safeParse(input);
    if (!parsed.success) {
      return messageFailure("INVALID_MESSAGE");
    }

    if (
      (parsed.data.type === "editor.snapshot" || parsed.data.type === "document.change") &&
      parsed.data.revision <= parsed.data.baseRevision
    ) {
      return messageFailure("INVALID_REVISION_ORDER");
    }

    const sessionId = parseSessionId(parsed.data.sessionId);
    const documentId = parseDocumentId(parsed.data.documentId);
    if (!sessionId.ok || !documentId.ok) {
      return messageFailure("INVALID_MESSAGE");
    }

    const envelope = {
      protocolVersion: EDITOR_PROTOCOL_VERSION,
      sessionId: sessionId.value,
      documentId: documentId.value,
    } as const;
    const data = parsed.data;
    let message: EditorMessage;
    switch (data.type) {
      case "editor.ready":
        message = Object.freeze({ ...envelope, type: data.type });
        break;
      case "document.open":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          content: data.content,
          view: data.view,
          selection: Object.freeze({ ...data.selection }),
        });
        break;
      case "document.open.begin":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          totalBytes: data.totalBytes,
          chunkCount: data.chunkCount,
          view: data.view,
          selection: Object.freeze({ ...data.selection }),
        });
        break;
      case "document.open.chunk":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          index: data.index,
          content: data.content,
        });
        break;
      case "document.open.commit":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
        });
        break;
      case "editor.snapshot":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          baseRevision: data.baseRevision,
          revision: data.revision,
          mode: data.mode,
          markdown: data.markdown,
          selection: Object.freeze({ ...data.selection }),
        });
        break;
      case "document.change":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          baseRevision: data.baseRevision,
          revision: data.revision,
          mode: data.mode,
          changes: Object.freeze(data.changes.map((change) => Object.freeze({ ...change }))),
          selection: Object.freeze({ ...data.selection }),
        });
        break;
      case "document.saveRequested":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          requestId: data.requestId,
        });
        break;
      case "document.saved":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          contentHash: data.contentHash,
        });
        break;
      case "selection.change":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          ranges: Object.freeze(data.ranges.map((range) => Object.freeze({ ...range }))),
        });
        break;
      case "diagnostics.update":
        message = Object.freeze({
          ...envelope,
          type: data.type,
          revision: data.revision,
          items: Object.freeze(data.items.map((item) => Object.freeze({ ...item }))),
        });
        break;
    }

    return success(message);
  } catch {
    return messageFailure("INVALID_MESSAGE");
  }
}
