export type ViewKind = "wysiwyg" | "source" | "reading" | "tree" | "table";

export type FormatParser = "markdown" | "json" | "yaml" | "toml" | "mermaid" | "excalidraw";
export type FormatEditability = boolean | "opt-in";
export type LargeFilePolicy = "normal" | "source-only" | "stream";
export type FormatSecurityProfile = "text" | "structured-data" | "sandboxed-render" | "binary";

export type FormatAdapter = Readonly<{
  id: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  defaultView: ViewKind;
  supportedViews: readonly ViewKind[];
  editable: FormatEditability;
  searchable: boolean;
  parser?: FormatParser;
  largeFilePolicy: LargeFilePolicy;
  securityProfile: FormatSecurityProfile;
}>;

export type FormatRegistry = Readonly<{
  adapters: readonly FormatAdapter[];
  resolve(fileName: string, mimeType?: string | null): FormatAdapter;
}>;

function freezeAdapter(adapter: FormatAdapter): FormatAdapter {
  const parser = adapter.parser === undefined ? {} : { parser: adapter.parser };
  return Object.freeze({
    ...adapter,
    ...parser,
    extensions: Object.freeze(adapter.extensions.map((extension) => extension.toLowerCase())),
    mimeTypes: Object.freeze(adapter.mimeTypes.map((mimeType) => mimeType.toLowerCase())),
    supportedViews: Object.freeze([...adapter.supportedViews]),
  });
}

function normalizedMimeType(mimeType: string | null | undefined): string | null {
  if (typeof mimeType !== "string") return null;
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function createFormatRegistry(adapters: readonly FormatAdapter[]): FormatRegistry {
  const frozen = Object.freeze(adapters.map(freezeAdapter));
  const ids = new Set<string>();
  const extensions = new Set<string>();
  const mimeTypes = new Set<string>();

  for (const adapter of frozen) {
    if (!/^[a-z][a-z0-9-]*$/.test(adapter.id)) {
      throw new Error(`Invalid format ID: ${adapter.id}`);
    }
    if (ids.has(adapter.id)) throw new Error(`Found duplicate format ID: ${adapter.id}`);
    ids.add(adapter.id);
    for (const extension of adapter.extensions) {
      if (!/^\.[a-z0-9][a-z0-9.+-]*$/.test(extension)) {
        throw new Error(`Invalid format extension: ${extension}`);
      }
      if (extensions.has(extension)) throw new Error(`Found duplicate extension: ${extension}`);
      extensions.add(extension);
    }
    for (const mimeType of adapter.mimeTypes) {
      if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
        throw new Error(`Invalid format MIME type: ${mimeType}`);
      }
      if (mimeTypes.has(mimeType)) throw new Error(`Found duplicate MIME type: ${mimeType}`);
      mimeTypes.add(mimeType);
    }
  }

  const unknownText = frozen.find((adapter) => adapter.id === "unknown-text");
  if (!unknownText) throw new Error("Format registry requires an unknown-text fallback");
  const binary = frozen.find((adapter) => adapter.id === "binary");
  if (!binary) throw new Error("Format registry requires a binary fallback");

  return Object.freeze({
    adapters: frozen,
    resolve(fileName, mimeType) {
      const name = (fileName.split(/[\\/]/).at(-1) ?? fileName).toLowerCase();
      const byExtension = frozen.find((adapter) =>
        adapter.extensions.some((extension) => name.endsWith(extension) && name !== extension),
      );
      if (byExtension) return byExtension;

      const normalizedMime = normalizedMimeType(mimeType);
      const byMime =
        normalizedMime === null
          ? undefined
          : frozen.find((adapter) => adapter.mimeTypes.includes(normalizedMime));
      if (byMime) return byMime;
      return normalizedMime?.startsWith("text/") ? unknownText : binary;
    },
  });
}

function adapter(input: FormatAdapter): FormatAdapter {
  return input;
}

