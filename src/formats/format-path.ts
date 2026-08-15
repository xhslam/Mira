import { DEFAULT_FORMAT_REGISTRY, type FormatAdapter } from "./format-registry";
import { isProfileEditable } from "./render-policy";
import type { FileEntry } from "../workspace/workspace-adapter";

export function resolveFormatForPath(path: string, mimeType?: string | null): FormatAdapter {
  const name = path.split("/").at(-1) ?? path;
  const hasExtension = /(?:^|\/)[^/.][^/]*\.[^/]+$/.test(path);
  const normalizedMimeType = mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;

  // Notes created by older builds could be saved without the default `.md`
  // suffix when the user replaced the whole suggested filename. They are
  // Markdown workspace documents, but the generic registry quite correctly
  // treats an extensionless, untyped file as binary. Keep the registry strict
  // at external boundaries while preserving those existing notes here.
  if (
    !hasExtension &&
    !name.startsWith(".") &&
    (normalizedMimeType === null ||
      normalizedMimeType === "" ||
      normalizedMimeType === "text/plain" ||
      normalizedMimeType === "application/octet-stream")
  ) {
    return DEFAULT_FORMAT_REGISTRY.resolve("note.md", "text/markdown");
  }
  return DEFAULT_FORMAT_REGISTRY.resolve(name, mimeType);
}

export function formatIdForPath(path: string, mimeType?: string | null): string {
  return resolveFormatForPath(path, mimeType).id;
}

export function isEditableTextFormat(entry: Pick<FileEntry, "name" | "contentType">): boolean {
  const adapter = resolveFormatForPath(entry.name, entry.contentType);
  return adapter.id !== "binary" && isProfileEditable(adapter.securityProfile);
}

export function shouldIndexFormat(entry: Pick<FileEntry, "name" | "contentType">): boolean {
  const adapter = resolveFormatForPath(entry.name, entry.contentType);
  return adapter.searchable;
}
