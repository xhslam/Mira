import { describe, expect, it } from "vitest";

import { createAttachmentImporter } from "../../../src/app/attachment-import";

describe("attachment importer", () => {
  it("stores a picked attachment beside a nested document with keep-both naming", async () => {
    const written: string[] = [];
    const importer = createAttachmentImporter({
      pick: async () => ({
        name: "diagram.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      }),
      exists: async (path) => path === "notes/attachments/diagram.png",
      write: async (path) => {
        written.push(path);
        return true;
      },
    });

    await expect(importer.pickAndStore("notes/page.md")).resolves.toEqual({
      ok: true,
      value: "attachments/diagram-2.png",
    });
    expect(written).toEqual(["notes/attachments/diagram-2.png"]);
  });

  it("rejects empty and oversized attachments before writing", async () => {
    const importer = createAttachmentImporter({
      pick: async () => ({ name: "empty.png", mimeType: "image/png", bytes: new Uint8Array() }),
      exists: async () => false,
      write: async () => true,
    });
    await expect(importer.pickAndStore("page.md")).resolves.toMatchObject({
      ok: false,
      error: { code: "TOO_LARGE" },
    });
  });
});
