import { describe, expect, it } from "vitest";

import type { WorkspaceRepository } from "../../src/workspace/workspace-repository";

export type WorkspaceRepositoryFactory = () => WorkspaceRepository;

function expectSuccess<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("expected repository operation to succeed");
  }
  return result.value;
}

export function workspaceRepositoryContract(
  implementationName: string,
  createRepository: WorkspaceRepositoryFactory,
): void {
  describe(`${implementationName} workspace repository contract`, () => {
    it("returns deeply frozen, non-aliased list and read snapshots", async () => {
      const repository = createRepository();
      const created = expectSuccess(
        await repository.create({ path: "notes/first.md", markdown: "# First\n" }),
      );

      const firstRead = expectSuccess(await repository.read("notes/first.md"));
      const secondRead = expectSuccess(await repository.read("notes/first.md"));
      const listed = expectSuccess(await repository.list());

      expect(listed).toEqual([created]);
      expect(Object.isFrozen(listed)).toBe(true);
      expect(Object.isFrozen(listed[0])).toBe(true);
      expect(firstRead).toEqual(created);
      expect(firstRead).not.toBe(created);
      expect(secondRead).not.toBe(firstRead);
      expect(listed[0]).not.toBe(firstRead);
    });

    it("rejects create collisions without changing the original", async () => {
      const repository = createRepository();
      const original = expectSuccess(
        await repository.create({ path: "notes/collision.md", markdown: "original" }),
      );

      const collision = await repository.create({
        path: "notes/collision.md",
        markdown: "replacement",
      });

      expect(collision).toEqual({
        ok: false,
        error: { code: "ALREADY_EXISTS", path: "notes/collision.md" },
      });
      expect(Object.isFrozen(collision)).toBe(true);
      if (!collision.ok) {
        expect(Object.isFrozen(collision.error)).toBe(true);
      }
      expect(expectSuccess(await repository.read("notes/collision.md"))).toEqual(original);
    });

    it("allows only one concurrent create for the same path", async () => {
      const repository = createRepository();

      const results = await Promise.all([
        repository.create({ path: "notes/concurrent.md", markdown: "first" }),
        repository.create({ path: "notes/concurrent.md", markdown: "second" }),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        {
          ok: false,
          error: { code: "ALREADY_EXISTS", path: "notes/concurrent.md" },
        },
      ]);
    });

    it("requires the expected base hash and returns a verified new hash", async () => {
      const repository = createRepository();
      const created = expectSuccess(
        await repository.create({ path: "notes/write.md", markdown: "one" }),
      );

      const written = expectSuccess(
        await repository.writeVerified({
          path: "notes/write.md",
          expectedBaseHash: created.contentHash,
          markdown: "two",
        }),
      );
      const stale = await repository.writeVerified({
        path: "notes/write.md",
        expectedBaseHash: created.contentHash,
        markdown: "three",
      });

      expect(written.contentHash).not.toBe(created.contentHash);
      expect(written.markdown).toBe("two");
      expect(stale).toEqual({
        ok: false,
        error: { code: "EXTERNAL_MODIFICATION", path: "notes/write.md" },
      });
      expect(expectSuccess(await repository.read("notes/write.md"))).toEqual(written);
    });

    it("allows only one concurrent write for the same base hash", async () => {
      const repository = createRepository();
      const created = expectSuccess(
        await repository.create({ path: "notes/concurrent-write.md", markdown: "base" }),
      );

      const results = await Promise.all([
        repository.writeVerified({
          path: "notes/concurrent-write.md",
          expectedBaseHash: created.contentHash,
          markdown: "first",
        }),
        repository.writeVerified({
          path: "notes/concurrent-write.md",
          expectedBaseHash: created.contentHash,
          markdown: "second",
        }),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        {
          ok: false,
          error: { code: "EXTERNAL_MODIFICATION", path: "notes/concurrent-write.md" },
        },
      ]);
    });

    it("preserves document identity across rename and rejects target collisions", async () => {
      const repository = createRepository();
      const original = expectSuccess(
        await repository.create({ path: "notes/old.md", markdown: "old" }),
      );
      await repository.create({ path: "notes/existing.md", markdown: "existing" });

      const collision = await repository.rename({
        from: "notes/old.md",
        to: "notes/existing.md",
      });
      const renamed = expectSuccess(
        await repository.rename({ from: "notes/old.md", to: "notes/new.md" }),
      );

      expect(collision).toEqual({
        ok: false,
        error: { code: "ALREADY_EXISTS", path: "notes/existing.md" },
      });
      expect(renamed.documentId).toBe(original.documentId);
      expect(renamed.path).toBe("notes/new.md");
      expect(await repository.read("notes/old.md")).toEqual({
        ok: false,
        error: { code: "NOT_FOUND", path: "notes/old.md" },
      });
    });

    it("never removes data for an escaping or malformed path", async () => {
      const repository = createRepository();
      const original = expectSuccess(
        await repository.create({ path: "notes/safe.md", markdown: "safe" }),
      );

      const traversal = await repository.remove("../notes/safe.md");
      const absolute = await repository.remove("/notes/safe.md");

      expect(traversal).toEqual({
        ok: false,
        error: { code: "INVALID_PATH", path: "../notes/safe.md" },
      });
      expect(absolute).toEqual({
        ok: false,
        error: { code: "INVALID_PATH", path: "/notes/safe.md" },
      });
      expect(expectSuccess(await repository.read("notes/safe.md"))).toEqual(original);

      const removed = expectSuccess(await repository.remove("notes/safe.md"));
      expect(removed.documentId).toBe(original.documentId);
      expect(Object.isFrozen(removed)).toBe(true);
      expect(await repository.read("notes/safe.md")).toEqual({
        ok: false,
        error: { code: "NOT_FOUND", path: "notes/safe.md" },
      });
    });
  });
}
