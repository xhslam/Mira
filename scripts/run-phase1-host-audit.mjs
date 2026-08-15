import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const exportDirectory = mkdtempSync(join(tmpdir(), "vmark-phase1-android-export-"));

try {
  run(npmCommand, ["test"]);
  run(npmCommand, ["run", "typecheck"]);
  run(npmCommand, ["run", "lint"]);
  run(npxCommand, ["vitest", "bench", "--run", "tests/spikes"]);

  const autolinking = run(
    npxCommand,
    ["expo-modules-autolinking", "search", "--platform", "apple"],
    { capture: true },
  );
  if (!autolinking.includes("inkstone-workspace-access")) {
    throw new Error("The iOS workspace bookmark module was not discovered by Expo autolinking.");
  }
  process.stdout.write(autolinking);

  run(npxCommand, ["expo", "export", "--platform", "android", "--output-dir", exportDirectory], {
    // Expo 57's DOM serializer can reference an omitted __common asset when
    // split chunks are enabled. A single offline editor bundle is also the
    // desired production boundary for this app.
    env: { EXPO_NO_BUNDLE_SPLITTING: "1" },
  });
  process.stdout.write(
    "\nPhase 1 host audit passed. Physical-device gates remain intentionally separate.\n",
  );
} finally {
  rmSync(exportDirectory, { recursive: true, force: true });
}
