import { strFromU8 } from "fflate";
import { describe, expect, test } from "vitest";

import { createCompositeBackupWorkspace } from "../../../src/backup/composite-backup-workspace";
import type { BackupBinaryWorkspace } from "../../../src/backup/backup-service";
import type { DocumentId } from "../../../src/domain/identifiers";
import { createMemoryWorkspaceRepository } from "../../../src/workspace/memory-workspace-repository";

function attachmentWorkspace() {
  const files = new Map<string, Uint8Array>([
    ["attachments/pixel.png", new Uint8Array([0, 255, 137, 80])],
  ]);
  const revision = (contents: Uint8Array) => [...contents].join("-");
  const workspace: BackupBinaryWorkspace = Object.freeze({
    async list() {
      return Object.freeze(
        [...files].map(([path, contents]) =>
          Object.freeze({ path, contents, revision: revision(contents) }),
        ),
      );
    },
    async read(path) {
      const contents = files.get(path);
      if (!contents) throw new Error(path);
      return Object.freeze({ path, contents, revision: revision(contents) });
    },
    async create(path, contents) {
      if (files.has(path)) throw new Error(path);
      files.set(path, new Uint8Array(contents));
    },
    async replace(path, contents, expectedRevision) {
      const current = files.get(path);
      if (!current || revision(current) !== expectedRevision) throw new Error(path);
      files.set(path, new Uint8Array(contents));
    },
    async remove(path) {
      if (!files.delete(path)) throw new Error(path);
    },
  });
  return { workspace, files } as const;
}

describe("managed composite backup workspace", () => {
  test("backs up and restores repository text together with binary attachments", async () => {
    const repository = createMemoryWorkspaceRepository({
      capabilities: Object.freeze({ atomicReplace: true, persistedExternalGrants: false }),
      createId: () => "223e4567-e89b-42d3-a456-426614174000" as DocumentId,
      hashMarkdown: async (markdown) => `hash:${markdown}`,
    });
    await repository.create({ path: "note.md", markdown: "hello" });
    const attachments = attachmentWorkspace();
    const composite = createCompositeBackupWorkspace(repository, attachments.workspace, (path) =>
      path.endsWith(".md"),
    );

    const listed = await composite.list();
    expect(listed.map((file) => file.path).sort()).toEqual(["attachments/pixel.png", "note.md"]);
    expect(strFromU8((await composite.read("note.md")).contents)).toBe("hello");

    const before = await composite.read("note.md");
    await composite.replace("note.md", new TextEncoder().encode("updated"), before.revision);
    expect(await repository.read("note.md")).toMatchObject({
      ok: true,
      value: { markdown: "updated" },
    });

    await composite.create("attachments/new.png", new Uint8Array([1, 2, 3]));
    expect([...attachments.files.get("attachments/new.png")!]).toEqual([1, 2, 3]);
  });
});
