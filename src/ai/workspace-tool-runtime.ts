import { z } from "zod";

import { AI_LIMITS } from "./limits";
import type { AiToolDefinition } from "./provider";
import type { WorkspaceRepository } from "../workspace/workspace-repository";
import type { WorkspaceSearch } from "../search/workspace-search";

export type AiToolCall = Readonly<{
  id: string;
  name: string;
  argumentsJson: string;
}>;

export type AiToolResult = Readonly<{
  callId: string;
  content: string;
  ok: boolean;
  audit: Readonly<{
    relativePath: string | null;
    resultCode: string;
    metadata: Readonly<Record<string, string | number | boolean | null>>;
  }>;
}>;

function result(
  callId: string,
  ok: boolean,
  content: Readonly<Record<string, unknown>>,
  audit: AiToolResult["audit"],
): AiToolResult {
  return Object.freeze({ callId, ok, content: JSON.stringify(content), audit });
}

export type AiToolRuntime = Readonly<{
  definitions: readonly AiToolDefinition[];
  execute(call: AiToolCall): Promise<AiToolResult>;
}>;

const searchSchema = z.object({ query: z.string().trim().min(1).max(500) }).strict();
const readSchema = z
  .object({
    path: z.string().trim().min(1).max(1_024).optional(),
    resultId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => (value.path ? 1 : 0) + (value.resultId ? 1 : 0) === 1);
const proposeReplaceSchema = z
  .object({
    path: z.string().trim().min(1).max(1_024),
    content: z.string(),
    explanation: z.string().trim().max(2_000).default(""),
  })
  .strict();

export type AiWritableNoteSnapshot = Readonly<{
  path: string;
  baseRevision: string | null;
  baseHash: string | null;
  baseContent: string;
}>;

function parseArguments(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return null;
  }
}

function boundedUtf8(source: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength <= maxBytes) return source;
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

