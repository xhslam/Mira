const REPOSITORY = "https://github.com/xhslam/Mira";
export const LATEST_ANDROID_RELEASE = "https://api.github.com/repos/xhslam/Mira/releases/latest";
export const UPDATE_APK = "Mira-Android.apk";

export type AndroidRelease = Readonly<{ build: number; url: string; sha256: string }>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function resolveAndroidRelease(
  payload: unknown,
  installedBuild: number,
): AndroidRelease | null {
  const release = record(payload);
  if (!release || release.draft !== false || release.prerelease !== false) return null;
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const match = /^android-([1-9]\d{0,8})$/u.exec(tag);
  if (!match || !Array.isArray(release.assets)) return null;
  const build = Number(match[1]);
  if (build <= installedBuild) return null;
  const url = `${REPOSITORY}/releases/download/${tag}/${UPDATE_APK}`;
  for (const item of release.assets as unknown[]) {
    const asset = record(item);
    if (
      asset?.name !== UPDATE_APK ||
      asset.browser_download_url !== url ||
      asset.state !== "uploaded"
    )
      continue;
    const digest =
      typeof asset.digest === "string" ? /^sha256:([a-f0-9]{64})$/u.exec(asset.digest) : null;
    if (digest?.[1]) return { build, url, sha256: digest[1] };
  }
  throw new Error("新版安装包尚未就绪，请稍后再试。");
}

export async function checkAndroidRelease(installedBuild: number, signal?: AbortSignal) {
  const response = await fetch(LATEST_ANDROID_RELEASE, {
    headers: { Accept: "application/vnd.github+json" },
    ...(signal ? { signal } : {}),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 暂时无法检查更新（${response.status}）。`);
  return resolveAndroidRelease(await response.json(), installedBuild);
}
