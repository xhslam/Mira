import { strFromU8, strToU8 } from "fflate";

import type { WorkspaceRepository } from "../workspace/workspace-repository";
import type { BackupBinaryFile, BackupBinaryWorkspace } from "./backup-service";

export function createCompositeBackupWorkspace(
  repository: WorkspaceRepository,
  attachments: BackupBinaryWorkspace,
  isTextPath: (path: string) => boolean,
): BackupBinaryWorkspace {
  async function readText(path: string): Promise<BackupBinaryFile> {
    const result = await repository.read(path);
    if (!result.ok) throw new Error(path);
    return Object.freeze({
      path: result.value.path,
      contents: strToU8(result.value.markdown),
      revision: result.value.contentHash,
    });
  }

  return Object.freeze({
    async list() {
      const listed = await repository.list();
      if (!listed.ok) throw new Error("Managed text files could not be listed");
      const textFiles = listed.value.map((document) =>
        Object.freeze({
          path: document.path,
          contents: strToU8(document.markdown),
          revision: document.contentHash,
        }),
      );
      return Object.freeze([...textFiles, ...(await attachments.list())]);
    },
    async read(path) {
      return isTextPath(path) ? readText(path) : attachments.read(path);
    },
    async create(path, contents) {
      if (!isTextPath(path)) return attachments.create(path, contents);
      const result = await repository.create({ path, markdown: strFromU8(contents) });
      if (!result.ok) throw new Error(path);
    },
    async replace(path, contents, expectedRevision) {
      if (!isTextPath(path)) return attachments.replace(path, contents, expectedRevision);
      const result = await repository.writeVerified({
        path,
        expectedBaseHash: expectedRevision,
        markdown: strFromU8(contents),
      });
      if (!result.ok) throw new Error(path);
    },
    async remove(path) {
      if (!isTextPath(path)) return attachments.remove(path);
      const result = await repository.remove(path);
      if (!result.ok) throw new Error(path);
    },
  });
}
