import { failure, type Result, success } from "../domain/result";
import { parseWorkspacePath, type WorkspacePath } from "../workspace/workspace-path";

export type PickedAttachment = Readonly<{
  name: string;
  mimeType: string | null;
  bytes: Uint8Array;
}>;

export type AttachmentImportError = Readonly<{
  code: "CANCELLED" | "INVALID_FILE" | "TOO_LARGE" | "WRITE_FAILED";
  message: string;
}>;

export type AttachmentImporter = Readonly<{
  pickAndStore(documentPath: string): Promise<Result<string, AttachmentImportError>>;
}>;

type AttachmentImporterOptions = Readonly<{
  pick: () => Promise<PickedAttachment | null>;
  exists: (path: WorkspacePath) => Promise<boolean>;
  write: (path: WorkspacePath, bytes: Uint8Array, mimeType: string | null) => Promise<boolean>;
}>;

function safeFileName(name: string): string | null {
  const leaf = name.normalize("NFC").split(/[\\/]/).at(-1) ?? "";
  const safe = leaf.replace(/[\u0000-\u001f<>:"|?*]/g, "-").trim();
  if (!safe || safe === "." || safe === ".." || safe.length > 180) return null;
  return safe;
}

function candidateName(name: string, index: number): string {
  if (index === 1) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-${index}${name.slice(dot)}` : `${name}-${index}`;
}

export function createAttachmentImporter(options: AttachmentImporterOptions): AttachmentImporter {
  return Object.freeze({
    async pickAndStore(documentPath) {
      const picked = await options.pick();
      if (picked === null) {
        return failure(Object.freeze({ code: "CANCELLED", message: "No attachment was selected" }));
      }
      if (picked.bytes.byteLength === 0 || picked.bytes.byteLength > 20 * 1024 * 1024) {
        return failure(
          Object.freeze({
            code: "TOO_LARGE",
            message: "Attachments must be between 1 byte and 20 MiB",
          }),
        );
      }
      const name = safeFileName(picked.name);
      if (name === null) {
        return failure(
          Object.freeze({ code: "INVALID_FILE", message: "The attachment name is not portable" }),
        );
      }
      const documentDirectory = documentPath.includes("/")
        ? documentPath.slice(0, documentPath.lastIndexOf("/"))
        : "";
      for (let index = 1; index <= 1_000; index += 1) {
        const relative = `attachments/${candidateName(name, index)}`;
        const full = documentDirectory ? `${documentDirectory}/${relative}` : relative;
        const parsed = parseWorkspacePath(full);
        if (!parsed.ok) break;
        if (await options.exists(parsed.value)) continue;
        if (await options.write(parsed.value, picked.bytes, picked.mimeType)) {
          return success(relative);
        }
        return failure(
          Object.freeze({ code: "WRITE_FAILED", message: "The attachment could not be stored" }),
        );
      }
      return failure(
        Object.freeze({
          code: "WRITE_FAILED",
          message: "No collision-free attachment name exists",
        }),
      );
    },
  });
}
