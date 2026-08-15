import type { AiHttpTransport } from "./http-transport";
import {
  AiProviderError,
  type AiProvider,
  type AiProviderEvent,
  type AiProviderMessage,
} from "./provider";
import { asString, assertSuccessfulAiResponse, isRecord, parseJsonRecord } from "./provider-utils";
import { parseServerSentEvents } from "./sse";

type PendingToolCall = { id: string; name: string; argumentsJson: string };

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function providerMessage(message: AiProviderMessage): Readonly<Record<string, unknown>> {
  if (message.role === "tool") {
    return Object.freeze({
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId ?? "",
    });
  }
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return Object.freeze({
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) =>
        Object.freeze({
          id: call.id,
          type: "function",
          function: Object.freeze({ name: call.name, arguments: call.argumentsJson }),
        }),
      ),
    });
  }
  return Object.freeze({ role: message.role, content: message.content });
}

function updateToolCalls(value: unknown, pending: Map<number, PendingToolCall>): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item) || typeof item.index !== "number" || !Number.isInteger(item.index))
      continue;
    const current = pending.get(item.index) ?? { id: "", name: "", argumentsJson: "" };
    const fn = isRecord(item.function) ? item.function : null;
    pending.set(item.index, {
      id: current.id || asString(item.id) || "",
      name: current.name + (fn ? asString(fn.name) || "" : ""),
      argumentsJson: current.argumentsJson + (fn ? asString(fn.arguments) || "" : ""),
    });
  }
}

function usageEvent(value: unknown): AiProviderEvent | null {
  if (!isRecord(value)) return null;
  const inputTokens =
    typeof value.prompt_tokens === "number" && Number.isFinite(value.prompt_tokens)
      ? value.prompt_tokens
      : null;
  const outputTokens =
    typeof value.completion_tokens === "number" && Number.isFinite(value.completion_tokens)
      ? value.completion_tokens
      : null;
  return Object.freeze({ type: "usage", inputTokens, outputTokens });
}

export function createOpenAiCompatibleProvider(transport: AiHttpTransport): AiProvider {
  return Object.freeze({
    async *stream({ profile, apiKey, request, signal }): AsyncIterable<AiProviderEvent> {
      if (request.nativeWebSearch) {
        throw new AiProviderError(
          "invalid-response",
          "This provider profile does not support native web search",
        );
      }
      const body = Object.freeze({
        model: profile.model,
        messages: request.messages.map(providerMessage),
        stream: true,
        // Many OpenAI-compatible providers reject `stream_options` even
        // though they support ordinary SSE streaming. Usage is optional in the
        // UI, so do not make it a compatibility requirement.
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((tool) =>
                Object.freeze({
                  type: "function",
                  function: Object.freeze({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  }),
                }),
              ),
              tool_choice: "auto",
            }
          : {}),
      });
      const response = await transport.send({
        url: endpoint(profile.baseUrl),
        headers: Object.freeze({
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "text/event-stream",
        }),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      assertSuccessfulAiResponse(response);
      const pendingTools = new Map<number, PendingToolCall>();
      let completed = false;
      for await (const data of parseServerSentEvents(response.body)) {
        if (data === "[DONE]") {
          completed = true;
          break;
        }
        const event = parseJsonRecord(data);
        const error = isRecord(event.error) ? event.error : null;
        if (error) {
          throw new AiProviderError(
            "invalid-response",
            asString(error.message) ?? "The AI provider returned an error",
          );
        }
        const usage = usageEvent(event.usage);
        if (usage) yield usage;
        const choices = Array.isArray(event.choices) ? event.choices : [];
        const first = choices[0];
        if (!isRecord(first) || !isRecord(first.delta)) continue;
        const text = asString(first.delta.content);
        if (text) yield Object.freeze({ type: "text-delta", text });
        updateToolCalls(first.delta.tool_calls, pendingTools);
      }
      if (!completed) {
        throw new AiProviderError("invalid-response", "The AI response stream ended unexpectedly");
      }
      for (const tool of [...pendingTools.values()]) {
        if (!tool.id || !tool.name) {
          throw new AiProviderError(
            "invalid-response",
            "The AI provider returned an invalid tool call",
          );
        }
        yield Object.freeze({
          type: "tool-call",
          id: tool.id,
          name: tool.name,
          argumentsJson: tool.argumentsJson,
        });
      }
      yield Object.freeze({ type: "completed" });
    },
  });
}
