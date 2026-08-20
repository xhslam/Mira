import { describe, expect, it } from "vitest";

import {
  createFormatRegistry,
  DEFAULT_FORMAT_REGISTRY,
  type FormatAdapter,
} from "../../../src/formats/format-registry";

function fallback(id: "unknown-text" | "binary"): FormatAdapter {
  const definition: FormatAdapter = {
    id,
    extensions: Object.freeze([]),
    mimeTypes: Object.freeze([]),
    defaultView: "source",
    supportedViews: Object.freeze(["source" as const]),
    editable: id === "binary" ? false : "opt-in",
    searchable: id !== "binary",
    largeFilePolicy: id === "binary" ? "stream" : "source-only",
    securityProfile: id === "binary" ? "binary" : "text",
  };
  return Object.freeze(definition);
}

function textAdapter(
  id: string,
  extensions: readonly string[],
  mimeTypes: readonly string[] = [],
): FormatAdapter {
  const definition: FormatAdapter = {
    id,
    extensions: Object.freeze([...extensions]),
    mimeTypes: Object.freeze([...mimeTypes]),
    defaultView: "source",
    supportedViews: Object.freeze(["source" as const]),
    editable: true,
    searchable: true,
    largeFilePolicy: "normal",
    securityProfile: "text",
  };
  return Object.freeze(definition);
}

describe("format registry", () => {
  it.each([
    ["README.MD", null, "markdown"],
    ["Map.excalidraw.md", null, "excalidraw"],
    ["Map.EXCALIDRAW", null, "excalidraw"],
    ["settings.yaml", "application/octet-stream", "yaml"],
    ["records.jsonl", null, "json"],
    ["Cargo.toml", null, "toml"],
    ["architecture.mmd", null, "mermaid"],
    ["main.tsx", null, "code"],
    ["notes.txt", null, "text"],
  ])("resolves %s to the registered format", (fileName, mimeType, expectedId) => {
    expect(DEFAULT_FORMAT_REGISTRY.resolve(fileName, mimeType).id).toBe(expectedId);
  });

  it("normalizes MIME parameters and uses MIME only after extension matching", () => {
    expect(DEFAULT_FORMAT_REGISTRY.resolve("payload", "application/json; charset=utf-8").id).toBe(
      "json",
    );
    expect(DEFAULT_FORMAT_REGISTRY.resolve("notes.md", "application/json").id).toBe("markdown");
  });

  it("uses explicit safe fallbacks for unknown text and binary inputs", () => {
    expect(DEFAULT_FORMAT_REGISTRY.resolve("LICENSE", "text/plain").id).toBe("text");
    expect(DEFAULT_FORMAT_REGISTRY.resolve("template.custom", "text/x-template").id).toBe(
      "unknown-text",
    );
    expect(DEFAULT_FORMAT_REGISTRY.resolve("archive.custom", "application/octet-stream").id).toBe(
      "binary",
    );
    expect(DEFAULT_FORMAT_REGISTRY.resolve("unknown.custom").id).toBe("binary");
  });

  it("declares required drawing, Markdown, structured-data, Mermaid, code, and fallback capabilities", () => {
    const excalidraw = DEFAULT_FORMAT_REGISTRY.resolve("map.excalidraw.md");
    const markdown = DEFAULT_FORMAT_REGISTRY.resolve("readme.md");
    const json = DEFAULT_FORMAT_REGISTRY.resolve("data.json");
    const mermaid = DEFAULT_FORMAT_REGISTRY.resolve("flow.mermaid");
    const code = DEFAULT_FORMAT_REGISTRY.resolve("main.py");

    expect(excalidraw).toMatchObject({
      parser: "excalidraw",
      defaultView: "source",
      supportedViews: ["source"],
      editable: true,
      securityProfile: "sandboxed-render",
    });
    expect(markdown).toMatchObject({
      defaultView: "wysiwyg",
      supportedViews: ["wysiwyg", "source", "reading"],
      parser: "markdown",
      editable: true,
      securityProfile: "text",
    });
    expect(json).toMatchObject({ parser: "json", securityProfile: "structured-data" });
    expect(mermaid).toMatchObject({
      parser: "mermaid",
      defaultView: "source",
      supportedViews: ["source"],
      securityProfile: "sandboxed-render",
    });
    expect(code).toMatchObject({ editable: "opt-in", largeFilePolicy: "stream" });
  });

  it("freezes the registry, adapter definitions, and capability arrays", () => {
    const markdown = DEFAULT_FORMAT_REGISTRY.resolve("readme.md");

    expect(Object.isFrozen(DEFAULT_FORMAT_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FORMAT_REGISTRY.adapters)).toBe(true);
    expect(Object.isFrozen(markdown)).toBe(true);
    expect(Object.isFrozen(markdown.extensions)).toBe(true);
    expect(Object.isFrozen(markdown.supportedViews)).toBe(true);
  });

  it("rejects duplicate IDs, extensions, and MIME types", () => {
    const unknown = fallback("unknown-text");
    const binary = fallback("binary");

    expect(() =>
      createFormatRegistry([
        unknown,
        binary,
        textAdapter("one", [".txt"]),
        textAdapter("one", [".md"]),
      ]),
    ).toThrow("duplicate format ID");
    expect(() =>
      createFormatRegistry([
        unknown,
        binary,
        textAdapter("one", [".txt"]),
        textAdapter("two", [".TXT"]),
      ]),
    ).toThrow("duplicate extension");
    expect(() =>
      createFormatRegistry([
        unknown,
        binary,
        textAdapter("one", [".one"], ["text/example"]),
        textAdapter("two", [".two"], ["TEXT/EXAMPLE"]),
      ]),
    ).toThrow("duplicate MIME type");
  });

  it("rejects registries without both safe fallback adapters", () => {
    expect(() => createFormatRegistry([fallback("binary")])).toThrow("unknown-text");
    expect(() => createFormatRegistry([fallback("unknown-text")])).toThrow("binary");
  });
});
