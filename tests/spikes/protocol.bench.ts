import { bench, describe } from "vitest";

import { parseEditorMessage } from "../../src/editor-bridge/editor-message";
import { applyTextChanges, createIncrementalTextChange } from "../../src/editor-bridge/text-change";

const KIB = 1024;
const DOCUMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";

function documentOfSize(bytes: number): string {
  const line = "0123456789abcdef\n";
  return line.repeat(Math.ceil(bytes / line.length)).slice(0, bytes);
}

function changeMessage(insert: string) {
  return {
    protocolVersion: 1,
    type: "document.change",
    sessionId: SESSION_ID,
    documentId: DOCUMENT_ID,
    baseRevision: 1,
    revision: 2,
    mode: "source",
    changes: [{ from: 250 * KIB, to: 250 * KIB, insert }],
    selection: { anchor: 250 * KIB + insert.length, head: 250 * KIB + insert.length },
  };
}

describe("incremental editor protocol", () => {
  const markdown500KiB = documentOfSize(500 * KIB);
  const edited500KiB = `${markdown500KiB.slice(0, 250 * KIB)}x${markdown500KiB.slice(250 * KIB)}`;
  const markdown5MiB = documentOfSize(5 * 1024 * KIB);
  const edited5MiB = `${markdown5MiB.slice(0, 2.5 * 1024 * KIB)}x${markdown5MiB.slice(
    2.5 * 1024 * KIB,
  )}`;
  const oneCharacterChange = Object.freeze([
    Object.freeze({ from: 250 * KIB, to: 250 * KIB, insert: "x" }),
  ]);

  bench("derive one-character change in 500 KiB", () => {
    createIncrementalTextChange(markdown500KiB, edited500KiB);
  });

  bench("apply one-character change in 500 KiB", () => {
    applyTextChanges(markdown500KiB, oneCharacterChange);
  });

  bench("derive one-character change in 5 MiB", () => {
    createIncrementalTextChange(markdown5MiB, edited5MiB);
  });

  bench("validate one-character bridge message", () => {
    parseEditorMessage(changeMessage("x"));
  });
});
