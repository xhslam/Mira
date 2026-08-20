import { parseDocumentId, type DocumentId, type WorkspaceId } from "../domain/identifiers";
import type { WorkspacePath } from "./workspace-path";

export type WorkspaceDocumentDigest = (input: string) => Promise<string>;

export async function deriveWorkspaceDocumentId(
  workspaceId: WorkspaceId,
  path: WorkspacePath,
  digest: WorkspaceDocumentDigest,
): Promise<DocumentId> {
  const hash = (await digest(JSON.stringify([workspaceId, path]))).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Workspace identity digest returned an invalid SHA-256 digest");
  }

  const bytes = hash.slice(0, 32).split("");
  bytes[12] = "5";
  const variant = Number.parseInt(bytes[16] ?? "0", 16);
  bytes[16] = ((variant & 0x3) | 0x8).toString(16);
  const hexadecimal = bytes.join("");
  const value = `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
  const parsed = parseDocumentId(value);
  if (!parsed.ok) throw new Error("Workspace identity digest produced an invalid document ID");
  return parsed.value;
}
