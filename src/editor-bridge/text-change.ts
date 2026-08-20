import { failure, type Result, success } from "../domain/result";

export type TextChange = Readonly<{
  from: number;
  to: number;
  insert: string;
}>;

export type TextChangeError = Readonly<{
  code: "INVALID_CHANGE_RANGE";
}>;

export type EditorBridgeBase = Readonly<{
  sessionId: string;
  documentId: string;
  revision: number;
  markdown: string;
}>;

function invalidChange(): Result<never, TextChangeError> {
  return failure(Object.freeze({ code: "INVALID_CHANGE_RANGE" }));
}

export function selectEditorBridgeBase(
  current: EditorBridgeBase,
  incoming: EditorBridgeBase,
): EditorBridgeBase {
  const isSameDocument =
    current.sessionId === incoming.sessionId && current.documentId === incoming.documentId;
  if (isSameDocument && incoming.revision < current.revision) return current;

  return Object.freeze({ ...incoming });
}

export function createIncrementalTextChange(previous: string, next: string): readonly TextChange[] {
  if (previous === next) return Object.freeze([]);

  const sharedLimit = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < sharedLimit && previous[prefix] === next[prefix]) {
    prefix += 1;
  }

  let previousSuffix = previous.length;
  let nextSuffix = next.length;
  while (
    previousSuffix > prefix &&
    nextSuffix > prefix &&
    previous[previousSuffix - 1] === next[nextSuffix - 1]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  return Object.freeze([
    Object.freeze({
      from: prefix,
      to: previousSuffix,
      insert: next.slice(prefix, nextSuffix),
    }),
  ]);
}

export function applyTextChanges(
  source: string,
  changes: readonly TextChange[],
): Result<string, TextChangeError> {
  let previousEnd = 0;
  for (const change of changes) {
    if (
      !Number.isSafeInteger(change.from) ||
      !Number.isSafeInteger(change.to) ||
      change.from < previousEnd ||
      change.from > change.to ||
      change.to > source.length
    ) {
      return invalidChange();
    }
    previousEnd = change.to;
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const change of changes) {
    parts.push(source.slice(cursor, change.from), change.insert);
    cursor = change.to;
  }
  parts.push(source.slice(cursor));
  return success(parts.join(""));
}
