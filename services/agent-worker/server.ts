import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { array, id, object, WorkerError } from "./contract.ts";
import { WorkerStore } from "./store.ts";

const MAX_BODY = 1_048_576;
async function body(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? ""))
    throw new WorkerError(400, "json_required");
  if (Number(request.headers["content-length"] ?? 0) > MAX_BODY)
    throw new WorkerError(413, "body_too_large");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > MAX_BODY) throw new WorkerError(413, "body_too_large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkerError(400, "invalid_json");
  }
}
export function createWorkerServer(store: WorkerStore, token: string): Server {
  if (token.length < 32 || token.length > 512 || /\s/.test(token))
    throw new Error("MIRA_WORKER_TOKEN must contain 32..512 non-whitespace characters");
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const server = createServer(async (request, response) => {
    const send = (status: number, data: unknown) => {
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(JSON.stringify(data));
    };
    try {
      const header = request.headers.authorization ?? "";
      if (!timingSafeEqual(expected, createHash("sha256").update(header).digest()))
        throw new WorkerError(401, "unauthorized");
      const url = new URL(request.url ?? "/", "http://worker.local");
      if (url.pathname === "/v1/status" && request.method === "GET") {
        if (url.search) throw new WorkerError(400, "invalid_query");
        send(200, {
          protocolVersion: 1,
          service: "mira-agent-worker",
          serverTime: store.clock(),
          workspaces: [...store.grants],
          capabilities: {
            execution: "deterministic-item-review",
            email: false,
            messages: false,
            systemPush: false,
          },
          storage: store.health(),
        });
        return;
      }
      const match = /^\/v1\/workspaces\/([^/]+)\/(manifest|results|ack|runs)$/.exec(url.pathname);
      if (!match) throw new WorkerError(404, "not_found");
      const workspace = id(match[1]);
      store.authorize(workspace);
      const action = match[2];
      if (action === "manifest" && request.method === "PUT") {
        if (url.search) throw new WorkerError(400, "invalid_query");
        const input = await body(request);
        if ((input as { workspaceId?: unknown } | null)?.workspaceId !== workspace)
          throw new WorkerError(400, "workspace_mismatch");
        send(200, store.accept(input));
      } else if (action === "results" && request.method === "GET") {
        if (
          [...url.searchParams.keys()].some((key) => key !== "after" && key !== "limit") ||
          url.searchParams.getAll("after").length > 1 ||
          url.searchParams.getAll("limit").length > 1
        )
          throw new WorkerError(400, "invalid_query");
        const limit = url.searchParams.get("limit") ?? "50";
        if (!/^[1-9][0-9]{0,2}$/.test(limit)) throw new WorkerError(400, "invalid_pagination");
        send(200, store.results(workspace, url.searchParams.get("after") ?? "0", Number(limit)));
      } else if (action === "runs" && request.method === "GET") {
        if (
          [...url.searchParams.keys()].some((key) => key !== "limit") ||
          url.searchParams.getAll("limit").length > 1
        )
          throw new WorkerError(400, "invalid_query");
        const limit = url.searchParams.get("limit") ?? "50";
        if (!/^[1-9][0-9]{0,2}$/.test(limit)) throw new WorkerError(400, "invalid_pagination");
        send(200, store.runs(workspace, Number(limit)));
      } else if (action === "ack" && request.method === "POST") {
        if (url.search) throw new WorkerError(400, "invalid_query");
        const input = object(await body(request), ["protocolVersion", "resultIds"]);
        if (input.protocolVersion !== 1) throw new WorkerError(400, "invalid_protocol");
        const ids = array(input.resultIds, 100).map((value) => id(value));
        send(200, { protocolVersion: 1, acknowledged: store.ack(workspace, ids) });
      } else throw new WorkerError(404, "not_found");
    } catch (error) {
      if (!response.headersSent)
        send(error instanceof WorkerError ? error.status : 503, {
          protocolVersion: 1,
          error: error instanceof WorkerError ? error.message : "storage_unavailable",
        });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
