import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const { generateImageAsync, createSquareAsync } = require("@expo/image-utils");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(projectRoot, "assets/branding/mira-mark.png");
const backgroundColor = "#F2EDE1";

const launcher = path.join(projectRoot, "assets/branding/mira-launcher-source.png");
for (const [name, size, artwork] of [
  ["icon.png", 1024, launcher],
  ["splash-icon.png", 1024, src],
  ["favicon.png", 48, launcher],
]) {
  const { source } = await generateImageAsync(
    { projectRoot },
    { src: artwork, width: size, height: size, resizeMode: "contain" },
  );
  await writeFile(path.join(projectRoot, "assets", name), source);
}

// Keep the mark inside Android's adaptive icon safe area on circular launchers.
const { source } = await generateImageAsync(
  { projectRoot },
  { src, width: 614, height: 614, resizeMode: "contain" },
);
const mark = PNG.sync.read(source);
const foreground = new PNG({ width: 1024, height: 1024 });
PNG.bitblt(mark, foreground, 0, 0, mark.width, mark.height, 205, 205);
await writeFile(
  path.join(projectRoot, "assets/android-icon-foreground.png"),
  PNG.sync.write(foreground),
);
for (let offset = 0; offset < foreground.data.length; offset += 4) {
  foreground.data.fill(255, offset, offset + 3);
}
await writeFile(
  path.join(projectRoot, "assets/android-icon-monochrome.png"),
  PNG.sync.write(foreground),
);
await writeFile(
  path.join(projectRoot, "assets/android-icon-background.png"),
  await createSquareAsync({ size: 1024, color: backgroundColor }),
);
