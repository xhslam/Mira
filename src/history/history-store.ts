import type { DocumentId } from "../domain/identifiers";

export type HistorySnapshot = Readonly<{
  snapshotId: string;
  documentId: DocumentId;
  path: string;
  markdown: string;
  contentHash: string;
  createdAt: string;
  source: "auto" | "manual" | "restore";
  metadataOnly?: boolean;
}>;

export type AddHistorySnapshotInput = Omit<
  HistorySnapshot,
  "snapshotId" | "createdAt" | "metadataOnly"
>;

export interface HistoryStore {
  list(documentId: DocumentId): Promise<readonly HistorySnapshot[]>;
  add(input: AddHistorySnapshotInput): Promise<HistorySnapshot | null>;
  remove(snapshotId: string): Promise<void>;
  clear(documentId?: DocumentId): Promise<void>;
}
