import { afterEach, describe, expect, test, vi } from "vitest";
import { checkAndroidRelease, resolveAndroidRelease } from "../../../src/updates/android-release";

const url = "https://github.com/xhslam/Mira/releases/download/android-100042/Mira-Android.apk";
const sha256 = "a".repeat(64);
const manifest = { build: 100042, sha256 };

afterEach(() => vi.unstubAllGlobals());

describe("Android GitHub updates", () => {
  test("offers a newer build and derives its download URL without using manifest links", () => {
    expect(resolveAndroidRelease({ ...manifest, url: "https://example.org/" }, 100041)).toEqual({
      build: 100042,
      url,
      sha256,
    });
    expect(resolveAndroidRelease(manifest, 100042)).toBeNull();
    expect(resolveAndroidRelease(manifest, 100043)).toBeNull();
  });

  test.each([
    { build: "100042", sha256 },
    { build: 1e10, sha256 },
    { build: 1.5, sha256 },
    { build: 100042, sha256: null },
    { build: 100042, sha256: "x".repeat(64) },
  ])("rejects invalid version manifests", (invalid) => {
    expect(() => resolveAndroidRelease(invalid, 1)).toThrow();
  });

  test("uses a public release asset without the GitHub API quota or credentials", async () => {
    const fetchManifest = vi.fn().mockResolvedValueOnce(Response.json(manifest));
    vi.stubGlobal("fetch", fetchManifest);
    const signal = new AbortController().signal;
    await expect(checkAndroidRelease(1, signal)).resolves.toEqual({ build: 100042, url, sha256 });
    expect(fetchManifest).toHaveBeenCalledWith(
      "https://github.com/xhslam/Mira/releases/latest/download/Mira-Update.json",
      { signal },
    );
  });

  test("handles the absence of a release and reports other HTTP failures", async () => {
    const fetchManifest = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetchManifest.mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchManifest);
    await expect(checkAndroidRelease(1)).resolves.toBeNull();
    await expect(checkAndroidRelease(1)).rejects.toThrow("503");
  });
});
