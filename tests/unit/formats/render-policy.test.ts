import { describe, expect, it } from "vitest";

import {
  canRenderProfile,
  isProfileEditable,
  renderBoundaryFor,
} from "../../../src/formats/render-policy";
import type { FormatSecurityProfile } from "../../../src/formats/format-registry";

const ALL_PROFILES: readonly FormatSecurityProfile[] = [
  "text",
  "structured-data",
  "sandboxed-render",
  "binary",
];

describe("renderBoundaryFor", () => {
  it("returns a frozen boundary for every documented profile", () => {
    for (const profile of ALL_PROFILES) {
      const result = renderBoundaryFor(profile);
      expect(result.profile).toBe(profile);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.allowedViews)).toBe(true);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("treats plain text as directly renderable and editable", () => {
    const result = renderBoundaryFor("text");
    expect(result).toMatchObject({
      editable: true,
      renderable: true,
      requiresSanitization: false,
      requiresSandbox: false,
    });
    expect(result.allowedViews).toEqual(["wysiwyg", "source"]);
  });

  it("sanitizes structured data without a sandbox", () => {
    const result = renderBoundaryFor("structured-data");
    expect(result).toMatchObject({
      editable: true,
      renderable: true,
      requiresSanitization: true,
      requiresSandbox: false,
    });
    expect(result.allowedViews).toEqual(["source", "tree", "table"]);
  });

  it("isolates sandboxed renders with sanitization", () => {
    const result = renderBoundaryFor("sandboxed-render");
    expect(result).toMatchObject({
      editable: true,
      renderable: true,
      requiresSanitization: true,
      requiresSandbox: true,
    });
    expect(result.allowedViews).toEqual(["source"]);
  });

  it("never renders or edits binary content", () => {
    const result = renderBoundaryFor("binary");
    expect(result).toMatchObject({
      editable: false,
      renderable: false,
      requiresSanitization: false,
      requiresSandbox: false,
    });
    expect(result.allowedViews).toEqual([]);
  });
});

describe("profile shortcuts", () => {
  it("exposes render and edit capability per profile", () => {
    expect(canRenderProfile("text")).toBe(true);
    expect(canRenderProfile("structured-data")).toBe(true);
    expect(canRenderProfile("sandboxed-render")).toBe(true);
    expect(canRenderProfile("binary")).toBe(false);

    expect(isProfileEditable("text")).toBe(true);
    expect(isProfileEditable("structured-data")).toBe(true);
    expect(isProfileEditable("sandboxed-render")).toBe(true);
    expect(isProfileEditable("binary")).toBe(false);
  });
});
