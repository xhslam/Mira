import LZString from "lz-string";
import { z } from "zod";

import { failure, type Result, success } from "../../domain/result";

export const EXCALIDRAW_MIME_TYPE = "application/vnd.excalidraw+json";

const sceneSchema = z
  .object({
    type: z.literal("excalidraw"),
    version: z.number().int().nonnegative(),
    source: z.string().optional(),
    elements: z.array(z.record(z.string(), z.unknown())),
    appState: z.record(z.string(), z.unknown()),
    files: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type ExcalidrawScene = z.infer<typeof sceneSchema>;

export type ExcalidrawFileError = Readonly<{
  code: "INVALID_JSON" | "INVALID_SCENE" | "MISSING_DRAWING" | "INVALID_COMPRESSION";
  message: string;
  recoverable: boolean;
}>;

const DRAWING_HEADING = /^\s{0,3}#{1,6}\s+Drawing(?:\s+#+)?\s*$/im;
const DRAWING_FENCE =
  /^\s{0,3}(`{3,}|~{3,})[^\S\r\n]*([a-z0-9+_-]+)?[^\r\n]*\r?\n([\s\S]*?)^\s{0,3}\1[^\S\r\n]*$/gim;
const JSON_FENCE_LANGUAGES = new Set(["json", "excalidraw", "excalidraw-json"]);

export const EMPTY_EXCALIDRAW_SCENE: ExcalidrawScene = (() => {
  const value: ExcalidrawScene = {
    type: "excalidraw",
    version: 2,
    source: "https://github.com/excalidraw/excalidraw",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
  Object.freeze(value.elements);
  Object.freeze(value.appState);
  Object.freeze(value.files);
  return Object.freeze(value);
})();

function error(
  code: ExcalidrawFileError["code"],
  message: string,
): Result<never, ExcalidrawFileError> {
  return failure(Object.freeze({ code, message, recoverable: code === "MISSING_DRAWING" }));
}

export function isExcalidrawMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".excalidraw.md");
}

export function isExcalidrawPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.md");
}

function normalizeJsonSource(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}
function drawingSection(source: string): string | null {
  const heading = DRAWING_HEADING.exec(source);
  if (!heading || heading.index === undefined) return null;
  return source.slice(heading.index + heading[0].length);
}
function decodeCompressed(body: string): Result<string, ExcalidrawFileError> {
  const decoded = LZString.decompressFromBase64(body.replace(/[\r\n\t ]/g, ""));
  return decoded
    ? success(decoded)
    : error("INVALID_COMPRESSION", "The compressed Excalidraw scene could not be decoded.");
}
function extractFromFences(
  section: string,
  allowPlainJson = true,
): Result<string, ExcalidrawFileError> | null {
  DRAWING_FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DRAWING_FENCE.exec(section)) !== null) {
    const language = (match[2] ?? "").toLowerCase();
    const body = match[3] ?? "";
    if (language === "compressed-json") return decodeCompressed(body);
    if (JSON_FENCE_LANGUAGES.has(language) && (allowPlainJson || language !== "json")) {
      return success(body);
    }
  }
  return null;
}
function extractBalancedJsonObject(section: string): string | null {
  const start = section.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < section.length; index += 1) {
    const character = section[index];
    if (character === undefined) continue;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return section.slice(start, index + 1);
    }
  }
  return null;
}
function extractMarkdownScene(source: string): Result<string, ExcalidrawFileError> {
  const section = drawingSection(source);
  if (section !== null) {
    const fenced = extractFromFences(section);
    if (fenced) return fenced;
    const inline = extractBalancedJsonObject(section);
    if (inline) return success(inline);
  }
  // Explicitly tagged standalone blocks are interoperable. Plain JSON blocks are not.
  const tagged = extractFromFences(source, false);
  if (tagged) return tagged;
  return error(
    "MISSING_DRAWING",
    "The Markdown file does not contain an Excalidraw drawing block.",
  );
}
export function parseExcalidrawFile(
  source: string,
  path: string,
): Result<ExcalidrawScene, ExcalidrawFileError> {
  const extracted = isExcalidrawMarkdownPath(path) ? extractMarkdownScene(source) : success(source);
  if (!extracted.ok) return extracted;

  let value: unknown;
  try {
    value = JSON.parse(normalizeJsonSource(extracted.value));
  } catch {
    return error("INVALID_JSON", "The Excalidraw scene is not valid JSON.");
  }
  const parsed = sceneSchema.safeParse(value);
  return parsed.success
    ? success(parsed.data)
    : error("INVALID_SCENE", "The file is not a supported Excalidraw scene.");
}

function drawingText(scene: ExcalidrawScene): string {
  const blocks = scene.elements.flatMap((element) => {
    if (element.type !== "text" || typeof element.id !== "string") return [];
    const text =
      typeof element.originalText === "string"
        ? element.originalText
        : typeof element.text === "string"
          ? element.text
          : "";
    if (!text) return [];
    return [`${text} ^${element.id}`];
  });
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n\n` : "";
}

function drawingLinks(scene: ExcalidrawScene): string {
  const links = scene.elements.flatMap((element) =>
    typeof element.id === "string" && typeof element.link === "string" && element.link
      ? [`${element.id}: ${element.link}`]
      : [],
  );
  return links.length > 0 ? `${links.join("\n\n")}\n\n` : "";
}

function shortId(value: string, used: Set<string>): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const base = (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
  for (let suffix = 0; suffix < 36; suffix += 1) {
    const candidate = `${base}${suffix.toString(36)}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Unable to create a unique Excalidraw element ID");
}

function normalizeObsidianElementIds(scene: ExcalidrawScene): ExcalidrawScene {
  const ids = scene.elements.flatMap((element) =>
    typeof element.id === "string" ? [element.id] : [],
  );
  const used = new Set(ids.filter((id) => /^.{8}$/.test(id)));
  let json = JSON.stringify(scene);
  for (const id of ids) {
    if (id.length === 8) continue;
    const next = shortId(id, used);
    used.add(next);
    json = json.replaceAll(id, next);
  }
  return sceneSchema.parse(JSON.parse(json));
}

function markdownPreamble(previousSource: string | undefined): string {
  if (previousSource !== undefined) {
    const marker = previousSource.search(/^# Excalidraw Data\s*$/m);
    return marker >= 0 ? previousSource.slice(0, marker).trimEnd() : previousSource.trimEnd();
  }
  return [
    "---",
    "excalidraw-plugin: parsed",
    "mira-document-type: excalidraw",
    "tags:",
    "  - excalidraw",
    "---",
  ].join("\n");
}

function wrapCompressed(value: string): string {
  const compressed = LZString.compressToBase64(value);
  const chunks: string[] = [];
  for (let offset = 0; offset < compressed.length; offset += 256) {
    chunks.push(compressed.slice(offset, offset + 256));
  }
  return chunks.join("\n\n");
}

export function serializeExcalidrawFile(
  scene: ExcalidrawScene,
  path: string,
  previousSource?: string,
): string {
  const portableScene = isExcalidrawMarkdownPath(path) ? normalizeObsidianElementIds(scene) : scene;
  const json = JSON.stringify(portableScene, null, 2);
  if (!isExcalidrawMarkdownPath(path)) return `${json}\n`;

  return `${markdownPreamble(previousSource)}\n\n# Excalidraw Data\n\n## Text Elements\n${drawingText(
    portableScene,
  )}## Element Links\n${drawingLinks(portableScene)}## Embedded Files\n\n%%\n## Drawing\n\`\`\`compressed-json\n${wrapCompressed(
    json,
  )}\n\`\`\`\n%%\n`;
}

