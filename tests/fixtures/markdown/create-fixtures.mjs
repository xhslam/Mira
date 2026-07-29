import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const fixtureDirectory = fileURLToPath(new URL(".", import.meta.url));

const fixtures = Object.freeze([
  Object.freeze({
    name: "standard.md",
    bytes: Buffer.from(
      "# Standard\r\n\r\nParagraph with **bold**, *italic*, and `code`.\r\n\r\n- one\r\n- two\r\n",
      "utf8",
    ),
  }),
  Object.freeze({
    name: "cjk-and-whitespace.md",
    bytes: Buffer.from(
      "# 中文笔记\n\n保留  行内空格与尾随空格。  \n\n\\*转义星号\\* 和 **嵌套 *强调***",
      "utf8",
    ),
  }),
  Object.freeze({
    name: "unknown-extension.md",
    bytes: Buffer.from(
      "# Extension\n\n```future-note {mode=raw}\n<widget data-x=\"1\">\n  untouched\n</widget>\n```\n",
      "utf8",
    ),
  }),
]);

await mkdir(fixtureDirectory, { recursive: true });
await Promise.all(
  fixtures.map(({ name, bytes }) => writeFile(new URL(name, import.meta.url), bytes)),
);
