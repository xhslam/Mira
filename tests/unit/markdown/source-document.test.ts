import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { openSourceDocument, serializeSourceDocument } from "../../../src/markdown/source-document";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/markdown/", import.meta.url));

const fixtures = [
  {
    name: "standard.md",
    sha256: "a93adf5759317002299e1d5abaa939439e1976551069922760cceadee27a98b5",
    lineEnding: "\r\n",
    hasFinalNewline: true,
  },
  {
    name: "cjk-and-whitespace.md",
    sha256: "accd70c725d4655c0f67b48be2c4c9ac658e7016b4e2c6d64e2da1745fdb8c59",
    lineEnding: "\n",
    hasFinalNewline: false,
  },
  {
    name: "unknown-extension.md",
    sha256: "eae4a569dc53ee16f121d5a875b19fc393add748237788fcf1b1d1d80df00a7b",
    lineEnding: "\n",
    hasFinalNewline: true,
  },
] as const;

async function sha256(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("source document preservation", () => {
  it.each(fixtures)("round-trips $name byte-for-byte without edits", async (fixture) => {
    const original = await readFile(`${fixtureDirectory}/${fixture.name}`);

    const result = await openSourceDocument(original, sha256);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(Buffer.from(serializeSourceDocument(result.value))).toEqual(original);
    expect(result.value.contentHash).toBe(fixture.sha256);
    expect(result.value.lineEnding).toBe(fixture.lineEnding);
    expect(result.value.hasFinalNewline).toBe(fixture.hasFinalNewline);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.originalBytes)).toBe(true);
  });

  it("proves the CRLF fixture and its expected digest are intact", async () => {
    const original = await readFile(`${fixtureDirectory}/standard.md`);

    expect(original.includes(Buffer.from([0x0d, 0x0a]))).toBe(true);
    expect(await sha256(original)).toBe(
      "a93adf5759317002299e1d5abaa939439e1976551069922760cceadee27a98b5",
    );
  });

  it("does not alias input bytes and emits replacement text exactly", async () => {
    const input = new Uint8Array([0x23, 0x20, 0x41, 0x0a]);
    const result = await openSourceDocument(input, sha256);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    input[0] = 0x58;

    expect(Buffer.from(serializeSourceDocument(result.value))).toEqual(
      Buffer.from("# A\n", "utf8"),
    );
    expect(Buffer.from(serializeSourceDocument(result.value, "替换\r\n"))).toEqual(
      Buffer.from("替换\r\n", "utf8"),
    );
  });

  it("contains invalid UTF-8 and hashing failures as typed results", async () => {
    const invalidUtf8 = await openSourceDocument(new Uint8Array([0xc3, 0x28]), sha256);
    const hashFailure = await openSourceDocument(new TextEncoder().encode("valid"), async () => {
      throw new Error("hash failed");
    });

    expect(invalidUtf8).toEqual({ ok: false, error: { code: "INVALID_UTF8" } });
    expect(hashFailure).toEqual({ ok: false, error: { code: "HASH_FAILED" } });
  });
});
