export type DomAssetInventory = Readonly<{
  html: readonly string[];
  javascript: readonly string[];
  sourceMaps: readonly string[];
}>;

export function getReleaseDomAssetDirectories(projectRoot: string): readonly string[];

export function cleanReleaseDomAssets(projectRoot: string): Promise<void>;

export function installKatexReleaseFonts(
  projectRoot: string,
  domAssetDirectory: string,
  options?: Readonly<{ cssDirectory?: string }>,
): Promise<readonly string[]>;

export function installExcalidrawReleaseFonts(
  projectRoot: string,
  domAssetDirectory: string,
  options?: Readonly<{ cssDirectory?: string }>,
): Promise<readonly string[]>;

export function readDomAssetInventory(directory: string): Promise<DomAssetInventory>;

export function assertSingleDomBundle(
  inventory: DomAssetInventory,
  directory: string,
  options?: Readonly<{ requireSourceMap?: boolean }>,
): void;
