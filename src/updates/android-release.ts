const REPOSITORY = "https://github.com/xhslam/Mira";
export const LATEST_ANDROID_RELEASE = `${REPOSITORY}/releases/latest/download/Mira-Update.json`;
export const UPDATE_APK = "Mira-Android.apk";

export type AndroidRelease = Readonly<{ build: number; url: string; sha256: string }>;

export function resolveAndroidRelease(
  payload: unknown,
  installedBuild: number,
): AndroidRelease | null {
  const manifest =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const build = manifest?.build;
  const sha256 = manifest?.sha256;
  if (
    typeof build !== "number" ||
    !Number.isInteger(build) ||
    build < 1 ||
    build > 999_999_999 ||
    typeof sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(sha256)
  ) {
    throw new Error("新版安装包的版本信息无效，请稍后再试。");
  }
  if (build <= installedBuild) return null;
  return { build, url: `${REPOSITORY}/releases/download/android-${build}/${UPDATE_APK}`, sha256 };
}

export async function checkAndroidRelease(installedBuild: number, signal?: AbortSignal) {
  const response = await fetch(LATEST_ANDROID_RELEASE, signal ? { signal } : undefined);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 暂时无法检查更新（${response.status}）。`);
  return resolveAndroidRelease(await response.json(), installedBuild);
}
