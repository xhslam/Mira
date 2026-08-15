import { describe, expect, it } from "vitest";
import {
  parseYoutubeVtt,
  youtubeEmbedUrl,
  youtubeVideoId,
} from "../../../src/learning/youtube-learning";

describe("YouTube learning import", () => {
  it("recognizes standard, short and embedded YouTube video URLs", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain(
      "/embed/dQw4w9WgXcQ",
    );
  });

  it("parses timestamped captions and collapses repeated adjacent text", () => {
    const cues = parseYoutubeVtt(`WEBVTT

00:00:00.000 --> 00:00:01.000
Hello &amp; welcome.

00:00:01.050 --> 00:00:02.000
Hello &amp; welcome.

00:00:02.000 --> 00:00:04.500
<00:00:02.000>This is a test.`);
    expect(cues).toEqual([
      { index: 1, startMs: 0, endMs: 2_000, text: "Hello & welcome." },
      { index: 2, startMs: 2_000, endMs: 4_500, text: "This is a test." },
    ]);
  });
});
