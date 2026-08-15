import { z } from "zod";

import { parseDocumentId, type DocumentId } from "../domain/identifiers";
import { parseWorkspacePath } from "../workspace/workspace-path";
import type { VaultStorage } from "../workspace/vault-storage";
import type { AddHistorySnapshotInput, HistorySnapshot, HistoryStore } from "./history-store";

const INDEX_PATH = "history-snapshots.json";
const INDEX_VERSION = 1 as const;
const MAX_SNAPSHOTS_PER_DOCUMENT = 50;
const RETENTION_DAYS = 30;
const MAX_HISTORY_BYTES = 256 * 1024 * 1024;
const AUTOSAVE_WINDOW_MS = 30 * 1_000;
const MAX_AUTOSAVE_CONTENT_BYTES = 1024 * 1024;

const historySnapshotSchema = z
  .object({
    snapshotId: z.string().min(1),
    documentId: z.string(),
    path: z.string(),
    markdown: z.string(),
    contentHash: z.string().min(1),
    createdAt: z.iso.datetime(),
    source: z.enum(["auto", "manual", "restore"]),
    metadataOnly: z.boolean().optional(),
  })
  .strict();

const historyIndexSchema = z
  .object({
    version: z.literal(INDEX_VERSION),
    snapshots: z.array(historySnapshotSchema),
  })
  .strict();

export type PrivateVaultHistoryStoreOptions = Readonly<{
  storage: VaultStorage;
  createId: () => string;
  now: () => Date;
  maxBytes?: number;
  maxSnapshotsPerDocument?: number;
  retentionDays?: number;
  autosaveWindowMs?: number;
}>;

function validateAndFreezeSnapshot(input: unknown): HistorySnapshot {
  const parsed = historySnapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid history snapshot");

  const documentId = parseDocumentId(parsed.data.documentId);
  const path = parseWorkspacePath(parsed.data.path);
  if (!documentId.ok || !path.ok) throw new Error("Invalid history snapshot identity");

  return Object.freeze({
    snapshotId: parsed.data.snapshotId,
    documentId: documentId.value,
    path: path.value,
    markdown: parsed.data.markdown,
    contentHash: parsed.data.contentHash,
    createdAt: parsed.data.createdAt,
    source: parsed.data.source,
    ...(parsed.data.metadataOnly ? { metadataOnly: true as const } : {}),
  });
}

function parseSnapshots(contents: string | null): readonly HistorySnapshot[] {
  if (contents === null) return Object.freeze([]);

  let decoded: unknown;
  try {
    decoded = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error("Invalid history index JSON", { cause: error });
  }

  const parsed = historyIndexSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("Invalid history index");
  return Object.freeze(parsed.data.snapshots.map(validateAndFreezeSnapshot));
}

function newestFirst(snapshots: readonly HistorySnapshot[]): readonly HistorySnapshot[] {
  return Object.freeze(
    [...snapshots].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  );
}

function markdownBytes(snapshot: HistorySnapshot): number {
  return new TextEncoder().encode(snapshot.markdown).byteLength;
}

function pruneSnapshots(
  snapshots: readonly HistorySnapshot[],
  now: Date,
  options: Readonly<{
    maxBytes: number;
    maxSnapshotsPerDocument: number;
    retentionDays: number;
  }>,
): readonly HistorySnapshot[] {
  const documentIds = Object.freeze([...new Set(snapshots.map((snapshot) => snapshot.documentId))]);
  const newestIds = Object.freeze(
    documentIds.flatMap((documentId) => {
      const newest = newestFirst(
        snapshots.filter((snapshot) => snapshot.documentId === documentId),
      )[0];
      return newest ? [newest.snapshotId] : [];
    }),
  );
  const cutoff = now.getTime() - options.retentionDays * 24 * 60 * 60 * 1_000;
  const withinAge = snapshots.filter(
    (snapshot) =>
      newestIds.includes(snapshot.snapshotId) || Date.parse(snapshot.createdAt) >= cutoff,
  );
  const withinCount = withinAge.filter((snapshot) => {
    const documentSnapshots = newestFirst(
      withinAge.filter((item) => item.documentId === snapshot.documentId),
    );
    return documentSnapshots
      .slice(0, options.maxSnapshotsPerDocument)
      .some((item) => item.snapshotId === snapshot.snapshotId);
  });

  let retained = Object.freeze([...withinCount]);
  let totalBytes = retained.reduce((total, snapshot) => total + markdownBytes(snapshot), 0);
  for (const snapshot of [...newestFirst(retained)].reverse()) {
    if (totalBytes <= options.maxBytes) break;
    if (newestIds.includes(snapshot.snapshotId)) continue;
    retained = Object.freeze(retained.filter((item) => item.snapshotId !== snapshot.snapshotId));
    totalBytes -= markdownBytes(snapshot);
  }
  return retained;
}

