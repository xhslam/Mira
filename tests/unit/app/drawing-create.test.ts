import { describe, expect, it } from "vitest";

import { drawingCreateTarget } from "../../../src/app/drawing-create";
import {
  createEmptyExcalidrawFile,
  parseExcalidrawFile,
} from "../../../src/formats/excalidraw/excalidraw-file";

describe("drawing creation", () => {
  it("creates a safe compound-extension path whose initial contents are readable", () => {
    const target = drawingCreateTarget("  系统 / 地图.excalidraw.md  ");

    expect(target).toEqual({ ok: true, path: "系统 - 地图.excalidraw.md" });
    if (!target.ok) throw new Error("Expected a valid drawing target");
    expect(parseExcalidrawFile(createEmptyExcalidrawFile(target.path), target.path).ok).toBe(true);
  });

  it("rejects names that become empty after normalization", () => {
    expect(drawingCreateTarget(" . ")).toEqual({ ok: false, code: "EMPTY" });
  });
});
