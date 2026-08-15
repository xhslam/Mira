import type { WorkspaceCapability } from "./workspace-adapter";

export const LINKED_CAPABILITIES: WorkspaceCapability = Object.freeze({
  read: true,
  write: true,
  atomicReplace: false,
  create: true,
  rename: true,
  move: true,
  copy: true,
  remove: true,
  trash: false,
  watch: false,
  share: true,
});