export function createAiWorkspaceToolRuntime(
  options: Readonly<{
    repository: WorkspaceRepository;
    search: WorkspaceSearch;
    allowWholeWorkspaceSearch: boolean;
    authorizedPaths: readonly string[];
    createId: () => string;
    writableNotes?: readonly AiWritableNoteSnapshot[];
    createReplaceProposal?: (
      input: AiWritableNoteSnapshot & Readonly<{ content: string; explanation: string }>,
    ) => Promise<string>;
  }>,
): AiToolRuntime {
  const authorizedPaths = new Set(options.authorizedPaths);
  const writableNotes = new Map((options.writableNotes ?? []).map((note) => [note.path, note]));
  const resultGrants = new Map<string, Readonly<{ path: string; documentId: string }>>();
  const definitions: AiToolDefinition[] = [
    Object.freeze({
      name: "read_note",
      description:
        "Read a note already selected by the user, or a result returned by search_workspace in this run.",
      parameters: Object.freeze({
        type: "object",
        properties: Object.freeze({
          path: Object.freeze({ type: "string" }),
          resultId: Object.freeze({ type: "string", format: "uuid" }),
        }),
        additionalProperties: false,
      }),
    }),
  ];
  if (options.allowWholeWorkspaceSearch) {
    definitions.push(
      Object.freeze({
        name: "search_workspace",
        description:
          "Search the user's local note index. Returns bounded excerpts and run-scoped result IDs.",
        parameters: Object.freeze({
          type: "object",
          properties: Object.freeze({ query: Object.freeze({ type: "string" }) }),
          required: Object.freeze(["query"]),
          additionalProperties: false,
        }),
      }),
    );
  }
  if (options.createReplaceProposal && writableNotes.size > 0) {
    definitions.push(
      Object.freeze({
        name: "propose_note_update",
        description:
          "Propose a complete replacement for a user-selected note. This never writes the note; the user must review and explicitly apply the proposal.",
        parameters: Object.freeze({
          type: "object",
          properties: Object.freeze({
            path: Object.freeze({ type: "string" }),
            content: Object.freeze({ type: "string" }),
            explanation: Object.freeze({ type: "string" }),
          }),
          required: Object.freeze(["path", "content", "explanation"]),
          additionalProperties: false,
        }),
      }),
    );
  }

  return Object.freeze({
    definitions: Object.freeze(definitions),
    async execute(call) {
      if (call.name === "search_workspace") {
        if (!options.allowWholeWorkspaceSearch) {
          return result(
            call.id,
            false,
            { error: "WHOLE_WORKSPACE_PERMISSION_REQUIRED" },
            {
              relativePath: null,
              resultCode: "permission-denied",
              metadata: Object.freeze({}),
            },
          );
        }
        const parsed = searchSchema.safeParse(parseArguments(call.argumentsJson));
        if (!parsed.success) {
          return result(
            call.id,
            false,
            { error: "INVALID_ARGUMENTS" },
            {
              relativePath: null,
              resultCode: "invalid-arguments",
              metadata: Object.freeze({}),
            },
          );
        }
        const response = await options.search.search(
          parsed.data.query,
          "content",
          AI_LIMITS.maxSearchResults,
        );
        const results = response.results.map((result) => {
          const resultId = options.createId();
          resultGrants.set(
            resultId,
            Object.freeze({ path: result.path, documentId: result.documentId }),
          );
          return Object.freeze({
            resultId,
            path: result.path,
            excerpt: boundedUtf8(result.snippet, AI_LIMITS.maxSearchExcerptBytes),
            line: result.line,
          });
        });
        return result(
          call.id,
          true,
          { results },
          {
            relativePath: null,
            resultCode: "ok",
            metadata: Object.freeze({ resultCount: results.length }),
          },
        );
      }

      if (call.name === "read_note") {
        const parsed = readSchema.safeParse(parseArguments(call.argumentsJson));
        if (!parsed.success) {
          return result(
            call.id,
            false,
            { error: "INVALID_ARGUMENTS" },
            {
              relativePath: null,
              resultCode: "invalid-arguments",
              metadata: Object.freeze({}),
            },
          );
        }
        const grant = parsed.data.resultId ? resultGrants.get(parsed.data.resultId) : null;
        const path = parsed.data.path ?? grant?.path;
        if (!path || (!authorizedPaths.has(path) && grant === null)) {
          return result(
            call.id,
            false,
            { error: "NOTE_NOT_AUTHORIZED" },
            {
              relativePath: path ?? null,
              resultCode: "permission-denied",
              metadata: Object.freeze({}),
            },
          );
        }
        const read = await options.repository.read(path);
        if (!read.ok || (grant && read.value.documentId !== grant.documentId)) {
          const errorCode = read.ok ? "RESULT_STALE" : read.error.code;
          return result(
            call.id,
            false,
            { error: errorCode },
            {
              relativePath: path,
              resultCode: errorCode.toLocaleLowerCase(),
              metadata: Object.freeze({}),
            },
          );
        }
        return result(
          call.id,
          true,
          {
            path: read.value.path,
            contentHash: read.value.contentHash,
            content: boundedUtf8(read.value.markdown, AI_LIMITS.maxNoteReadBytes),
          },
          {
            relativePath: read.value.path,
            resultCode: "ok",
            metadata: Object.freeze({
              byteCount: new TextEncoder().encode(read.value.markdown).byteLength,
            }),
          },
        );
      }

      if (call.name === "propose_note_update") {
        const parsed = proposeReplaceSchema.safeParse(parseArguments(call.argumentsJson));
        if (!parsed.success) {
          return result(
            call.id,
            false,
            { error: "INVALID_ARGUMENTS" },
            {
              relativePath: null,
              resultCode: "invalid-arguments",
              metadata: Object.freeze({}),
            },
          );
        }
        const note = writableNotes.get(parsed.data.path);
        if (!note || !options.createReplaceProposal) {
          return result(
            call.id,
            false,
            { error: "NOTE_NOT_AUTHORIZED" },
            {
              relativePath: parsed.data.path,
              resultCode: "permission-denied",
              metadata: Object.freeze({}),
            },
          );
        }
        const byteCount = new TextEncoder().encode(parsed.data.content).byteLength;
        if (byteCount > AI_LIMITS.maxProposalBytes) {
          return result(
            call.id,
            false,
            { error: "PROPOSAL_TOO_LARGE" },
            {
              relativePath: parsed.data.path,
              resultCode: "limit-exceeded",
              metadata: Object.freeze({ byteCount }),
            },
          );
        }
        const proposalId = await options.createReplaceProposal({
          ...note,
          content: parsed.data.content,
          explanation: parsed.data.explanation,
        });
        return result(
          call.id,
          true,
          {
            proposalId,
            state: "pending_review",
            message: "The note was not changed. The user must review this proposal.",
          },
          {
            relativePath: parsed.data.path,
            resultCode: "proposal-created",
            metadata: Object.freeze({ byteCount }),
          },
        );
      }

      return result(
        call.id,
        false,
        { error: "UNKNOWN_TOOL" },
        {
          relativePath: null,
          resultCode: "unknown-tool",
          metadata: Object.freeze({}),
        },
      );
    },
  });
}
