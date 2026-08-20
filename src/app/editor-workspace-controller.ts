import type { HistorySnapshot } from "../history/history-store";
import type { EditorDiagnostic } from "../editor-bridge/editor-message";
import type { EditorMode } from "../session/document-session";
import type { FileEntry } from "../workspace/workspace-adapter";
import type { SearchResult } from "../search/search-index";
import type { WorkspaceConflictPolicy } from "../workspace/workspace-browser";
import type { EditorFlushRequest } from "../editor-bridge/editor-flush";
import type { AppServices } from "./app-services";
import type { AppSettings } from "./settings-store";
import type { BrowserCommandResult } from "./browser-command";
import type { FileActivity } from "./file-activity-store";
import type { OpenWorkspaceDocument, WorkspaceState } from "./workspace-state";

export type EditorWorkspaceController = Readonly<{
  services: AppServices;
  state: WorkspaceState | null;
  loadingError: string | null;
  history: readonly HistorySnapshot[];
  historyError: string | null;
  browserEntries: readonly FileEntry[];
  browserLoading: boolean;
  browserError: string | null;
  fileActivity: FileActivity;
  fileActivityError: string | null;
  editorReadyVersion: number;
  flushRequest: EditorFlushRequest | null;
  diagnostics: readonly EditorDiagnostic[];
  editorSettings: AppSettings["editor"];
  handleEditorMessage: (input: unknown) => Promise<void>;
  requestMode: (mode: EditorMode) => void;
  selectDocument: (documentId: OpenWorkspaceDocument["documentId"]) => Promise<void>;
  selectSearchResult: (result: SearchResult) => Promise<void>;
  addDocument: () => Promise<void>;
  saveNow: () => Promise<void>;
  captureAiSnapshot: () => Promise<OpenWorkspaceDocument>;
  applyAiReplacement: (
    input: Readonly<{
      documentId: OpenWorkspaceDocument["documentId"];
      path: string;
      expectedRevision: number;
      expectedMarkdown: string;
      markdown: string;
    }>,
  ) => Promise<"applied" | "stale" | "failed">;
  prepareWorkspaceSwitch: () => Promise<boolean>;
  retrySave: () => Promise<void>;
  restoreHistory: (snapshotId: string) => Promise<void>;
  removeHistory: (snapshotId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadExternalVersion: () => Promise<void>;
  saveConflictCopy: () => Promise<void>;
  refreshBrowser: () => Promise<void>;
  reloadWorkspace: (preferredPath?: string) => Promise<BrowserCommandResult>;
  openBrowserFile: (entry: FileEntry, confirmed?: boolean) => Promise<BrowserCommandResult>;
  createBrowserFile: (
    path: string,
    content: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  createBrowserDirectory: (path: string) => Promise<BrowserCommandResult>;
  renameBrowserEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  moveBrowserEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  copyBrowserEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  removeBrowserEntry: (entry: FileEntry) => Promise<BrowserCommandResult>;
  shareBrowserEntry: (entry: FileEntry) => Promise<BrowserCommandResult>;
  setFavorite: (entry: FileEntry, favorite: boolean) => Promise<boolean>;
}>;