export function createEmptyExcalidrawFile(path = "Untitled.excalidraw.md"): string {
  return serializeExcalidrawFile(EMPTY_EXCALIDRAW_SCENE, path);
}

/** Creates a valid canvas for generic new-file paths without overwriting non-empty templates. */
export function contentForNewExcalidrawPath(path: string, content: string): string {
  return isExcalidrawPath(path) && content.trim().length === 0
    ? createEmptyExcalidrawFile(path)
    : content;
}
function fenceForSource(source: string): string {
  const longest = [...source.matchAll(/`+/g)].reduce(
    (length, match) => Math.max(length, match[0].length),
    2,
  );
  return "`".repeat(longest + 1);
}
/**
 * Builds a valid Markdown canvas while retaining the original unreadable source
 * in the document. Standard .excalidraw JSON files are intentionally excluded.
 */
export function createRecoveredExcalidrawMarkdownFile(path: string, source: string): string {
  if (!isExcalidrawMarkdownPath(path)) {
    throw new Error("Recovery is only supported for .excalidraw.md files");
  }
  const fence = fenceForSource(source);
  const preamble = [
    "---",
    "excalidraw-plugin: parsed",
    "mira-document-type: excalidraw",
    "mira-recovery: true",
    "---",
    "",
    "# Mira Recovery",
    "",
    "The original source could not be recognized as an Excalidraw drawing. It is preserved below before the new empty canvas.",
    "",
    "## Original Source Backup",
    "",
    `${fence}text`,
    source,
    fence,
  ].join("\n");
  return serializeExcalidrawFile(EMPTY_EXCALIDRAW_SCENE, path, preamble);
}
