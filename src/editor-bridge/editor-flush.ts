import { failure, type Result, success } from "../domain/result";
import type { EditorSaveRequestedMessage } from "./editor-message";
import type { EditorBridgeBase } from "./text-change";

export type EditorFlushRequest = Readonly<{
  requestId: number;
  sessionId: string;
  documentId: string;
}>;

export type EditorFlushError = Readonly<{
  code: "IDENTITY_MISMATCH" | "REQUEST_MISMATCH" | "REVISION_MISMATCH";
}>;

function flushFailure(code: EditorFlushError["code"]): Result<never, EditorFlushError> {
  return failure(Object.freeze({ code }));
}

function hasMatchingIdentity(
  request: EditorFlushRequest,
  value: Readonly<{ sessionId: string; documentId: string }>,
): boolean {
  return request.sessionId === value.sessionId && request.documentId === value.documentId;
}

/**
 * The DOM editor kernel receives `flushRequest` across the Expo DOM bridge,
 * which re-serializes props on every native render and therefore hands the
 * kernel a new object identity for an unchanged request. A flush must be driven
 * by the request *identity value*, never by object identity: re-running the
 * flush effect tears down the in-flight attempt through its cleanup, and the
 * native side then times out waiting for an acknowledgement it will never get.
 *
 * Requests are compared by identity value rather than by order because the
 * native request counter wraps back to 1 at `Number.MAX_SAFE_INTEGER`; a
 * strictly-increasing comparison would reject every request after a wrap. Bridge
 * pushes carry the current request and are delivered in order, so an unchanged
 * id always means "already handled".
 */
export function shouldStartEditorFlush(
  input: Readonly<{ handledRequestId: number | null; requestId: number | null }>,
): boolean {
  if (input.requestId === null) return false;
  return input.handledRequestId === null || input.requestId !== input.handledRequestId;
}

export function createEditorSaveRequestedMessage(
  request: EditorFlushRequest,
  base: EditorBridgeBase,
): Result<EditorSaveRequestedMessage, EditorFlushError> {
  if (!hasMatchingIdentity(request, base)) return flushFailure("IDENTITY_MISMATCH");

  return success(
    Object.freeze({
      protocolVersion: 1,
      type: "document.saveRequested",
      sessionId: request.sessionId as EditorSaveRequestedMessage["sessionId"],
      documentId: request.documentId as EditorSaveRequestedMessage["documentId"],
      revision: base.revision,
      requestId: request.requestId,
    }),
  );
}

export function acknowledgeEditorFlush(
  request: EditorFlushRequest,
  revision: number,
  message: EditorSaveRequestedMessage,
): Result<true, EditorFlushError> {
  if (!hasMatchingIdentity(request, message)) return flushFailure("IDENTITY_MISMATCH");
  if (request.requestId !== message.requestId) return flushFailure("REQUEST_MISMATCH");
  if (revision !== message.revision) return flushFailure("REVISION_MISMATCH");

  return success(true);
}
