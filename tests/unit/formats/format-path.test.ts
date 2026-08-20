import { describe, expect, it } from "vitest";

import {
  formatIdForPath,
  isEditableTextFormat,
  resolveFormatForPath,
  shouldIndexFormat,
} from "../../../src/formats/format-path";

describe("workspace format paths", () => {
  it.each([null, "", "text/plain", "text/plain; charset=utf-8", "application/octet-stream"])(
    "opens a legacy extensionless note as Markdown with MIME %s",
    (contentType) => {
      const format = resolveFormatForPath("备考", contentType);

      expect(format).toMatchObject({
        id: "markdown",
        defaultView: "wysiwyg",
        supportedViews: ["wysiwyg", "source", "reading"],
      });
    },
  );

  it("keeps explicit extensions and structured MIME types authoritative", () => {
    expect(formatIdForPath("README.md", "text/plain")).toBe("markdown");
    expect(formatIdForPath("settings.json", null)).toBe("json");
    expect(formatIdForPath("payload", "application/json")).toBe("json");
    expect(formatIdForPath(".env", null)).toBe("binary");
  });

  it("allows legacy extensionless notes through browser editing and indexing", () => {
    const entry = { name: "测试", contentType: null };

    expect(isEditableTextFormat(entry)).toBe(true);
    expect(shouldIndexFormat(entry)).toBe(true);
  });
});