const DEFAULT_FORMAT_ADAPTERS: readonly FormatAdapter[] = Object.freeze([
  adapter({
    id: "excalidraw",
    extensions: [".excalidraw.md", ".excalidraw"],
    mimeTypes: ["application/vnd.excalidraw+json"],
    defaultView: "source",
    supportedViews: ["source"],
    editable: true,
    searchable: true,
    parser: "excalidraw",
    largeFilePolicy: "source-only",
    securityProfile: "sandboxed-render",
  }),
  adapter({
    id: "markdown",
    extensions: [".md", ".markdown", ".mdown", ".mkd"],
    mimeTypes: ["text/markdown"],
    defaultView: "wysiwyg",
    supportedViews: ["wysiwyg", "source", "reading"],
    editable: true,
    searchable: true,
    parser: "markdown",
    largeFilePolicy: "source-only",
    securityProfile: "text",
  }),
  adapter({
    id: "text",
    extensions: [".txt", ".text", ".log"],
    mimeTypes: ["text/plain"],
    defaultView: "source",
    supportedViews: ["source"],
    editable: true,
    searchable: true,
    largeFilePolicy: "stream",
    securityProfile: "text",
  }),
  adapter({
    id: "yaml",
    extensions: [".yaml", ".yml"],
    mimeTypes: ["application/yaml", "text/yaml", "application/x-yaml"],
    defaultView: "tree",
    supportedViews: ["tree", "source", "table"],
    editable: true,
    searchable: true,
    parser: "yaml",
    largeFilePolicy: "source-only",
    securityProfile: "structured-data",
  }),
  adapter({
    id: "json",
    extensions: [".json", ".jsonl", ".ndjson"],
    mimeTypes: ["application/json", "application/jsonl", "application/x-ndjson"],
    defaultView: "tree",
    supportedViews: ["tree", "source", "table"],
    editable: true,
    searchable: true,
    parser: "json",
    largeFilePolicy: "stream",
    securityProfile: "structured-data",
  }),
  adapter({
    id: "toml",
    extensions: [".toml"],
    mimeTypes: ["application/toml"],
    defaultView: "tree",
    supportedViews: ["tree", "source", "table"],
    editable: true,
    searchable: true,
    parser: "toml",
    largeFilePolicy: "source-only",
    securityProfile: "structured-data",
  }),
  adapter({
    id: "mermaid",
    extensions: [".mmd", ".mermaid"],
    mimeTypes: ["text/vnd.mermaid"],
    defaultView: "source",
    supportedViews: ["source"],
    editable: true,
    searchable: true,
    parser: "mermaid",
    largeFilePolicy: "source-only",
    securityProfile: "sandboxed-render",
  }),
  adapter({
    id: "code",
    extensions: [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".rs",
      ".go",
      ".css",
      ".sh",
      ".bash",
      ".rb",
      ".lua",
      ".html",
      ".htm",
      ".svg",
      ".xml",
    ],
    mimeTypes: [
      "text/css",
      "text/html",
      "application/javascript",
      "text/javascript",
      "application/xml",
      "text/xml",
      "image/svg+xml",
    ],
    defaultView: "source",
    supportedViews: ["source"],
    editable: "opt-in",
    searchable: true,
    largeFilePolicy: "stream",
    securityProfile: "text",
  }),
  adapter({
    id: "unknown-text",
    extensions: [],
    mimeTypes: [],
    defaultView: "source",
    supportedViews: ["source"],
    editable: "opt-in",
    searchable: true,
    largeFilePolicy: "stream",
    securityProfile: "text",
  }),
  adapter({
    id: "binary",
    extensions: [],
    mimeTypes: [],
    defaultView: "source",
    supportedViews: [],
    editable: false,
    searchable: false,
    largeFilePolicy: "stream",
    securityProfile: "binary",
  }),
]);

export const DEFAULT_FORMAT_REGISTRY = createFormatRegistry(DEFAULT_FORMAT_ADAPTERS);
