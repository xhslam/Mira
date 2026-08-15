import { describe, expect, it } from "vitest";

import {
  bytesToDataUri,
  localResourcePaths,
  resolveLocalResourcePath,
} from "../../../src/formats/local-resource";

describe("local resources", () => {
  it("encodes bytes without text conversion", () => {
    expect(bytesToDataUri(new Uint8Array([0, 255, 137, 80]), "image/png")).toBe(
      "data:image/png;base64,AP+JUA==",
    );
  });

  it("discovers only relative Markdown images and resolves traversal safely", () => {
    expect(localResourcePaths("![a](../img/a.png) ![b](https://example.com/b.png)")).toEqual([
      "../img/a.png",
    ]);
    expect(resolveLocalResourcePath("notes/day.md", "../img/a.png")).toBe("img/a.png");
    expect(resolveLocalResourcePath("day.md", "../secret.png")).toBeNull();
  });
});
