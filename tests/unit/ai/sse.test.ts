import { describe, expect, test } from "vitest";

import { parseServerSentEvents } from "../../../src/ai/sse";

async function collect(chunks: readonly string[]): Promise<readonly string[]> {
  async function* source() {
    for (const chunk of chunks) yield chunk;
  }
  const events: string[] = [];
  for await (const event of parseServerSentEvents(source())) events.push(event);
  return events;
}

describe("server-sent event parser", () => {
  test("handles fragmented CRLF events, comments, and multi-line data", async () => {
    await expect(
      collect([": keepalive\r\nda", "ta: first\r\ndata: second\r\n\r\ndata: [DONE]\n\n"]),
    ).resolves.toEqual(["first\nsecond", "[DONE]"]);
  });
});
