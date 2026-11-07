import { Directory, File, Paths } from "expo-file-system";
import { createAgentStore, type AgentStore, type TextFileBackend } from "./agent-store";

// Reuse backend identity so stores in this process share the per-workspace writer queue.
const backends = new Map<string, TextFileBackend>();
export function createExpoAgentStore({
  workspaceId,
  directory,
}: {
  workspaceId: string;
  directory?: string;
}): AgentStore {
  const root = directory
    ? new Directory(directory)
    : new Directory(Paths.document, "personal-agent");
  let backend = backends.get(root.uri);
  if (!backend) {
    backend = Object.freeze({
      async read(path: string) {
        const file = new File(root, path);
        return file.exists ? file.text() : null;
      },
      async write(path: string, text: string) {
        if (!root.exists) root.create({ intermediates: true, idempotent: true });
        const file = new File(root, path);
        file.write(text);
      },
    });
    backends.set(root.uri, backend);
  }
  return createAgentStore({ backend, workspaceId });
}
