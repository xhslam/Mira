import { z } from "zod";

import { parseDocumentId, type DocumentId } from "../domain/identifiers";
import { parseWorkspacePath } from "../workspace/workspace-path";
import type { VaultStorage } from "../workspace/vault-storage";
import type { RecoveryDraft, RecoveryDraftStore } from "./recovery-draft-store";

const INDEX_PATH = "recovery-drafts.json";

const recoveryDraftSchema = z
  .object({
    documentId: z.string(),
    path: z.string(),
    markdown: z.string(),
    revision: z.number().int().nonnegative(),
    baseHash: z.string().min(1).nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const recoveryIndexSchema = z
  .object({
    version: z.literal(1),
    drafts: z.array(recoveryDraftSchema),
  })
  .strict();

function validateAndFreezeDraft(input: unknown): RecoveryDraft {
  const parsed = recoveryDraftSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid recovery draft");

  const documentId = parseDocumentId(parsed.data.documentId);
  const path = parseWorkspacePath(parsed.data.path);
  if (!documentId.ok || !path.ok) throw new Error("Invalid recovery draft identity");

  return Object.freeze({
    documentId: documentId.value,
    path: path.value,
    markdown: parsed.data.markdown,
    revision: parsed.data.revision,
    baseHash: parsed.data.baseHash,
    updatedAt: parsed.data.updatedAt,
  });
}

function parseDrafts(contents: string | null): readonly RecoveryDraft[] {
  if (contents === null) return Object.freeze([]);
  const parsed = recoveryIndexSchema.safeParse(JSON.parse(contents) as unknown);
  if (!parsed.success) throw new Error("Invalid recovery index");
  const drafts = parsed.data.drafts.map(validateAndFreezeDraft).sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt);
    return updated === 0 ? right.revision - left.revision : updated;
  });
  const documentIds = new Set<DocumentId>();
  const paths = new Set<string>();
  return Object.freeze(
    drafts.filter((draft) => {
      if (documentIds.has(draft.documentId) || paths.has(draft.path)) return false;
      documentIds.add(draft.documentId);
      paths.add(draft.path);
      return true;
    }),
  );
}

export function createPrivateVaultRecoveryStore(storage: VaultStorage): RecoveryDraftStore {
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function readDrafts(): Promise<readonly RecoveryDraft[]> {
    return parseDrafts(await storage.read(INDEX_PATH));
  }

  async function writeDrafts(drafts: readonly RecoveryDraft[]): Promise<void> {
    await storage.write(INDEX_PATH, JSON.stringify({ version: 1, drafts }));
  }

  return Object.freeze({
    async list() {
      await operationTail;
      const drafts = await readDrafts();
      return Object.freeze(
        [...drafts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
    },
    async write(input: RecoveryDraft) {
      const draft = validateAndFreezeDraft(input);
      return serialize(async () => {
        const drafts = await readDrafts();
        const next = Object.freeze([
          ...drafts.filter((item) => item.documentId !== draft.documentId),
          draft,
        ]);
        await writeDrafts(next);
      });
    },
    async remove(documentId: DocumentId) {
      return serialize(async () => {
        const drafts = await readDrafts();
        await writeDrafts(drafts.filter((draft) => draft.documentId !== documentId));
      });
    },
  });
}
