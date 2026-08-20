import { describe, expect, it } from "vitest";

import {
  assembleDocumentOpenTransfer,
  createDocumentOpenTransfer,
} from "../../../src/editor-bridge/document-open-transfer";
import { MAX_EDITOR_MARKDOWN_BYTES } from "../../../src/editor-bridge/editor-message";

const envelope = Object.freeze({
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  documentId: "123e4567-e89b-42d3-a456-426614174001",
  revision: 7,
  view: "source" as const,
  selection: Object.freeze({ anchor: 3, head: 3 }),
});

describe("document-open transfer", () => {
  it("uses the required document.open message for bounded documents", () => {
    const transfer = createDocumentOpenTransfer({ ...envelope, content: "hello" });

    expect(transfer).toMatchObject({
      ok: true,
      value: [{ type: "document.open", content: "hello", revision: 7 }],
    });
    if (transfer.ok) {
      expect(assembleDocumentOpenTransfer(transfer.value)).toMatchObject({
        ok: true,
        value: { type: "document.open", content: "hello", revision: 7 },
      });
    }
  });

  it("round-trips a Unicode document larger than the per-message payload limit", () => {
    const content = `开头🙂\n${"0123456789abcdef".repeat(MAX_EDITOR_MARKDOWN_BYTES / 8)}\n结尾`;
    const transfer = createDocumentOpenTransfer({ ...envelope, content });
    if (!transfer.ok) throw new Error(transfer.error.code);

    const assembled = assembleDocumentOpenTransfer(transfer.value);

    expect(transfer.value[0]).toMatchObject({ type: "document.open.begin" });
    expect(transfer.value.at(-1)).toMatchObject({ type: "document.open.commit" });
    expect(
      transfer.value
        .filter((message) => message.type === "document.open.chunk")
        .every(
          (message) =>
            new TextEncoder().encode(message.content).byteLength <= MAX_EDITOR_MARKDOWN_BYTES,
        ),
    ).toBe(true);
    expect(assembled).toMatchObject({ ok: true, value: { content, revision: 7 } });
  });

  it("rejects missing, reordered, or cross-document chunks", () => {
    const content = "x".repeat(MAX_EDITOR_MARKDOWN_BYTES + 100);
    const transfer = createDocumentOpenTransfer({ ...envelope, content });
    if (!transfer.ok) throw new Error(transfer.error.code);
    const begin = transfer.value[0];
    const chunk = transfer.value[1];
    const commit = transfer.value.at(-1);
    if (!begin || !chunk || !commit || chunk.type !== "document.open.chunk") {
      throw new Error("Expected a chunked transfer");
    }

    expect(assembleDocumentOpenTransfer([begin, commit])).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSFER" },
    });
    expect(assembleDocumentOpenTransfer([begin, { ...chunk, index: 1 }, commit])).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSFER" },
    });
    const crossDocument = transfer.value.map((message, index) =>
      index === 1 ? { ...message, documentId: "123e4567-e89b-42d3-a456-426614174099" } : message,
    );
    expect(assembleDocumentOpenTransfer(crossDocument)).toMatchObject({
      ok: false,
      error: { code: "IDENTITY_MISMATCH" },
    });
  });
});
