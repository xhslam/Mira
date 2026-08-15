import { describe, expect, it } from "vitest";

import { formatCjkSpacing } from "../../../src/markdown/cjk-format";

describe("formatCjkSpacing", () => {
  it("adds spacing at CJK and Latin/number boundaries", () => {
    expect(formatCjkSpacing("使用React18编写API接口")).toBe("使用 React18 编写 API 接口");
  });

  it("does not rewrite inline code or fenced code", () => {
    expect(formatCjkSpacing("中文`React18中文`测试\n```ts\nconst中文 = 1\n```")).toBe(
      "中文 `React18中文` 测试\n```ts\nconst中文 = 1\n```",
    );
  });
});
