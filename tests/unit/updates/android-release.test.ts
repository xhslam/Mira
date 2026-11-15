import { describe, expect, test } from "vitest";
import { resolveAndroidRelease } from "../../../src/updates/android-release";

const url = "https://github.com/xhslam/Mira/releases/download/android-100042/Mira-Android.apk";
const sha256 = "a".repeat(64);
const asset = {
  name: "Mira-Android.apk",
  state: "uploaded",
  browser_download_url: url,
  digest: `sha256:${sha256}`,
};
const release = { draft: false, prerelease: false, tag_name: "android-100042", assets: [asset] };

describe("Android GitHub updates", () => {
  test("offers a newer published build with a verified download address and digest", () => {
    expect(resolveAndroidRelease(release, 100041)).toEqual({ build: 100042, url, sha256 });
    expect(resolveAndroidRelease(release, 100042)).toBeNull();
    expect(resolveAndroidRelease(release, 100043)).toBeNull();
  });

  test("ignores draft, preview and unrelated releases", () => {
    expect(resolveAndroidRelease({ ...release, draft: true }, 1)).toBeNull();
    expect(resolveAndroidRelease({ ...release, prerelease: true }, 1)).toBeNull();
    expect(resolveAndroidRelease({ ...release, tag_name: "v1.0.0" }, 1)).toBeNull();
  });

  test("rejects missing digests and APKs outside the release", () => {
    expect(() =>
      resolveAndroidRelease({ ...release, assets: [{ ...asset, digest: null }] }, 1),
    ).toThrow();
    expect(() =>
      resolveAndroidRelease(
        {
          ...release,
          assets: [{ ...asset, browser_download_url: url.replace("xhslam", "another") }],
        },
        1,
      ),
    ).toThrow();
  });
});
