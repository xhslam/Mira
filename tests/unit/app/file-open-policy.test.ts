import { describe, expect, it } from "vitest";

import { decideFileOpen } from "../../../src/app/file-open-policy";

describe("decideFileOpen", () => {
  it("opens small Markdown in its normal WYSIWYG view", () => {
    expect(decideFileOpen({ name: "note.md", contentType: "text/markdown", size: 32_000 })).toEqual(
      {
        formatId: "markdown",
        mode: "wysiwyg",
        editable: true,
        requiresConfirmation: false,
        rejected: false,
        reason: "Small file opens with its normal view.",
      },
    );
  });

  it("keeps medium Markdown in rich-text mode after save/reopen", () => {
    const decision = decideFileOpen({
      name: "note.md",
      contentType: "text/markdown",
      size: 2 * 1024 * 1024,
    });

    expect(decision).toMatchObject({ mode: "wysiwyg", editable: true, rejected: false });
  });

  it("requires confirmation before opening a 5-20 MiB source-only file", () => {
    const decision = decideFileOpen({
      name: "large.md",
      contentType: "text/markdown",
      size: 10 * 1024 * 1024,
    });

    expect(decision).toMatchObject({
      mode: "source",
      requiresConfirmation: true,
      rejected: false,
    });
  });

  it("rejects files over the full mobile editing limit", () => {
    const decision = decideFileOpen({
      name: "huge.json",
      contentType: "application/json",
      size: 21 * 1024 * 1024,
    });

    expect(decision).toMatchObject({ editable: false, rejected: true });
  });

  it("keeps Markdown rich text even when provider size metadata is unavailable", () => {
    const decision = decideFileOpen({ name: "unknown.md", contentType: null, size: null });

    expect(decision.mode).toBe("wysiwyg");
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it("opens a legacy extensionless note in WYSIWYG mode", () => {
    const decision = decideFileOpen({ name: "备考", contentType: "text/plain", size: 128 });

    expect(decision).toMatchObject({
      formatId: "markdown",
      mode: "wysiwyg",
      editable: true,
      rejected: false,
    });
  });
});
