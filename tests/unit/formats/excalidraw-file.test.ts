import { describe, expect, it } from "vitest";

import {
  contentForNewExcalidrawPath,
  createEmptyExcalidrawFile,
  createRecoveredExcalidrawMarkdownFile,
  isExcalidrawMarkdownPath,
  isExcalidrawPath,
  parseExcalidrawFile,
  serializeExcalidrawFile,
  type ExcalidrawScene,
} from "../../../src/formats/excalidraw/excalidraw-file";

const SCENE: ExcalidrawScene = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    {
      id: "text-1",
      type: "text",
      text: "System map",
      originalText: "System map",
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

describe("Excalidraw file format", () => {
  it("recognizes standard and Markdown compound extensions case-insensitively", () => {
    expect(isExcalidrawPath("Boards/Map.excalidraw")).toBe(true);
    expect(isExcalidrawPath("Boards/Map.EXCALIDRAW.MD")).toBe(true);
    expect(isExcalidrawMarkdownPath("Map.excalidraw.md")).toBe(true);
    expect(isExcalidrawPath("Map.md")).toBe(false);
  });

  it("round-trips the standard Excalidraw JSON format", () => {
    const serialized = serializeExcalidrawFile(SCENE, "Map.excalidraw");
    const parsed = parseExcalidrawFile(serialized, "Map.excalidraw");

    expect(parsed).toMatchObject({ ok: true, value: { type: "excalidraw", version: 2 } });
    if (parsed.ok) expect(parsed.value.elements[0]).toMatchObject({ text: "System map" });
  });

  it("writes and reads Obsidian-compatible compressed Markdown drawings", () => {
    const serialized = serializeExcalidrawFile(SCENE, "Map.excalidraw.md");
    const parsed = parseExcalidrawFile(serialized, "Map.excalidraw.md");

    expect(serialized).toContain("excalidraw-plugin: parsed");
    expect(serialized).toContain("# Excalidraw Data");
    expect(serialized).toMatch(/System map \^[a-z0-9]{8}/);
    expect(serialized).toContain("```compressed-json");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.elements[0]).toMatchObject({ text: "System map" });
    if (parsed.ok) expect(String(parsed.value.elements[0]?.id)).toHaveLength(8);
  });

  it("preserves frontmatter and back-of-note content when the scene changes", () => {
    const previous = serializeExcalidrawFile(SCENE, "Map.excalidraw.md").replace(
      /^---[\s\S]*?---/,
      "---\nexcalidraw-plugin: parsed\nproject: Mira\n---\n\n# Notes\nKeep me.",
    );
    const serialized = serializeExcalidrawFile(SCENE, "Map.excalidraw.md", previous);

    expect(serialized).toContain("project: Mira");
    expect(serialized).toContain("# Notes\nKeep me.");
    expect(serialized.match(/# Excalidraw Data/g)).toHaveLength(1);
  });

  it("creates a valid empty canvas and reports malformed boundaries", () => {
    expect(parseExcalidrawFile(createEmptyExcalidrawFile(), "Untitled.excalidraw.md").ok).toBe(
      true,
    );
    expect(parseExcalidrawFile("{", "Broken.excalidraw")).toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });
    expect(parseExcalidrawFile("# note", "Broken.excalidraw.md")).toMatchObject({
      ok: false,
      error: { code: "MISSING_DRAWING" },
    });
  });
  it("accepts resilient Obsidian Markdown variants without widening to arbitrary JSON", () => {
    const serialized = serializeExcalidrawFile(SCENE, "Map.excalidraw.md")
      .replace("## Drawing", "### Drawing ###")
      .replaceAll("\n", "\r\n");
    const parsed = parseExcalidrawFile(serialized, "Map.excalidraw.md");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.elements[0]).toMatchObject({ text: "System map" });

    const taggedOnly = [
      "# Imported canvas",
      "",
      "```excalidraw-json",
      serializeExcalidrawFile(SCENE, "Map.excalidraw").trim(),
      "```",
    ].join("\n");
    expect(parseExcalidrawFile(taggedOnly, "Imported.excalidraw.md").ok).toBe(true);
    expect(parseExcalidrawFile("```json\n{}\n```", "Note.excalidraw.md")).toMatchObject({
      ok: false,
      error: { code: "MISSING_DRAWING", recoverable: true },
    });
  });
  it("initializes generic canvas filenames with valid drawing data", () => {
    const markdown = contentForNewExcalidrawPath("Canvas.excalidraw.md", "");
    const json = contentForNewExcalidrawPath("Canvas.excalidraw", "  \n");
    expect(parseExcalidrawFile(markdown, "Canvas.excalidraw.md").ok).toBe(true);
    expect(parseExcalidrawFile(json, "Canvas.excalidraw").ok).toBe(true);
    expect(contentForNewExcalidrawPath("Template.excalidraw.md", "# Template")).toBe("# Template");
  });
  it("repairs malformed Markdown drawings without discarding their original source", () => {
    const original = "# Notes\n\n```\nThis content must remain visible.\n```\n";
    const recovered = createRecoveredExcalidrawMarkdownFile("Broken.excalidraw.md", original);
    expect(recovered).toContain("mira-recovery: true");
    expect(recovered).toContain(original);
    expect(recovered.match(/# Excalidraw Data/g)).toHaveLength(1);
    expect(parseExcalidrawFile(recovered, "Broken.excalidraw.md").ok).toBe(true);
    expect(() => createRecoveredExcalidrawMarkdownFile("Broken.excalidraw", original)).toThrow();
  });
});
