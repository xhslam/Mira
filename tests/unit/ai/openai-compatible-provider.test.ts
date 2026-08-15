import { describe, expect, test } from "vitest";

import type { AiHttpTransport } from "../../../src/ai/http-transport";
import { createOpenAiCompatibleProvider } from "../../../src/ai/openai-compatible-provider";
import type { AiProviderEvent, AiProviderRequest } from "../../../src/ai/provider";
import type { AiProviderProfile } from "../../../src/ai/provider-profile";

const PROFILE = Object.freeze({
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "DeepSeek",
  adapter: "openai-compatible-chat",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
  connectionStatus: "connected",
  lastTestedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}) as AiProviderProfile;

async function eventsFrom(chunks: readonly string[]): Promise<readonly AiProviderEvent[]> {
  async function* body() {
    for (const chunk of chunks) yield chunk;
  }
  const transport: AiHttpTransport = Object.freeze({
    send: async () => Object.freeze({ status: 200, headers: Object.freeze({}), body: body() }),
  });
  const request: AiProviderRequest = Object.freeze({
    messages: Object.freeze([{ role: "user" as const, content: "Hi" }]),
  });
  const events: AiProviderEvent[] = [];
  for await (const event of createOpenAiCompatibleProvider(transport).stream({
    profile: PROFILE,
    apiKey: "sk-private",
    request,
  })) {
    events.push(event);
  }
  return events;
}

describe("OpenAI-compatible provider", () => {
  test("normalizes text, fragmented tool calls, usage, and completion", async () => {
    const events = await eventsFrom([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_","arguments":"{\\"pa"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"note","arguments":"th\\":\\"a.md\\"}"}}]}}],"usage":{"prompt_tokens":4,"completion_tokens":6}}\n\n',
      "data: [DONE]\n\n",
    ]);
    expect(events).toEqual([
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "usage", inputTokens: 4, outputTokens: 6 },
      { type: "tool-call", id: "call_1", name: "read_note", argumentsJson: '{"path":"a.md"}' },
      { type: "completed" },
    ]);
  });

  test("omits stream_options so strict compatible endpoints accept the request", async () => {
    let sentBody: Record<string, unknown> = {};
    async function* body() {
      yield "data: [DONE]\n\n";
    }
    const provider = createOpenAiCompatibleProvider({
      send: async (input) => {
        sentBody = JSON.parse(input.body) as Record<string, unknown>;
        return Object.freeze({ status: 200, headers: Object.freeze({}), body: body() });
      },
    });
    for await (const _event of provider.stream({
      profile: PROFILE,
      apiKey: "sk-private",
      request: {
        messages: [{ role: "user", content: "Hi" }],
        tools: [
          {
            name: "read_note",
            description: "Read a note",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        ],
      },
    })) {
      // Only the request body is under test.
    }

    expect(sentBody).not.toHaveProperty("stream_options");
    expect(sentBody).toMatchObject({ model: "deepseek-v4-pro", stream: true, tool_choice: "auto" });
  });

  test("surfaces a streamed provider error instead of ending silently", async () => {
    await expect(
      eventsFrom(['data: {"error":{"message":"model not found"}}\n\n']),
    ).rejects.toMatchObject({ code: "invalid-response", message: "model not found" });
  });

  test("rejects a stream that ends without a completion marker", async () => {
    await expect(
      eventsFrom(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']),
    ).rejects.toMatchObject({ code: "invalid-response" });
  });

  test("rejects native search without contacting the provider", async () => {
    let contacted = false;
    const provider = createOpenAiCompatibleProvider({
      send: async () => {
        contacted = true;
        throw new Error("unexpected");
      },
    });
    await expect(async () => {
      for await (const _event of provider.stream({
        profile: PROFILE,
        apiKey: "sk-private",
        request: { messages: [], nativeWebSearch: true },
      })) {
        // No event is expected.
      }
    }).rejects.toMatchObject({ code: "invalid-response" });
    expect(contacted).toBe(false);
  });
});
