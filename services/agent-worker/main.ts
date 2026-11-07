import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { id } from "./contract.ts";
import { createWorkerServer } from "./server.ts";
import { WorkerStore } from "./store.ts";

export function startWorker(env: NodeJS.ProcessEnv = process.env): void {
  // Private journal/database permissions also apply when SQLite creates recovery files.
  process.umask(0o077);
  const token = env.MIRA_WORKER_TOKEN;
  if (!token) throw new Error("MIRA_WORKER_TOKEN is required");
  const grants = (env.MIRA_WORKER_WORKSPACES ?? "")
    .split(",")
    .filter(Boolean)
    .map((value: string) => id(value.trim()));
  if (grants.length === 0 || grants.length > 100 || new Set(grants).size !== grants.length)
    throw new Error("MIRA_WORKER_WORKSPACES must contain 1..100 unique workspace IDs");
  const host = env.MIRA_WORKER_HOST ?? "127.0.0.1";
  // Remote binding requires an explicit second opt-in; TLS belongs at an authenticated reverse proxy.
  if (!["127.0.0.1", "::1", "localhost"].includes(host) && env.MIRA_WORKER_ALLOW_REMOTE !== "1")
    throw new Error("remote_bind_requires_explicit_opt_in");
  const portText = env.MIRA_WORKER_PORT ?? "4317";
  const port = Number(portText);
  if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("invalid_port");
  const path = env.MIRA_WORKER_DB ?? join(homedir(), ".mira-agent-worker", "worker.sqlite");
  const store = new WorkerStore(path, grants);
  let server;
  try {
    server = createWorkerServer(store, token);
  } catch (error) {
    store.close();
    throw error;
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    try {
      store.tick();
    } catch {
      console.error("Worker scheduler unavailable; authoritative database was not reset.");
    }
  };
  server.once("error", () => {
    if (timer) clearInterval(timer);
    store.close();
    console.error("Worker could not listen; check address/port configuration.");
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.info(
      `Mira worker v1 listening on ${host}:${port}; no external connectors or system push.`,
    );
    tick();
    timer = setInterval(tick, 15_000);
  });
  const stop = () => {
    if (timer) clearInterval(timer);
    server.close(() => store.close());
    server.closeIdleConnections();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    startWorker();
  } catch {
    console.error(
      "Worker startup rejected. Check token, workspace grants, bind settings and database integrity. No database was reset.",
    );
    process.exitCode = 1;
  }
}
