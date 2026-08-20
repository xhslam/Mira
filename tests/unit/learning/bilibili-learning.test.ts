import { describe, expect, it } from "vitest";
import { bilibiliEmbedUrl, bilibiliVideoReference } from "../../../src/learning/bilibili-learning";

describe("哔哩哔哩本地视频引用", () => {
  it("识别 canonical BV 视频地址并生成官方外链播放器地址", () => {
    const sourceUrl = "https://www.bilibili.com/video/BV1B7411m7LV/?spm_id_from=333.1007";
    expect(bilibiliVideoReference(sourceUrl)).toEqual({ kind: "video", id: "BV1B7411m7LV" });
    expect(bilibiliEmbedUrl(sourceUrl)).toBe(
      "https://player.bilibili.com/player.html?autoplay=0&danmaku=0&bvid=BV1B7411m7LV",
    );
  });

  it("识别番剧 EP 链接，同时拒绝非哔哩哔哩和非视频链接", () => {
    expect(bilibiliVideoReference("https://www.bilibili.com/bangumi/play/ep1234567")).toEqual({
      kind: "episode",
      id: "ep1234567",
    });
    expect(bilibiliEmbedUrl("https://www.bilibili.com/bangumi/play/ep1234567")).toContain(
      "episodeId=ep1234567",
    );
    expect(bilibiliVideoReference("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(bilibiliVideoReference("https://www.bilibili.com/")).toBeNull();
  });
});
