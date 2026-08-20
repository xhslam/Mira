import type { VaultStorage } from "./vault-storage";

export type ExpoFileSystemAdapter = Readonly<{
  documentDirectory: string | null;
  getInfoAsync(uri: string): Promise<Readonly<{ exists: boolean; isDirectory: boolean }>>;
  readAsStringAsync(uri: string): Promise<string>;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
  makeDirectoryAsync(uri: string, options?: Readonly<{ intermediates?: boolean }>): Promise<void>;
  moveAsync(options: Readonly<{ from: string; to: string }>): Promise<void>;
  deleteAsync(uri: string, options?: Readonly<{ idempotent?: boolean }>): Promise<void>;
}>;

function assertSafePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /^[a-z]:/i.test(path) ||
    path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe vault path");
  }
}

export function createExpoVaultStorage(fileSystem: ExpoFileSystemAdapter): VaultStorage {
  if (fileSystem.documentDirectory === null) {
    throw new Error("App-private document storage is unavailable");
  }

  const vaultRootUri = `${fileSystem.documentDirectory}vmark-mobile`;
  const rootUri = `${vaultRootUri}/`;

  function resolve(path: string): string {
    assertSafePath(path);
    return `${rootUri}${path}`;
  }

  async function ensureParent(path: string): Promise<void> {
    const parent = path.split("/").slice(0, -1).join("/");
    const parentUri = parent.length > 0 ? `${rootUri}${parent}` : vaultRootUri;
    await fileSystem.makeDirectoryAsync(parentUri, { intermediates: true });
  }

  const storage: VaultStorage = {
    async read(path: string) {
      const uri = resolve(path);
      const info = await fileSystem.getInfoAsync(uri);
      return info.exists ? fileSystem.readAsStringAsync(uri) : null;
    },
    async write(path: string, contents: string) {
      assertSafePath(path);
      await ensureParent(path);
      await fileSystem.writeAsStringAsync(resolve(path), contents);
    },
    async move(from: string, to: string) {
      assertSafePath(from);
      assertSafePath(to);
      await ensureParent(to);
      const target = resolve(to);
      if ((await fileSystem.getInfoAsync(target)).exists) {
        await fileSystem.deleteAsync(target, { idempotent: true });
      }
      await fileSystem.moveAsync({ from: resolve(from), to: target });
    },
    async remove(path: string) {
      const uri = resolve(path);
      if ((await fileSystem.getInfoAsync(uri)).exists) {
        await fileSystem.deleteAsync(uri, { idempotent: true });
      }
    },
    async exists(path: string) {
      return (await fileSystem.getInfoAsync(resolve(path))).exists;
    },
  };
  return Object.freeze(storage);
}
