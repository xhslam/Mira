import type { VaultStorage } from "./vault-storage";

export function createScopedVaultStorage(_storage: VaultStorage, _prefix: string): VaultStorage {
  function validPath(path: string): boolean {
    return (
      path.length > 0 &&
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !/^[a-z]:/i.test(path) &&
      !path.includes("\0") &&
      !path.endsWith("/") &&
      path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    );
  }

  if (!validPath(_prefix)) throw new Error("Invalid scoped vault prefix");

  function resolve(path: string): string {
    if (!validPath(path)) throw new Error("Invalid scoped vault path");
    return `${_prefix}/${path}`;
  }

  return Object.freeze({
    async read(path: string) {
      return _storage.read(resolve(path));
    },
    async write(path: string, contents: string) {
      return _storage.write(resolve(path), contents);
    },
    async move(from: string, to: string) {
      return _storage.move(resolve(from), resolve(to));
    },
    async remove(path: string) {
      return _storage.remove(resolve(path));
    },
    async exists(path: string) {
      return _storage.exists(resolve(path));
    },
  });
}
