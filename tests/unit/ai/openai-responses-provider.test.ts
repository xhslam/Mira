import { describe, expect, test } from "vitest";

import type { AiHttpTransport } from "../../../src/ai/http-transport";
import { createOpenAiResponsesProvider } from "../../../src/ai/openai-responses-provider";
import type { AiProviderEvent } from "../../../src/ai/provider";
import type { AiProviderProfile } from "../../../src/ai/provider-profile";

const PROFILE = Object.freeze({
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "OpenAI",
  adapter: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5",
  connectionStatus: "connected",
  lastTestedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}) as AiProviderProfile;

describe("OpenAI Responses provider", () => {
  test("requests native search and normalizes citations and tools", async () => {
    let requestBody = "";
    async function* body() {
      yield 'data: {"type":"response.output_text.delta","delta":"Answer"}\n\n';
      yield 'data: {"type":"response.output_text.annotation.added","annotation":{"type":"url_citation","url":"https://example.com/source","title":"Source"}}\n\n';
      yield 'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_1","name":"read_note","arguments":"{\\"path\\":\\"a.md\\"}"}}\n\n';
      yield 'data: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":7}}}\n\n';
    }
    const transport: AiHttpTransport = Object.freeze({
      send: async (request) => {
        requestBody = request.body;
        return Object.freeze({ status: 200, headers: Object.freeze({}), body: body() });
      },
    });
    const events: AiProviderEvent[] = [];
    for await (const event of createOpenAiResponsesProvider(transport).stream({
      profile: PROFILE,
      apiKey: "sk-private",
      request: {
        messages: [{ role: "user", content: "Search" }],
        nativeWebSearch: true,
        tools: [{ name: "read_note", description: "Read", parameters: { type: "object" } }],
      },
    })) {
      events.push(event);
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      store: false,
      tools: [{ type: "web_search" }, { type: "function", name: "read_note", strict: true }],
    });
    expect(events).toEqual([
      { type: "text-delta", text: "Answer" },
      { type: "citation", url: "https://example.com/source", title: "Source" },
      { type: "tool-call", id: "call_1", name: "read_note", argumentsJson: '{"path":"a.md"}' },
      { type: "usage", inputTokens: 5, outputTokens: 7 },
      { type: "completed" },
    ]);
  });
});
