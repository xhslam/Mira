import { useCallback } from "react";

import { isEditableTextFormat } from "../formats/format-path";
import { decideFileOpen } from "./file-open-policy";
import type { FileEntry } from "../workspace/workspace-adapter";
import type { DocumentId } from "../domain/identifiers";
import type { EditorMode } from "../session/document-session";
import type { WorkspaceConflictPolicy } from "../workspace/workspace-browser";
import type { AppServices } from "./app-services";
import {
  browserCommandFailure,
  browserCommandSuccess,
  browserErrorMessage,
  type BrowserCommandResult,
} from "./browser-command";
import type { WorkspacePathMutation, WorkspaceState } from "./workspace-state";

type WorkspaceBrowserCommandOptions = Readonly<{
  services: Pick<AppServices, "browser">;
  getState: () => WorkspaceState | null;
  prepareWorkspaceSwitch: () => Promise<boolean>;
  saveWithSource: (source: "auto") => Promise<void>;
  reloadWorkspace: (
    preferredPath?: string,
    preferredMode?: EditorMode,
    mutation?: WorkspacePathMutation,
  ) => Promise<BrowserCommandResult>;
  refreshBrowser: () => Promise<void>;
  onPathMoved: (from: string, to: string) => Promise<void>;
  onPathRemoved: (path: string) => Promise<void>;
}>;

export function useWorkspaceBrowserCommands(options: WorkspaceBrowserCommandOptions) {
  const prepareMutation = useCallback(async (): Promise<BrowserCommandResult> => {
    const prepared = await options.prepareWorkspaceSwitch();
    if (!prepared)
      return browserCommandFailure("The latest editor changes could not be confirmed.");
    if (options.getState()?.documents.some((document) => document.dirty)) {
      return browserCommandFailure("Save or resolve every open file before changing its path.");
    }
    return browserCommandSuccess();
  }, [options]);

  const openBrowserFile = useCallback(
    async (entry: FileEntry, confirmed = false): Promise<BrowserCommandResult> => {
      if (entry.kind !== "file") return browserCommandFailure("Choose a file to open.");
      if (!isEditableTextFormat(entry)) {
        const shared = await options.services.browser.share(entry.path);
        return shared.ok
          ? browserCommandSuccess()
          : browserCommandFailure(browserErrorMessage(shared.error), shared.error.code);
      }
      const decision = decideFileOpen(entry);
      if (decision.rejected) {
        return browserCommandFailure(decision.reason, "LIMIT_EXCEEDED");
      }
      if (decision.requiresConfirmation && !confirmed) {
        return browserCommandFailure(decision.reason, "CONFIRMATION_REQUIRED");
      }
      await options.saveWithSource("auto");
      if (options.getState()?.activeDocument.dirty) {
        return browserCommandFailure("The current file must be saved before another file opens.");
      }
      return options.reloadWorkspace(entry.path, decision.mode);
    },
    [options],
  );

  const createBrowserFile = useCallback(
    async (
      path: string,
      content: string,
      conflict: WorkspaceConflictPolicy = "fail",
    ): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const result = await options.services.browser.createFile(path, content, conflict);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      return options.reloadWorkspace(result.value.path);
    },
    [options, prepareMutation],
  );

  const createBrowserDirectory = useCallback(
    async (path: string): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const result = await options.services.browser.createDirectory(path);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      await options.refreshBrowser();
      return browserCommandSuccess();
    },
    [options, prepareMutation],
  );

  const renameBrowserEntry = useCallback(
    async (
      entry: FileEntry,
      to: string,
      conflict: WorkspaceConflictPolicy = "fail",
      documentId?: DocumentId,
    ): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const active = options.getState()?.activeDocument;
      if (
        documentId !== undefined &&
        (active?.documentId !== documentId || active.path !== entry.path)
      ) {
        return browserCommandFailure("The note changed before it could be renamed.");
      }
      const isDraft = documentId !== undefined && active?.baseHash === null;
      const result = isDraft
        ? await options.services.browser.createFile(to, active.markdown, conflict)
        : await options.services.browser.rename(entry.path, to, conflict);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      if (!isDraft) await options.onPathMoved(entry.path, result.value.path);
      return options.reloadWorkspace(undefined, undefined, {
        from: entry.path,
        to: result.value.path,
      });
    },
    [options, prepareMutation],
  );

  const moveBrowserEntry = useCallback(
    async (
      entry: FileEntry,
      to: string,
      conflict: WorkspaceConflictPolicy = "fail",
    ): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const result = await options.services.browser.move(entry.path, to, conflict);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      await options.onPathMoved(entry.path, result.value.path);
      return options.reloadWorkspace(undefined, undefined, {
        from: entry.path,
        to: result.value.path,
      });
    },
    [options, prepareMutation],
  );

  const copyBrowserEntry = useCallback(
    async (
      entry: FileEntry,
      to: string,
      conflict: WorkspaceConflictPolicy = "fail",
    ): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const result = await options.services.browser.copy(entry.path, to, conflict);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      return options.reloadWorkspace(options.getState()?.activeDocument.path);
    },
    [options, prepareMutation],
  );

  const removeBrowserEntry = useCallback(
    async (entry: FileEntry): Promise<BrowserCommandResult> => {
      const prepared = await prepareMutation();
      if (!prepared.ok) return prepared;
      const mode = options.services.browser.capabilities.trash ? "trash" : "permanent";
      const result = await options.services.browser.remove(entry.path, mode);
      if (!result.ok)
        return browserCommandFailure(browserErrorMessage(result.error), result.error.code);
      await options.onPathRemoved(entry.path);
      return options.reloadWorkspace(undefined, undefined, { from: entry.path, to: null });
    },
    [options, prepareMutation],
  );

  const shareBrowserEntry = useCallback(
    async (entry: FileEntry): Promise<BrowserCommandResult> => {
      if (entry.kind !== "file") return browserCommandFailure("Choose a file to share.");
      const current = options.getState();
      const openDocument = current?.documents.find((document) => document.path === entry.path);
      if (openDocument?.documentId === current?.activeDocument.documentId) {
        const prepared = await options.prepareWorkspaceSwitch();
        if (!prepared) {
          return browserCommandFailure("The latest editor changes could not be confirmed.");
        }
      }
      const latest = options.getState()?.documents.find((document) => document.path === entry.path);
      if (latest?.dirty) {
        return browserCommandFailure("Save this file before sharing it.");
      }
      const result = await options.services.browser.share(entry.path);
      return result.ok
        ? browserCommandSuccess()
        : browserCommandFailure(browserErrorMessage(result.error), result.error.code);
    },
    [options],
  );

  return Object.freeze({
    openBrowserFile,
    createBrowserFile,
    createBrowserDirectory,
    renameBrowserEntry,
    moveBrowserEntry,
    copyBrowserEntry,
    removeBrowserEntry,
    shareBrowserEntry,
  });
}
