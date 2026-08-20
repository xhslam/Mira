import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertSingleDomBundle,
  cleanReleaseDomAssets,
  getReleaseDomAssetDirectories,
  installExcalidrawReleaseFonts,
  installKatexReleaseFonts,
  readDomAssetInventory,
} from "../../../scripts/android-release-assets.mjs";

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "inkstone-release-assets-"));
  temporaryDirectories.push(directory);
  return directory;
};

const writeFixture = async (
  root: string,
  relativePath: string,
  contents = "fixture",
): Promise<void> => {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Android release DOM assets", () => {
  it("removes every generated release DOM asset directory", async () => {
    const projectRoot = await createTemporaryProject();
    const directories = getReleaseDomAssetDirectories(projectRoot);
    await Promise.all(
      directories.map((directory) => writeFixture(directory, "stale-generation.js")),
    );

    await cleanReleaseDomAssets(projectRoot);

    await expect(
      Promise.all(directories.map((directory) => readFile(directory, "utf8"))),
    ).rejects.toThrow();
  });

  it("preserves sibling Android build outputs", async () => {
    const projectRoot = await createTemporaryProject();
    const sibling = path.join(
      projectRoot,
      "android/app/build/generated/assets/react/release/index.android.bundle",
    );
    await writeFixture(projectRoot, path.relative(projectRoot, sibling), "native");

    await cleanReleaseDomAssets(projectRoot);

    await expect(readFile(sibling, "utf8")).resolves.toBe("native");
  });

  it("installs KaTeX WOFF2 fonts at the CSS-relative release path", async () => {
    const projectRoot = await createTemporaryProject();
    const domAssets = getReleaseDomAssetDirectories(projectRoot)[0];
    if (!domAssets) throw new Error("missing generated DOM asset directory");
    await writeFixture(
      projectRoot,
      "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2",
      "font",
    );

    const files = await installKatexReleaseFonts(projectRoot, domAssets);

    expect(files).toEqual(["KaTeX_Main-Regular.woff2"]);
    expect(Object.isFrozen(files)).toBe(true);
    await expect(
      readFile(path.join(domAssets, "_expo/static/css/fonts/KaTeX_Main-Regular.woff2"), "utf8"),
    ).resolves.toBe("font");
  });

  it("installs the complete Excalidraw font tree and CSS font subset", async () => {
    const projectRoot = await createTemporaryProject();
    const domAssets = getReleaseDomAssetDirectories(projectRoot)[0];
    if (!domAssets) throw new Error("missing generated DOM asset directory");
    await writeFixture(
      projectRoot,
      "node_modules/@excalidraw/excalidraw/dist/prod/fonts/Virgil/Virgil-Regular.woff2",
      "virgil",
    );
    await writeFixture(
      projectRoot,
      "node_modules/@excalidraw/excalidraw/dist/prod/fonts/Assistant/Assistant-Regular.woff2",
      "assistant",
    );

    const files = await installExcalidrawReleaseFonts(projectRoot, domAssets, {
      cssDirectory: "_expo/static/css",
    });

    expect(files).toEqual(["Assistant/Assistant-Regular.woff2", "Virgil/Virgil-Regular.woff2"]);
    expect(Object.isFrozen(files)).toBe(true);
    await expect(
      readFile(path.join(domAssets, "fonts/Virgil/Virgil-Regular.woff2"), "utf8"),
    ).resolves.toBe("virgil");
    await expect(
      readFile(
        path.join(domAssets, "_expo/static/css/fonts/Assistant/Assistant-Regular.woff2"),
        "utf8",
      ),
    ).resolves.toBe("assistant");
  });

  it("returns a deeply frozen inventory", async () => {
    const directory = await createTemporaryProject();
    await writeFixture(directory, "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js");
    await writeFixture(
      directory,
      "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js.map",
    );
    await writeFixture(directory, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html");

    const inventory = await readDomAssetInventory(directory);

    expect([
      Object.isFrozen(inventory),
      Object.isFrozen(inventory.html),
      Object.isFrozen(inventory.javascript),
      Object.isFrozen(inventory.sourceMaps),
    ]).toEqual([true, true, true, true]);
  });

  it("normalizes Android compressed-asset jar suffixes", async () => {
    const directory = await createTemporaryProject();
    await writeFixture(
      directory,
      "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js.jar",
    );
    await writeFixture(
      directory,
      "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js.map.jar",
    );
    await writeFixture(directory, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html.jar");

    const inventory = await readDomAssetInventory(directory);

    expect(() => assertSingleDomBundle(inventory, directory)).not.toThrow();
  });

  it("accepts one JavaScript bundle with its matching map and HTML entry", () => {
    const inventory = Object.freeze({
      html: Object.freeze(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html"]),
      javascript: Object.freeze(["_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"]),
      sourceMaps: Object.freeze([
        "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js.map",
      ]),
    });

    expect(() => assertSingleDomBundle(inventory, "www.bundle")).not.toThrow();
  });

  it("accepts a map-free standalone export only when explicitly requested", () => {
    const inventory = Object.freeze({
      html: Object.freeze(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html"]),
      javascript: Object.freeze(["963ef0720349fd3280452e9961a2db3a.js"]),
      sourceMaps: Object.freeze([]),
    });

    expect(() => assertSingleDomBundle(inventory, "www.bundle")).toThrow("one source map");
    expect(() =>
      assertSingleDomBundle(inventory, "www.bundle", { requireSourceMap: false }),
    ).not.toThrow();
  });

  it("rejects every additional JavaScript chunk, including shared runtime chunks", () => {
    const inventory = Object.freeze({
      html: Object.freeze(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html"]),
      javascript: Object.freeze([
        "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js",
        "_expo/static/js/web/__common-cccccccccccccccccccccccccccccccc.js",
      ]),
      sourceMaps: Object.freeze([
        "_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js.map",
      ]),
    });

    expect(() => assertSingleDomBundle(inventory, "www.bundle")).toThrow(
      "exactly one JavaScript file",
    );
  });

  it("rejects a source map from a different bundle generation", () => {
    const inventory = Object.freeze({
      html: Object.freeze(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.html"]),
      javascript: Object.freeze(["_expo/static/js/web/entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"]),
      sourceMaps: Object.freeze([
        "_expo/static/js/web/entry-cccccccccccccccccccccccccccccccc.js.map",
      ]),
    });

    expect(() => assertSingleDomBundle(inventory, "www.bundle")).toThrow("does not match");
  });
});
