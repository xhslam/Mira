import { copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const RELEASE_DOM_ASSET_PATHS = Object.freeze([
  "generated/assets/react/release/www.bundle",
  "intermediates/assets/release/mergeReleaseAssets/www.bundle",
  "intermediates/compressed_assets/release/compressReleaseAssets/out/assets/www.bundle",
]);

const JAVASCRIPT_PATTERN = /\.js$/;
const SOURCE_MAP_PATTERN = /\.js\.map$/;
const HTML_PATTERN = /^[0-9a-f]{32}\.html$/;

const toPosixPath = (value) => value.split(path.sep).join("/");

const assertBuildTarget = (buildRoot, target) => {
  const relativePath = path.relative(buildRoot, target);
  const escapesBuildRoot =
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (escapesBuildRoot || path.basename(target) !== "www.bundle") {
    throw new Error(`Refusing to remove unexpected build path: ${target}`);
  }
};

const listFiles = async (directory, currentDirectory = directory) => {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(directory, entryPath);
      }
      return [toPosixPath(path.relative(directory, entryPath))];
    }),
  );

  return nestedFiles.flat();
};

export const getReleaseDomAssetDirectories = (projectRoot) => {
  const buildRoot = path.resolve(projectRoot, "android/app/build");
  return Object.freeze(
    RELEASE_DOM_ASSET_PATHS.map((relativePath) => path.resolve(buildRoot, relativePath)),
  );
};

export const cleanReleaseDomAssets = async (projectRoot) => {
  const buildRoot = path.resolve(projectRoot, "android/app/build");
  const targets = getReleaseDomAssetDirectories(projectRoot);
  targets.forEach((target) => assertBuildTarget(buildRoot, target));
  await Promise.all(targets.map((target) => rm(target, { force: true, recursive: true })));
};

export const installKatexReleaseFonts = async (projectRoot, domAssetDirectory, options = {}) => {
  const sourceDirectory = path.resolve(projectRoot, "node_modules/katex/dist/fonts");
  const targetDirectory = path.resolve(
    domAssetDirectory,
    options.cssDirectory ?? "_expo/static/css",
    "fonts",
  );
  const relativeTarget = path.relative(domAssetDirectory, targetDirectory);
  if (
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Refusing to install KaTeX fonts outside DOM assets: ${targetDirectory}`);
  }

  const fontFiles = (await readdir(sourceDirectory))
    .filter((file) => file.endsWith(".woff2"))
    .sort();
  if (fontFiles.length === 0) throw new Error("KaTeX WOFF2 fonts are missing.");

  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    fontFiles.map((file) =>
      copyFile(path.join(sourceDirectory, file), path.join(targetDirectory, file)),
    ),
  );
  return Object.freeze(fontFiles);
};

export const installExcalidrawReleaseFonts = async (
  projectRoot,
  domAssetDirectory,
  options = {},
) => {
  const sourceDirectory = path.resolve(
    projectRoot,
    "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  );
  const targetDirectory = path.resolve(domAssetDirectory, "fonts");
  const relativeTarget = path.relative(domAssetDirectory, targetDirectory);
  if (
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`Refusing to install Excalidraw fonts outside DOM assets: ${targetDirectory}`);
  }

  const fontFiles = (await listFiles(sourceDirectory))
    .filter((file) => file.endsWith(".woff2"))
    .sort();
  if (fontFiles.length === 0) throw new Error("Excalidraw WOFF2 fonts are missing.");

  await rm(targetDirectory, { force: true, recursive: true });
  await cp(sourceDirectory, targetDirectory, { recursive: true });

  if (options.cssDirectory) {
    const cssFontDirectory = path.resolve(domAssetDirectory, options.cssDirectory, "fonts");
    const relativeCssTarget = path.relative(domAssetDirectory, cssFontDirectory);
    if (
      relativeCssTarget === ".." ||
      relativeCssTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeCssTarget)
    ) {
      throw new Error(
        `Refusing to install Excalidraw CSS fonts outside DOM assets: ${cssFontDirectory}`,
      );
    }
    await mkdir(cssFontDirectory, { recursive: true });
    await cp(path.join(sourceDirectory, "Assistant"), path.join(cssFontDirectory, "Assistant"), {
      recursive: true,
    });
  }

  return Object.freeze(fontFiles);
};

export const readDomAssetInventory = async (directory) => {
  const files = await listFiles(directory);
  const normalizedFiles = files.map((file) => (file.endsWith(".jar") ? file.slice(0, -4) : file));
  const inventory = {
    html: Object.freeze(
      normalizedFiles.filter((file) => HTML_PATTERN.test(path.basename(file))).sort(),
    ),
    javascript: Object.freeze(
      normalizedFiles.filter((file) => JAVASCRIPT_PATTERN.test(path.basename(file))).sort(),
    ),
    sourceMaps: Object.freeze(
      normalizedFiles.filter((file) => SOURCE_MAP_PATTERN.test(path.basename(file))).sort(),
    ),
  };

  return Object.freeze(inventory);
};

export const assertSingleDomBundle = (inventory, directory, options = {}) => {
  const requireSourceMap = options.requireSourceMap ?? true;
  if (inventory.javascript.length !== 1) {
    throw new Error(
      `${directory} must contain exactly one JavaScript file so it can run fully offline; found ${inventory.javascript.length}.`,
    );
  }
  if (requireSourceMap && inventory.sourceMaps.length !== 1) {
    throw new Error(
      `${directory} must contain exactly one source map; found ${inventory.sourceMaps.length}.`,
    );
  }
  if (inventory.html.length !== 1) {
    throw new Error(
      `${directory} must contain exactly one HTML entry; found ${inventory.html.length}.`,
    );
  }

  const javascript = inventory.javascript[0];
  const sourceMap = inventory.sourceMaps[0];
  if (requireSourceMap && `${javascript}.map` !== sourceMap) {
    throw new Error(`${directory} source map does not match its JavaScript bundle generation.`);
  }
};
