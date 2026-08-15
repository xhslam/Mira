import { AI_LIMITS } from "./limits";
import { AiProviderError } from "./provider";

export type AiHttpRequest = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  signal?: AbortSignal;
}>;

export type AiHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: AsyncIterable<string>;
}>;

export type AiHttpTransport = Readonly<{
  send(request: AiHttpRequest): Promise<AiHttpResponse>;
}>;

export function createFetchAiHttpTransport(
  fetcher: typeof fetch = fetch,
  idleTimeoutMs = AI_LIMITS.networkIdleTimeoutMs,
): AiHttpTransport {
  return Object.freeze({
    async send(request) {
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      request.signal?.addEventListener("abort", abort, { once: true });
      let timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, idleTimeoutMs);
      let response: Response;
      try {
        response = await fetcher(request.url, {
          method: "POST",
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abort);
        if (timedOut) throw new AiProviderError("timeout", "The AI provider timed out");
        if (request.signal?.aborted) {
          throw new AiProviderError("cancelled", "The AI request was cancelled");
        }
        throw new AiProviderError(
          "network-failed",
          error instanceof Error ? error.message : "The AI provider could not be reached",
        );
      }

      const headers = Object.freeze(Object.fromEntries(response.headers.entries()));
      const body = (async function* (): AsyncIterable<string> {
        try {
          if (response.body === null) {
            const text = await response.text();
            if (text) yield text;
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const item = await reader.read();
            clearTimeout(timeout);
            if (item.done) {
              const tail = decoder.decode();
              if (tail) yield tail;
              return;
            }
            timeout = setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, idleTimeoutMs);
            const text = decoder.decode(item.value, { stream: true });
            if (text) yield text;
          }
        } catch (error) {
          if (timedOut) throw new AiProviderError("timeout", "The AI provider timed out");
          if (request.signal?.aborted) {
            throw new AiProviderError("cancelled", "The AI request was cancelled");
          }
          throw new AiProviderError(
            "network-failed",
            error instanceof Error ? error.message : "The AI response stream failed",
          );
        } finally {
          clearTimeout(timeout);
          request.signal?.removeEventListener("abort", abort);
        }
      })();
      return Object.freeze({ status: response.status, headers, body });
    },
  });
}
