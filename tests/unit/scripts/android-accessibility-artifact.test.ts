import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ARTIFACT_PATH = join(process.cwd(), "artifacts", "spikes", "phase1-clean-release-save.xml");
const ANDROID_DENSITY = 420 / 160;
const MINIMUM_TOUCH_TARGET_PX = Math.floor(48 * ANDROID_DENSITY);

function attributesOf(node: string): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Array.from(node.matchAll(/([\w-]+)="([^"]*)"/g), (match) => [match[1], match[2]]),
    ),
  );
}

function boundsSize(bounds: string): Readonly<{ width: number; height: number }> | undefined {
  const match = /^\[(\d+),(\d+)]\[(\d+),(\d+)]$/.exec(bounds);
  if (!match) {
    return undefined;
  }
  const [, left, top, right, bottom] = match.map(Number);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    return undefined;
  }
  return Object.freeze({ width: right - left, height: bottom - top });
}

describe("captured Android accessibility hierarchy", () => {
  const hierarchy = readFileSync(ARTIFACT_PATH, "utf8");
  const nodes = Array.from(hierarchy.matchAll(/<node\b[^>]*>/g), (match) => attributesOf(match[0]));
  const clickableNodes = nodes.filter((node) => node.clickable === "true");

  it("gives every clickable control an accessible label", () => {
    const unlabeled = clickableNodes.filter(
      (node) => !(node["content-desc"] || node.text || node.hint)?.trim(),
    );

    expect(clickableNodes.length).toBeGreaterThan(0);
    expect(unlabeled).toEqual([]);
  });

  it("keeps clickable controls at least 48 dp in both dimensions", () => {
    const undersized = clickableNodes.filter((node) => {
      const size = boundsSize(node.bounds ?? "");
      return !size || size.width < MINIMUM_TOUCH_TARGET_PX || size.height < MINIMUM_TOUCH_TARGET_PX;
    });

    expect(undersized).toEqual([]);
  });

  it("names the editor region outside the WebView", () => {
    expect(
      nodes.some(
        (node) =>
          node["content-desc"] === "Markdown editor" &&
          node.class === "android.widget.LinearLayout",
      ),
    ).toBe(true);
  });
});
