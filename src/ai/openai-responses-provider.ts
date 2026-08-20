import type { AiHttpTransport } from "./http-transport";
import { AiProviderError, type AiProvider, type AiProviderEvent } from "./provider";
import { asString, assertSuccessfulAiResponse, isRecord, parseJsonRecord } from "./provider-utils";
import { parseServerSentEvents } from "./sse";

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/responses`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function citationFromAnnotation(value: unknown): AiProviderEvent | null {
  if (!isRecord(value)) return null;
  const annotation = isRecord(value.annotation) ? value.annotation : value;
  if (annotation.type !== "url_citation") return null;
  const url = asString(annotation.url);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return Object.freeze({ type: "citation", url, title: asString(annotation.title) });
}

type ResponsesInputItem =
  | Readonly<{ role: "system" | "user" | "assistant"; content: string }>
  | Readonly<{
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }>
  | Readonly<{ type: "function_call_output"; call_id: string; output: string }>;

export function createOpenAiResponsesProvider(transport: AiHttpTransport): AiProvider {
  return Object.freeze({
    async *stream({ profile, apiKey, request, signal }): AsyncIterable<AiProviderEvent> {
      const tools: Readonly<Record<string, unknown>>[] = [];
      if (request.nativeWebSearch) tools.push(Object.freeze({ type: "web_search" }));
      for (const tool of request.tools ?? []) {
        tools.push(
          Object.freeze({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          }),
        );
      }
      const inputItems: ResponsesInputItem[] = [];
      for (const message of request.messages) {
        if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
          inputItems.push(
            ...message.toolCalls.map((call) =>
              Object.freeze({
                type: "function_call" as const,
                call_id: call.id,
                name: call.name,
                arguments: call.argumentsJson,
              }),
            ),
          );
          continue;
        }
        if (message.role === "tool") {
          inputItems.push(
            Object.freeze({
              type: "function_call_output",
              call_id: message.toolCallId ?? "",
              output: message.content,
            }),
          );
          continue;
        }
        inputItems.push(Object.freeze({ role: message.role, content: message.content }));
      }
      const response = await transport.send({
        url: endpoint(profile.baseUrl),
        headers: Object.freeze({
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "text/event-stream",
        }),
        body: JSON.stringify({
          model: profile.model,
          input: inputItems,
          stream: true,
          store: false,
          ...(tools.length > 0 ? { tools } : {}),
        }),
        ...(signal ? { signal } : {}),
      });
      assertSuccessfulAiResponse(response);
      let completed = false;
      for await (const data of parseServerSentEvents(response.body)) {
        if (data === "[DONE]") break;
        const event = parseJsonRecord(data);
        const type = asString(event.type);
        if (type === "response.output_text.delta") {
          const text = asString(event.delta);
          if (text) yield Object.freeze({ type: "text-delta", text });
          continue;
        }
        if (type === "response.output_text.annotation.added") {
          const citation = citationFromAnnotation(event);
          if (citation) yield citation;
          continue;
        }
        if (type === "response.output_item.done" && isRecord(event.item)) {
          if (event.item.type === "function_call") {
            const id = asString(event.item.call_id) ?? asString(event.item.id);
            const name = asString(event.item.name);
            const argumentsJson = asString(event.item.arguments);
            if (!id || !name || argumentsJson === null) {
              throw new AiProviderError(
                "invalid-response",
                "The AI provider returned an invalid tool call",
              );
            }
            yield Object.freeze({ type: "tool-call", id, name, argumentsJson });
          }
          continue;
        }
        if (type === "response.completed") {
          completed = true;
          const responseValue = isRecord(event.response) ? event.response : null;
          const usage = responseValue && isRecord(responseValue.usage) ? responseValue.usage : null;
          if (usage) {
            yield Object.freeze({
              type: "usage",
              inputTokens: numberOrNull(usage.input_tokens),
              outputTokens: numberOrNull(usage.output_tokens),
            });
          }
          continue;
        }
        if (type === "error" || type === "response.failed") {
          const error = isRecord(event.error) ? event.error : null;
          throw new AiProviderError(
            "invalid-response",
            (error && asString(error.message)) ?? "The AI provider returned an error",
          );
        }
      }
      if (!completed) {
        throw new AiProviderError("invalid-response", "The AI response stream ended unexpectedly");
      }
      yield Object.freeze({ type: "completed" });
    },
  });
}
