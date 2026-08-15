import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  assertSingleDomBundle,
  installExcalidrawReleaseFonts,
  installKatexReleaseFonts,
  readDomAssetInventory,
} from "./android-release-assets.mjs";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const arguments_ = process.argv.slice(2);
const outputDirectoryIndex = arguments_.findIndex((argument) => argument === "--output-dir");
const outputDirectory = path.resolve(
  outputDirectoryIndex >= 0 && arguments_[outputDirectoryIndex + 1]
    ? arguments_[outputDirectoryIndex + 1]
    : "dist",
);
const result = spawnSync(executable, ["expo", "export", "--platform", "android", ...arguments_], {
  env: { ...process.env, EXPO_NO_BUNDLE_SPLITTING: "1" },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const domAssetDirectory = path.join(outputDirectory, "www.bundle");
await installExcalidrawReleaseFonts(process.cwd(), domAssetDirectory);
await installKatexReleaseFonts(process.cwd(), domAssetDirectory, { cssDirectory: "" });
assertSingleDomBundle(await readDomAssetInventory(domAssetDirectory), domAssetDirectory, {
  requireSourceMap: false,
});
