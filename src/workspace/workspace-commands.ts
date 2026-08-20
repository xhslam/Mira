import { z } from "zod";

import { failure, type Result, success } from "../domain/result";
import { parseWorkspacePath, type WorkspacePath } from "./workspace-path";
import type {
  FileEntry,
  TextWriteResult,
  WorkspaceAdapter,
  WorkspaceAdapterError,
} from "./workspace-adapter";

export type WorkspaceCommand =
  | Readonly<{ type: "create-file"; path: string; content: string }>
  | Readonly<{ type: "create-directory"; path: string }>
  | Readonly<{ type: "write-text"; path: string; content: string; expectedRevision: string | null }>
  | Readonly<{ type: "rename"; from: string; to: string }>
  | Readonly<{ type: "move"; from: string; to: string }>
  | Readonly<{ type: "copy"; from: string; to: string }>
  | Readonly<{ type: "remove"; path: string; mode: "trash" | "permanent" }>;

export type WorkspaceCommandResult = FileEntry | TextWriteResult | undefined;

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create-file"), path: z.string(), content: z.string() }).strict(),
  z.object({ type: z.literal("create-directory"), path: z.string() }).strict(),
  z
    .object({
      type: z.literal("write-text"),
      path: z.string(),
      content: z.string(),
      expectedRevision: z.string().nullable(),
    })
    .strict(),
  z.object({ type: z.literal("rename"), from: z.string(), to: z.string() }).strict(),
  z.object({ type: z.literal("move"), from: z.string(), to: z.string() }).strict(),
  z.object({ type: z.literal("copy"), from: z.string(), to: z.string() }).strict(),
  z
    .object({
      type: z.literal("remove"),
      path: z.string(),
      mode: z.enum(["trash", "permanent"]),
    })
    .strict(),
]);

export type WorkspaceCommandError = Readonly<{
  code: "INVALID_COMMAND" | "INVALID_PATH";
  message: string;
}>;

export function parseWorkspaceCommand(
  input: unknown,
): Result<WorkspaceCommand, WorkspaceCommandError> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      Object.freeze({ code: "INVALID_COMMAND", message: "Invalid workspace command" }),
    );
  }

  const paths =
    parsed.data.type === "rename" || parsed.data.type === "move" || parsed.data.type === "copy"
      ? [parsed.data.from, parsed.data.to]
      : [parsed.data.path];
  for (const path of paths) {
    if (!parseWorkspacePath(path).ok) {
      return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
    }
  }

  return success(Object.freeze(parsed.data) as WorkspaceCommand);
}

type CapabilityName = keyof WorkspaceAdapter["capabilities"];

function unsupported(path: string): Result<never, WorkspaceAdapterError> {
  return failure(
    Object.freeze({
      code: "UNSUPPORTED",
      path,
      message: "This workspace does not support that operation",
    }),
  );
}

function requireCapability(
  adapter: WorkspaceAdapter,
  capability: CapabilityName,
  path: string,
): Result<true, WorkspaceAdapterError> {
  return adapter.capabilities[capability] ? success(true) : unsupported(path);
}

function pathValue(input: string): WorkspacePath | null {
  const parsed = parseWorkspacePath(input);
  return parsed.ok ? parsed.value : null;
}

export async function executeWorkspaceCommand(
  adapter: WorkspaceAdapter,
  input: unknown,
): Promise<Result<WorkspaceCommandResult, WorkspaceAdapterError | WorkspaceCommandError>> {
  const parsed = parseWorkspaceCommand(input);
  if (!parsed.ok) return parsed;

  const command = parsed.value;
  if (command.type === "create-file") {
    const path = pathValue(command.path);
    if (!path)
      return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
    const allowed = requireCapability(adapter, "create", command.path);
    return allowed.ok ? adapter.createFile(path, command.content) : allowed;
  }
  if (command.type === "create-directory") {
    const path = pathValue(command.path);
    if (!path)
      return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
    const allowed = requireCapability(adapter, "create", command.path);
    return allowed.ok ? adapter.createDirectory(path) : allowed;
  }
  if (command.type === "write-text") {
    const path = pathValue(command.path);
    if (!path)
      return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
    const allowed = requireCapability(adapter, "write", command.path);
    return allowed.ok
      ? adapter.writeTextAtomic(path, command.content, command.expectedRevision)
      : allowed;
  }
  if (command.type === "remove") {
    const path = pathValue(command.path);
    if (!path)
      return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
    const capability = command.mode === "trash" ? "trash" : "remove";
    const allowed = requireCapability(adapter, capability, command.path);
    if (!allowed.ok) return allowed;
    const removed = await adapter.remove(path, command.mode);
    return removed.ok ? success(undefined) : removed;
  }

  const from = pathValue(command.from);
  const to = pathValue(command.to);
  if (!from || !to) {
    return failure(Object.freeze({ code: "INVALID_PATH", message: "Workspace path is invalid" }));
  }
  const capability = command.type;
  const allowed = requireCapability(adapter, capability, command.from);
  if (!allowed.ok) return allowed;
  if (command.type === "rename") return adapter.rename(from, to);
  if (command.type === "move") return adapter.move(from, to);
  return adapter.copy(from, to);
}
