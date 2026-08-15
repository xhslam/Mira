import { existsSync, readdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  assertSingleDomBundle,
  cleanReleaseDomAssets,
  getReleaseDomAssetDirectories,
  installExcalidrawReleaseFonts,
  installKatexReleaseFonts,
  readDomAssetInventory,
} from "./android-release-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDirectory = path.join(projectRoot, "android");
const gradleWrapper = path.join(
  androidDirectory,
  process.platform === "win32" ? "gradlew.bat" : "gradlew",
);

const findAndroidSdk = () => {
  const localAppData = process.env.LOCALAPPDATA;
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32" && localAppData
      ? path.join(localAppData, "Android", "Sdk")
      : undefined,
    process.platform === "darwin" && home
      ? path.join(home, "Library", "Android", "sdk")
      : undefined,
    process.platform === "linux" && home ? path.join(home, "Android", "Sdk") : undefined,
  ].filter((candidate) => typeof candidate === "string");
  const androidSdk = candidates.find((candidate) => existsSync(candidate));

  if (!androidSdk) {
    throw new Error("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT before building.");
  }
  return androidSdk;
};

const javaExecutable = process.platform === "win32" ? "java.exe" : "java";

const findNestedJavaHome = (directory, depth = 0) => {
  if (!directory || depth > 5 || !existsSync(directory)) return undefined;
  if (existsSync(path.join(directory, "bin", javaExecutable))) return directory;
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const found = findNestedJavaHome(path.join(directory, entry.name), depth + 1);
      if (found) return found;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const findJavaHome = () => {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const candidates = [
    process.env.JAVA_HOME,
    process.platform === "darwin"
      ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
      : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "Android Studio", "jbr")
      : undefined,
    process.platform === "linux" ? "/opt/android-studio/jbr" : undefined,
  ].filter((candidate) => typeof candidate === "string");
  const configured = candidates.find((candidate) =>
    existsSync(path.join(candidate, "bin", javaExecutable)),
  );
  if (configured) return configured;

  const gradleJdks = home ? path.join(home, ".gradle", "jdks") : undefined;
  const downloaded = findNestedJavaHome(gradleJdks);
  if (downloaded) return downloaded;
  throw new Error(
    "Java runtime not found. Install JDK 17+ or set JAVA_HOME before building Android.",
  );
};

const runGradle = (arguments_, environment) =>
  new Promise((resolve, reject) => {
    const child = spawn(gradleWrapper, ["-p", androidDirectory, ...arguments_], {
      cwd: projectRoot,
      env: environment,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.once("error", (error) => reject(error));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Gradle terminated by signal ${signal}.`
            : `Gradle exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });

const verifyDomAssets = async (directories) => {
  for (const directory of directories) {
    const inventory = await readDomAssetInventory(directory);
    assertSingleDomBundle(inventory, directory);
  }
};

const verifyFile = async (file, label) => {
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`${label} is missing or empty: ${file}`);
};

const buildRelease = async () => {
  if (!existsSync(gradleWrapper)) {
    throw new Error("Android project is missing. Run Expo prebuild before the release build.");
  }

  const androidSdk = findAndroidSdk();
  const javaHome = findJavaHome();
  const environment = Object.freeze({
    ...process.env,
    ANDROID_HOME: androidSdk,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
    NODE_ENV: "production",
    EXPO_NO_BUNDLE_SPLITTING: "1",
  });
  const assetDirectories = getReleaseDomAssetDirectories(projectRoot);
  const nativeBundle = path.join(
    androidDirectory,
    "app",
    "build",
    "generated",
    "assets",
    "react",
    "release",
    "index.android.bundle",
  );
  const apk = path.join(
    androidDirectory,
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release.apk",
  );

  await cleanReleaseDomAssets(projectRoot);
  await runGradle([":app:createBundleReleaseJsAndAssets", "--rerun-tasks"], environment);
  await installKatexReleaseFonts(projectRoot, assetDirectories[0]);
  await installExcalidrawReleaseFonts(projectRoot, assetDirectories[0], {
    cssDirectory: "_expo/static/css",
  });
  await verifyFile(nativeBundle, "Native release bundle");
  await verifyDomAssets(assetDirectories.slice(0, 1));
  await runGradle(["assembleRelease"], environment);
  await verifyDomAssets(assetDirectories);
  await verifyFile(apk, "Release APK");

  console.log(`Verified standalone release APK: ${apk}`);
};

try {
  await buildRelease();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Android release build failed: ${message}`);
  process.exitCode = 1;
}
