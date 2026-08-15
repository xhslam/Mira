import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import {
  applyVmarkGenieResult,
  captureGenieTarget,
  serializeVmarkGenieSource,
  VMARK_GENIES,
} from "../../../src/ai/vmark-genies";

describe("VMark Genie compatibility", () => {
  test("locks all 13 official source assets by SHA-256", () => {
    expect(VMARK_GENIES).toHaveLength(13);
    for (const genie of VMARK_GENIES) {
      const digest = createHash("sha256").update(serializeVmarkGenieSource(genie)).digest("hex");
      expect(digest, genie.id).toBe(genie.sourceSha256);
      expect(genie.context).toBe(0);
    }
  });

  test("preserves the official scopes and actions", () => {
    expect(
      Object.fromEntries(VMARK_GENIES.map((genie) => [genie.id, [genie.scope, genie.action]])),
    ).toEqual({
      polish: ["selection", "replace"],
      condense: ["selection", "replace"],
      "fix-grammar": ["selection", "replace"],
      simplify: ["selection", "replace"],
      expand: ["selection", "replace"],
      rephrase: ["selection", "replace"],
      vivid: ["selection", "replace"],
      continue: ["block", "insert"],
      summarize: ["document", "replace"],
      outline: ["document", "replace"],
      headline: ["document", "replace"],
      translate: ["selection", "replace"],
      "rewrite-in-english": ["selection", "replace"],
    });
  });

  test("falls back from an empty selection to the current compound block", () => {
    const markdown = "Intro\n\n- one\n- two\n\nEnd";
    const target = captureGenieTarget(markdown, { anchor: 12, head: 12 }, "selection");
    expect(target.content).toBe("- one\n- two");
  });

  test("inserts Continue output after its block without replacing it", () => {
    const markdown = "First block\n\nSecond";
    const target = captureGenieTarget(markdown, { anchor: 2, head: 2 }, "block");
    expect(applyVmarkGenieResult(markdown, target, "insert", "New paragraph")).toBe(
      "First block\nNew paragraph\n\nSecond",
    );
  });
});