export function createPrivateVaultHistoryStore(
  options: PrivateVaultHistoryStoreOptions,
): HistoryStore {
  const maxBytes = options.maxBytes ?? MAX_HISTORY_BYTES;
  const maxSnapshotsPerDocument = options.maxSnapshotsPerDocument ?? MAX_SNAPSHOTS_PER_DOCUMENT;
  const retentionDays = options.retentionDays ?? RETENTION_DAYS;
  const autosaveWindowMs = options.autosaveWindowMs ?? AUTOSAVE_WINDOW_MS;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    !Number.isSafeInteger(maxSnapshotsPerDocument) ||
    maxSnapshotsPerDocument <= 0 ||
    !Number.isFinite(retentionDays) ||
    retentionDays <= 0 ||
    !Number.isSafeInteger(autosaveWindowMs) ||
    autosaveWindowMs <= 0
  ) {
    throw new Error("Invalid history retention options");
  }
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function readSnapshots(): Promise<readonly HistorySnapshot[]> {
    return parseSnapshots(await options.storage.read(INDEX_PATH));
  }

  async function writeSnapshots(snapshots: readonly HistorySnapshot[]): Promise<void> {
    await options.storage.write(INDEX_PATH, JSON.stringify({ version: INDEX_VERSION, snapshots }));
  }

  return Object.freeze({
    async list(documentId: DocumentId) {
      await operationTail;
      const parsedDocumentId = parseDocumentId(documentId);
      if (!parsedDocumentId.ok) throw new Error("Invalid history document identity");
      const snapshots = await readSnapshots();
      return newestFirst(
        snapshots.filter((snapshot) => snapshot.documentId === parsedDocumentId.value),
      );
    },

    async add(input: AddHistorySnapshotInput) {
      return serialize(async () => {
        const snapshots = await readSnapshots();
        const documentId = parseDocumentId(input.documentId);
        const path = parseWorkspacePath(input.path);
        const snapshotId = options.createId();
        const createdAtDate = options.now();
        const createdAt = createdAtDate.toISOString();
        if (!documentId.ok || !path.ok || snapshotId.length === 0) {
          throw new Error("Invalid history snapshot input");
        }

        const latest = newestFirst(
          snapshots.filter((snapshot) => snapshot.documentId === documentId.value),
        )[0];
        if (latest?.contentHash === input.contentHash) return null;
        const latestAutosave = newestFirst(
          snapshots.filter(
            (snapshot) => snapshot.documentId === documentId.value && snapshot.source === "auto",
          ),
        )[0];
        if (
          input.source === "auto" &&
          latestAutosave &&
          createdAtDate.getTime() - Date.parse(latestAutosave.createdAt) < autosaveWindowMs
        ) {
          return null;
        }

        const metadataOnly =
          input.source === "auto" &&
          new TextEncoder().encode(input.markdown).byteLength > MAX_AUTOSAVE_CONTENT_BYTES;
        const snapshot = validateAndFreezeSnapshot({
          ...input,
          markdown: metadataOnly ? "" : input.markdown,
          documentId: documentId.value,
          path: path.value,
          snapshotId,
          createdAt,
          ...(metadataOnly ? { metadataOnly: true as const } : {}),
        });
        if (markdownBytes(snapshot) > maxBytes) {
          throw new Error("History snapshot exceeds storage limit");
        }
        const retained = pruneSnapshots([...snapshots, snapshot], createdAtDate, {
          maxBytes,
          maxSnapshotsPerDocument,
          retentionDays,
        });
        await writeSnapshots(retained);
        return snapshot;
      });
    },

    async remove(snapshotId: string) {
      if (snapshotId.length === 0) throw new Error("Invalid history snapshot identity");
      return serialize(async () => {
        const snapshots = await readSnapshots();
        await writeSnapshots(
          Object.freeze(snapshots.filter((snapshot) => snapshot.snapshotId !== snapshotId)),
        );
      });
    },

    async clear(documentId?: DocumentId) {
      const parsed = documentId === undefined ? null : parseDocumentId(documentId);
      if (parsed !== null && !parsed.ok) throw new Error("Invalid history document identity");
      return serialize(async () => {
        if (parsed === null) {
          await writeSnapshots(Object.freeze([]));
          return;
        }
        const snapshots = await readSnapshots();
        await writeSnapshots(
          Object.freeze(snapshots.filter((snapshot) => snapshot.documentId !== parsed.value)),
        );
      });
    },
  });
}
