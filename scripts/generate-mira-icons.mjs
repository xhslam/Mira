import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateImageAsync, createSquareAsync } = require("@expo/image-utils");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(projectRoot, "assets/branding/mira-mark.png");
const backgroundColor = "#F7F5F0";

// Package the generated artwork at launcher sizes without changing its geometry.
for (const [name, size, opaque] of [
  ["icon.png", 1024, true],
  ["android-icon-foreground.png", 1024, false],
  ["android-icon-monochrome.png", 1024, false],
  ["splash-icon.png", 1024, false],
  ["favicon.png", 48, true],
]) {
  const { source } = await generateImageAsync(
    { projectRoot },
    {
      src,
      width: size,
      height: size,
      resizeMode: "contain",
      ...(opaque ? { backgroundColor, removeTransparency: true } : {}),
    },
  );
  await writeFile(path.join(projectRoot, "assets", name), source);
}
await writeFile(
  path.join(projectRoot, "assets/android-icon-background.png"),
  await createSquareAsync({ size: 1024, color: backgroundColor }),
);
