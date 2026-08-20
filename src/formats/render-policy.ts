import type { FormatSecurityProfile, ViewKind } from "./format-registry";

export type RenderBoundary = Readonly<{
  profile: FormatSecurityProfile;
  editable: boolean;
  renderable: boolean;
  requiresSanitization: boolean;
  requiresSandbox: boolean;
  allowedViews: readonly ViewKind[];
  reason: string;
}>;

function boundary(
  profile: FormatSecurityProfile,
  input: Omit<RenderBoundary, "profile">,
): RenderBoundary {
  return Object.freeze({
    profile,
    ...input,
    allowedViews: Object.freeze([...input.allowedViews]),
  });
}

export function renderBoundaryFor(profile: FormatSecurityProfile): RenderBoundary {
  switch (profile) {
    case "text":
      return boundary("text", {
        editable: true,
        renderable: true,
        requiresSanitization: false,
        requiresSandbox: false,
        allowedViews: Object.freeze(["wysiwyg", "source"]),
        reason: "Plain text renders directly without script execution.",
      });
    case "structured-data":
      return boundary("structured-data", {
        editable: true,
        renderable: true,
        requiresSanitization: true,
        requiresSandbox: false,
        allowedViews: Object.freeze(["source", "tree", "table"]),
        reason: "Structured data renders through a strict parser; output is sanitized.",
      });
    case "sandboxed-render":
      return boundary("sandboxed-render", {
        editable: true,
        renderable: true,
        requiresSanitization: true,
        requiresSandbox: true,
        allowedViews: Object.freeze(["source"]),
        reason: "Rendered output runs in an isolated sandbox with strict limits.",
      });
    case "binary":
      return boundary("binary", {
        editable: false,
        renderable: false,
        requiresSanitization: false,
        requiresSandbox: false,
        allowedViews: Object.freeze([]),
        reason: "Binary content is never rendered or edited; system preview or share is used.",
      });
  }
}

export function canRenderProfile(profile: FormatSecurityProfile): boolean {
  return renderBoundaryFor(profile).renderable;
}

export function isProfileEditable(profile: FormatSecurityProfile): boolean {
  return renderBoundaryFor(profile).editable;
}
