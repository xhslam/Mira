import type { DocumentId } from "../domain/identifiers";

export type RecoveryDraft = Readonly<{
  documentId: DocumentId;
  path: string;
  markdown: string;
  revision: number;
  baseHash: string | null;
  updatedAt: string;
}>;

export type RecoveryDraftError = Readonly<{
  code: "INVALID_DRAFT" | "IO_FAILURE";
}>;

export interface RecoveryDraftStore {
  list(): Promise<readonly RecoveryDraft[]>;
  write(draft: RecoveryDraft): Promise<void>;
  remove(documentId: DocumentId): Promise<void>;
}
