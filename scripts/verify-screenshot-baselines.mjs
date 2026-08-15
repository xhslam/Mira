import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("artifacts/screenshot-baselines.json", "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.baselines)) {
  throw new Error("Invalid screenshot baseline manifest");
}
for (const baseline of manifest.baselines) {
  const digest = createHash("sha256")
    .update(await readFile(baseline.path))
    .digest("hex");
  if (digest !== baseline.sha256) throw new Error(`Screenshot baseline changed: ${baseline.path}`);
}
console.log(`Verified ${manifest.baselines.length} screenshot baselines.`);
