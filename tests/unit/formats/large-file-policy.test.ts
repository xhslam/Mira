import { describe, expect, it } from "vitest";

import {
  classifyFileSize,
  decideLargeFileOpen,
  FILE_SIZE_LIMITS,
  type FileSizeBand,
} from "../../../src/formats/large-file-policy";

const MB = 1024 * 1024;

describe("classifyFileSize", () => {
  it.each<[number, FileSizeBand]>([
    [0, "under-1mb"],
    [1, "under-1mb"],
    [MB - 1, "under-1mb"],
    [MB, "1mb-to-5mb"],
    [5 * MB - 1, "1mb-to-5mb"],
    [5 * MB, "5mb-to-20mb"],
    [20 * MB - 1, "5mb-to-20mb"],
    [20 * MB, "over-20mb"],
    [Number.MAX_SAFE_INTEGER, "over-20mb"],
  ])("classifies %d bytes", (size, expected) => {
    expect(classifyFileSize(size)).toBe(expected);
  });

  it("rejects negative and non-integer sizes", () => {
    expect(() => classifyFileSize(-1)).toThrow("non-negative");
    expect(() => classifyFileSize(1.5)).toThrow("safe integer");
    expect(() => classifyFileSize(Number.NaN)).toThrow("safe integer");
  });

  it("exposes the documented thresholds", () => {
    expect(FILE_SIZE_LIMITS.oneMegabyte).toBe(MB);
    expect(FILE_SIZE_LIMITS.fiveMegabytes).toBe(5 * MB);
    expect(FILE_SIZE_LIMITS.twentyMegabytes).toBe(20 * MB);
  });
});

describe("decideLargeFileOpen", () => {
  it("opens small files with the default view and full editing", () => {
    const decision = decideLargeFileOpen(64 * 1024, "normal", "wysiwyg");
    expect(decision).toEqual({
      band: "under-1mb",
      initialView: "wysiwyg",
      editable: true,
      requiresConfirmation: false,
      rejected: false,
      reason: expect.stringContaining("normal view"),
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it("opens small files with restricted policies in source view", () => {
    expect(decideLargeFileOpen(100, "source-only", "wysiwyg").initialView).toBe("wysiwyg");
    expect(decideLargeFileOpen(100, "stream", "wysiwyg").initialView).toBe("wysiwyg");
    expect(decideLargeFileOpen(100, "source-only", "wysiwyg").editable).toBe(true);
  });

  it("keeps mid-size rich documents in their normal view", () => {
    const decision = decideLargeFileOpen(2 * MB, "normal", "wysiwyg");
    expect(decision).toMatchObject({
      band: "1mb-to-5mb",
      initialView: "wysiwyg",
      editable: true,
      requiresConfirmation: false,
      rejected: false,
    });
  });

  it("requires confirmation for 5-20MB files", () => {
    const decision = decideLargeFileOpen(10 * MB, "normal", "wysiwyg");
    expect(decision).toMatchObject({
      band: "5mb-to-20mb",
      initialView: "source",
      editable: true,
      requiresConfirmation: true,
      rejected: false,
    });
  });

  it("opens 5-20MB streaming files read-only", () => {
    const decision = decideLargeFileOpen(10 * MB, "stream", "source");
    expect(decision).toMatchObject({
      editable: false,
      requiresConfirmation: true,
      rejected: false,
    });
  });

  it("rejects full editing for files over 20MB", () => {
    const decision = decideLargeFileOpen(50 * MB, "normal", "wysiwyg");
    expect(decision).toEqual({
      band: "over-20mb",
      initialView: "source",
      editable: false,
      requiresConfirmation: false,
      rejected: true,
      reason: expect.stringContaining("external app"),
    });
    expect(decision.rejected).toBe(true);
  });
});
