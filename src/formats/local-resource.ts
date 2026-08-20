const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToDataUri(bytes: Uint8Array, contentType: string | null): string {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Local resource exceeds preview limit");
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += BASE64[(value >> 18) & 63];
    encoded += BASE64[(value >> 12) & 63];
    encoded += second === undefined ? "=" : BASE64[(value >> 6) & 63];
    encoded += third === undefined ? "=" : BASE64[value & 63];
  }
  const safeType =
    contentType && /^(?:image|audio|video)\/[A-Za-z0-9.+-]+$/.test(contentType)
      ? contentType
      : "application/octet-stream";
  return `data:${safeType};base64,${encoded}`;
}

export function localResourcePaths(markdown: string): readonly string[] {
  const paths = new Set<string>();
  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const path = match[1];
    if (path && !/^(?:https?:|data:|blob:|file:|content:|\/)/i.test(path)) paths.add(path);
  }
  return Object.freeze([...paths]);
}

/**
 * Local resources are handed to the DOM editor kernel across the Expo DOM
 * bridge, where every push re-serializes props and therefore hands the kernel a
 * new object identity even when nothing changed. An editor instance may only be
 * rebuilt when the resource *values* change, so the native side pairs the map
 * with a monotonic revision number: numbers survive the JSON round trip with a
 * stable identity, objects do not.
 */
export type LocalResourceState = Readonly<{
  resources: Readonly<Record<string, string>>;
  revision: number;
}>;

export function createLocalResourceState(): LocalResourceState {
  return Object.freeze({ resources: Object.freeze({}), revision: 0 });
}

export function sameLocalResources(
  current: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return (
    currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key])
  );
}

/**
 * Returns the previous state unchanged when the resolved resources are equal, so
 * the kernel's rebuild signal only advances on a real content change.
 */
export function advanceLocalResourceState(
  current: LocalResourceState,
  next: Readonly<Record<string, string>>,
): LocalResourceState {
  if (sameLocalResources(current.resources, next)) return current;
  return Object.freeze({
    resources: Object.freeze({ ...next }),
    revision: current.revision + 1,
  });
}

export function resolveLocalResourcePath(
  documentPath: string,
  resourcePath: string,
): string | null {
  const directory = documentPath.includes("/")
    ? documentPath.slice(0, documentPath.lastIndexOf("/"))
    : "";
  const parts = `${directory}/${resourcePath}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else resolved.push(part);
  }
  return resolved.join("/") || null;
}
