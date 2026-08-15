import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { acknowledgeEditorFlush, type EditorFlushRequest } from "../editor-bridge/editor-flush";
import { parseEditorMessage } from "../editor-bridge/editor-message";
import { validateFormatEditorDiagnostics } from "../formats/validators";
import type { SearchResult } from "../search/search-index";
import { selectionForSearchLine } from "../search/search-navigation";
import type { HistorySnapshot } from "../history/history-store";
import type { EditorMode } from "../session/document-session";
import type { FileEntry } from "../workspace/workspace-adapter";
import { createAppServices, type AppServices } from "./app-services";
import { DEFAULT_SETTINGS, type AppSettings } from "./settings-store";
import {
  browserCommandFailure,
  browserCommandSuccess,
  browserErrorMessage,
  type BrowserCommandResult,
} from "./browser-command";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import { useFileActivity } from "./use-file-activity";
import { useWorkspaceBrowserCommands } from "./use-workspace-browser-commands";
import { upsertBrowserFile } from "./file-browser-model";
import {
  addBlankWorkspaceDocument,
  applyWorkspaceDiagnostics,
  applyWorkspaceSelectionChange,
  applyWorkspaceSnapshot,
  createConflictCopyPath,
  createWorkspaceState,
  failEditorFlush,
  failWorkspaceSave,
  markWorkspaceSaving,
  planWorkspaceSaveCompletion,
  loadWorkspaceConflictSnapshot,
  selectWorkspaceDocument,
  setWorkspaceConflictSnapshot,
  setWorkspaceMode,
  setWorkspaceSelection,
  restoreWorkspaceHistorySnapshot,
  resolveWorkspaceConflictAsCopy,
  selectWorkspaceDocumentByPath,
  type OpenWorkspaceDocument,
  type WorkspaceState,
} from "./workspace-state";

const RECOVERY_DELAY_MS = 750;
const EDITOR_FLUSH_TIMEOUT_MS = 1_500;

type PendingEditorFlush = Readonly<{
  request: EditorFlushRequest;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>;

export type { EditorWorkspaceController } from "./editor-workspace-controller";

export function useEditorWorkspace(providedServices?: AppServices): EditorWorkspaceController {
  const [defaultServices] = useState(() => providedServices ?? createAppServices());
  const services = providedServices ?? defaultServices;
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<
    Readonly<{
      documentId: OpenWorkspaceDocument["documentId"] | null;
      snapshots: readonly HistorySnapshot[];
      error: string | null;
    }>
  >(Object.freeze({ documentId: null, snapshots: Object.freeze([]), error: null }));
  const [flushRequest, setFlushRequest] = useState<EditorFlushRequest | null>(null);
  const [editorReadyVersion, setEditorReadyVersion] = useState(0);
  const [editorSettings, setEditorSettings] = useState<AppSettings["editor"]>(
    DEFAULT_SETTINGS.editor,
  );
  const [browserEntries, setBrowserEntries] = useState<readonly FileEntry[]>(Object.freeze([]));
  const [browserLoading, setBrowserLoading] = useState(true);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const stateRef = useRef<WorkspaceState | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const followUpSaveRef = useRef(false);
  const flushRequestIdRef = useRef(0);
  const pendingFlushRef = useRef<PendingEditorFlush | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveDelayRef = useRef(DEFAULT_SETTINGS.editor.autoSaveDelayMs);

  useEffect(() => {
    let active = true;
    void services.settingsStore.load().then((result) => {
      if (!active || !result.ok) return;
      autoSaveDelayRef.current = result.value.editor.autoSaveDelayMs;
      setEditorSettings(result.value.editor);
    });
    return () => {
      active = false;
    };
  }, [services.settingsStore]);

  const replaceState = useCallback((next: WorkspaceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const loadBrowserEntries = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setBrowserLoading(true);
      try {
        const result = await services.browser.list();
        if (result.ok) {
          setBrowserEntries(result.value);
          setBrowserError(null);
        } else {
          setBrowserError(browserErrorMessage(result.error));
        }
      } catch {
        setBrowserError("The workspace could not be refreshed.");
      } finally {
        if (showLoading) setBrowserLoading(false);
      }
    },
    [services],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      services.repository.list(),
      services.recoveryStore.list(),
      services.browser.list(),
    ])
      .then(([documents, recoveryDrafts, browserResult]) => {
        if (!active) return;
        setBrowserLoading(false);
        if (browserResult.ok) {
          setBrowserEntries(browserResult.value);
          setBrowserError(null);
        } else {
          setBrowserError(browserErrorMessage(browserResult.error));
        }
        if (!documents.ok) {
          setLoadingError("The private workspace could not be opened.");
          return;
        }
        replaceState(
          createWorkspaceState({
            documents: documents.value,
            recoveryDrafts,
            sessionId: services.createSessionId(),
            blankDocumentId: services.createDocumentId(),
          }),
        );
      })
      .catch(() => {
        if (active) {
          setBrowserLoading(false);
          setLoadingError("The private workspace could not be opened.");
        }
      });
    return () => {
      active = false;
    };
  }, [replaceState, services]);

  useEffect(() => {
    const documentId = state?.activeDocument.documentId;
    if (!documentId) return;

    let active = true;
    void services.historyStore
      .list(documentId)
      .then((snapshots) => {
        if (active) {
          setHistoryState(Object.freeze({ documentId, snapshots, error: null }));
        }
      })
      .catch(() => {
        if (active) {
          setHistoryState(
            Object.freeze({
              documentId,
              snapshots: Object.freeze([]),
              error: "Version history could not be opened.",
            }),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [services, state?.activeDocument.documentId]);

  useEffect(() => {
    if (!state) return;
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    const activeDocument = state.activeDocument;
    const sessionId = state.sessionId;
    sessionTimerRef.current = setTimeout(() => {
      void services.phase6Store
        .saveEditorSession(
          Object.freeze({
            sessionId,
            workspaceId: services.activeWorkspace.grant.workspaceId,
            documentId: activeDocument.documentId,
            viewKind: activeDocument.mode,
            selectionJson: JSON.stringify(activeDocument.selection),
            scrollJson: null,
            dirty: activeDocument.dirty,
            updatedAt: new Date().toISOString(),
          }),
        )
        .catch(() => {
          // Session metadata is derived UI state and cannot affect save/recovery safety.
        });
    }, 500);
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    };
  }, [services, state]);

  useEffect(() => {
    const current = stateRef.current;
    const document = current?.activeDocument;
    if (!document) return;
    const parser =
      document.formatId === "json" || document.formatId === "yaml" || document.formatId === "toml"
        ? document.formatId
        : null;
    if (parser === null) {
      if (current.diagnostics.length > 0) {
        replaceState(applyWorkspaceDiagnostics(current, document.documentId, Object.freeze([])));
      }
      return;
    }
    const diagnostics = validateFormatEditorDiagnostics(parser, document.markdown, document.path);
    replaceState(applyWorkspaceDiagnostics(current, document.documentId, diagnostics));
  }, [replaceState, state?.activeDocument.documentId, state?.activeDocument.markdown]);

  const writeRecovery = useCallback(
    async (document: OpenWorkspaceDocument) => {
      if (
        !document.dirty ||
        (document.baseHash === null && document.markdown.trim().length === 0)
      ) {
        return;
      }
      await services.recoveryStore.write({
        documentId: document.documentId,
        path: document.path,
        markdown: document.markdown,
        revision: document.revision,
        baseHash: document.baseHash,
        updatedAt: new Date().toISOString(),
      });
    },
    [services],
  );

  const performSave = useCallback(
    async (document: OpenWorkspaceDocument, source: HistorySnapshot["source"]) => {
      if (
        !document.dirty ||
        (document.baseHash === null && document.markdown.trim().length === 0)
      ) {
        return;
      }
      await writeRecovery(document);
      const current = stateRef.current;
      if (current?.activeDocument.documentId === document.documentId) {
        replaceState(markWorkspaceSaving(current));
      }

      const result =
        document.baseHash === null
          ? await services.repository.create({ path: document.path, markdown: document.markdown })
          : await services.repository.writeVerified({
              path: document.path,
              expectedBaseHash: document.baseHash,
              markdown: document.markdown,
            });

      const latest = stateRef.current;
      if (!latest) return;
      if (!result.ok) {
        const failed = failWorkspaceSave(latest, result.error.code);
        replaceState(failed);
        if (result.error.code === "EXTERNAL_MODIFICATION") {
          const external = await services.repository.read(document.path);
          const current = stateRef.current;
          if (external.ok && current?.activeDocument.documentId === document.documentId) {
            replaceState(setWorkspaceConflictSnapshot(current, external.value));
          }
        }
        return;
      }

      const completion = planWorkspaceSaveCompletion(
        latest,
        result.value,
        document.revision,
        document.documentId,
      );
      const acknowledged = completion.state;
      let recoveryWriteFailed = false;
      if (completion.recoveryDocument !== null) {
        try {
          await writeRecovery(completion.recoveryDocument);
        } catch {
          recoveryWriteFailed = true;
        }
      }
      for (const documentId of completion.removeRecoveryDocumentIds) {
        await services.recoveryStore.remove(documentId);
      }
      replaceState(acknowledged);
      setBrowserEntries((entries) =>
        upsertBrowserFile(
          entries,
          Object.freeze({
            path: result.value.path,
            name: result.value.path.split("/").at(-1) ?? result.value.path,
            kind: "file",
            size: new TextEncoder().encode(result.value.markdown).byteLength,
            modifiedAt: null,
            contentType: "text/markdown",
          }),
        ),
      );
      try {
        await services.historyStore.add({
          documentId: result.value.documentId,
          path: result.value.path,
          markdown: result.value.markdown,
          contentHash: result.value.contentHash,
          source,
        });
        if (stateRef.current?.activeDocument.documentId === result.value.documentId) {
          const snapshots = await services.historyStore.list(result.value.documentId);
          setHistoryState(
            Object.freeze({ documentId: result.value.documentId, snapshots, error: null }),
          );
        }
      } catch {
        setHistoryState(
          Object.freeze({
            documentId: result.value.documentId,
            snapshots: Object.freeze([]),
            error: "The note was saved, but version history could not be updated.",
          }),
        );
      }
      if (recoveryWriteFailed) {
        replaceState(failWorkspaceSave(acknowledged, "IO_FAILURE"));
      }
      if (acknowledged.activeDocument.dirty) followUpSaveRef.current = true;
    },
    [replaceState, services, writeRecovery],
  );

  const saveDocument = useCallback(
    async (document: OpenWorkspaceDocument, source: HistorySnapshot["source"]) => {
      if (saveInFlightRef.current) {
        followUpSaveRef.current = true;
        await saveInFlightRef.current;
        return;
      }

      let nextDocument: OpenWorkspaceDocument | null = document;
      while (nextDocument) {
        followUpSaveRef.current = false;
        const operation = performSave(nextDocument, source).finally(() => {
          saveInFlightRef.current = null;
        });
        saveInFlightRef.current = operation;
        await operation;
        const latest = stateRef.current?.activeDocument;
        nextDocument = followUpSaveRef.current && latest?.dirty ? latest : null;
      }
    },
    [performSave],
  );

  const schedulePersistence = useCallback(
    (document: OpenWorkspaceDocument, workspaceSaveEnabled = true) => {
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      recoveryTimerRef.current = setTimeout(() => {
        void writeRecovery(document).catch(() => {
          const current = stateRef.current;
          if (current) replaceState(failWorkspaceSave(current, "IO_FAILURE"));
        });
      }, RECOVERY_DELAY_MS);
      if (workspaceSaveEnabled) {
        saveTimerRef.current = setTimeout(
          () => void saveDocument(document, "auto"),
          autoSaveDelayRef.current,
        );
      }
    },
    [replaceState, saveDocument, writeRecovery],
  );

  const requestEditorFlush = useCallback((): Promise<void> => {
    const current = stateRef.current;
    if (!current) return Promise.resolve();
    if (pendingFlushRef.current) return pendingFlushRef.current.promise;

    flushRequestIdRef.current =
      flushRequestIdRef.current === Number.MAX_SAFE_INTEGER ? 1 : flushRequestIdRef.current + 1;
    const request = Object.freeze({
      requestId: flushRequestIdRef.current,
      sessionId: current.sessionId,
      documentId: current.activeDocument.documentId,
    });
    let resolvePending: () => void = () => undefined;
    let rejectPending: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    const timeout = setTimeout(() => {
      if (pendingFlushRef.current?.request !== request) return;
      pendingFlushRef.current = null;
      setFlushRequest(null);
      rejectPending(new Error("Editor flush timed out"));
    }, EDITOR_FLUSH_TIMEOUT_MS);
    pendingFlushRef.current = Object.freeze({
      request,
      promise,
      resolve: resolvePending,
      reject: rejectPending,
      timeout,
    });
    setFlushRequest(request);
    return promise;
  }, []);

  const captureAiSnapshot = useCallback(async (): Promise<OpenWorkspaceDocument> => {
    await requestEditorFlush();
    const current = stateRef.current;
    if (!current) throw new Error("The editor workspace is unavailable");
    return current.activeDocument;
  }, [requestEditorFlush]);

  const applyAiReplacement = useCallback(
    async (
      input: Readonly<{
        documentId: OpenWorkspaceDocument["documentId"];
        path: string;
        expectedRevision: number;
        expectedMarkdown: string;
        markdown: string;
      }>,
    ): Promise<"applied" | "stale" | "failed"> => {
      const current = stateRef.current;
      if (
        !current ||
        current.activeDocument.documentId !== input.documentId ||
        current.activeDocument.path !== input.path ||
        current.activeDocument.revision !== input.expectedRevision ||
        current.activeDocument.markdown !== input.expectedMarkdown
      ) {
        return "stale";
      }
      const applied = applyWorkspaceSnapshot(
        current,
        Object.freeze({
          protocolVersion: 1,
          type: "editor.snapshot",
          sessionId: current.sessionId,
          documentId: current.activeDocument.documentId,
          baseRevision: current.activeDocument.revision,
          revision: current.activeDocument.revision + 1,
          mode: current.activeDocument.mode,
          markdown: input.markdown,
          selection: Object.freeze({ anchor: 0, head: 0 }),
        }),
      );
      if (!applied.ok) return "stale";
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      replaceState(applied.value);
      try {
        await writeRecovery(applied.value.activeDocument);
        await saveDocument(applied.value.activeDocument, "manual");
      } catch {
        return "failed";
      }
      const latest = stateRef.current;
      if (!latest || latest.activeDocument.documentId !== input.documentId) return "failed";
      if (latest.activeDocument.markdown !== input.markdown) return "stale";
      return latest.activeDocument.dirty ? "failed" : "applied";
    },
    [replaceState, saveDocument, writeRecovery],
  );

  const handleEditorMessage = useCallback(
    async (input: unknown) => {
      const parsed = parseEditorMessage(input);
      const current = stateRef.current;
      if (!parsed.ok || !current) throw new Error("Invalid editor revision");
      if (
        parsed.value.sessionId !== current.sessionId ||
        parsed.value.documentId !== current.activeDocument.documentId
      ) {
        // A previous DOM editor can finish an already queued lifecycle message
        // while a workspace or renderer replacement is completing.
        return;
      }

      if (parsed.value.type === "editor.ready") {
        setEditorReadyVersion((version) => version + 1);
        return;
      }

      if (parsed.value.type === "document.saveRequested") {
        const pending = pendingFlushRef.current;
        if (!pending) throw new Error("Unexpected editor flush acknowledgement");
        const acknowledged = acknowledgeEditorFlush(
          pending.request,
          current.activeDocument.revision,
          parsed.value,
        );
        if (!acknowledged.ok) throw new Error(acknowledged.error.code);
        clearTimeout(pending.timeout);
        pendingFlushRef.current = null;
        setFlushRequest(null);
        pending.resolve();
        return;
      }

      if (parsed.value.type === "selection.change") {
        const applied = applyWorkspaceSelectionChange(current, parsed.value);
        if (!applied.ok) throw new Error(applied.error.code);
        replaceState(applied.value);
        return;
      }

      if (parsed.value.type === "diagnostics.update") {
        replaceState(
          applyWorkspaceDiagnostics(current, parsed.value.documentId, parsed.value.items),
        );
        return;
      }

      if (parsed.value.type !== "editor.snapshot" && parsed.value.type !== "document.change") {
        throw new Error("Unsupported editor protocol message");
      }
      const applied = applyWorkspaceSnapshot(current, parsed.value);
      if (!applied.ok) {
        if (applied.error.code === "STALE_REVISION") return;
        throw new Error(applied.error.code);
      }
      replaceState(applied.value);
      schedulePersistence(applied.value.activeDocument, applied.value.saveState !== "conflict");
    },
    [replaceState, schedulePersistence],
  );

  const saveWithSource = useCallback(
    async (source: HistorySnapshot["source"]) => {
      const beforeFlush = stateRef.current;
      if (source === "auto" && !beforeFlush?.activeDocument.dirty) return;

      try {
        await requestEditorFlush();
      } catch {
        const current = stateRef.current;
        let recoveryWriteFailed = false;
        if (current) {
          try {
            await writeRecovery(current.activeDocument);
          } catch {
            recoveryWriteFailed = true;
          }
          const latest = stateRef.current;
          if (latest && recoveryWriteFailed) {
            replaceState(failWorkspaceSave(latest, "IO_FAILURE"));
          } else if (latest && source !== "auto") {
            replaceState(failEditorFlush(latest));
          }
        }
        return;
      }
      const document = stateRef.current?.activeDocument;
      if (!document) return;
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await saveDocument(document, source);
    },
    [replaceState, requestEditorFlush, saveDocument, writeRecovery],
  );

  useEffect(() => {
    const stateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") void saveWithSource("auto");
    });
    return () => {
      stateSubscription.remove();
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const pending = pendingFlushRef.current;
      if (pending) {
        clearTimeout(pending.timeout);
        pendingFlushRef.current = null;
        pending.reject(new Error("Editor workspace unmounted"));
      }
    };
  }, [saveWithSource]);

  const saveNow = useCallback(() => saveWithSource("manual"), [saveWithSource]);
  const prepareWorkspaceSwitch = useCallback(async () => {
    try {
      await requestEditorFlush();
    } catch {
      const current = stateRef.current;
      if (current) replaceState(failEditorFlush(current));
      return false;
    }

    const document = stateRef.current?.activeDocument;
    if (!document) return false;
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      await writeRecovery(document);
    } catch {
      const current = stateRef.current;
      if (current) replaceState(failWorkspaceSave(current, "IO_FAILURE"));
      return false;
    }

    try {
      await saveDocument(document, "manual");
    } catch {
      const current = stateRef.current;
      if (current) replaceState(failWorkspaceSave(current, "IO_FAILURE"));
    }
    return true;
  }, [replaceState, requestEditorFlush, saveDocument, writeRecovery]);

  const refreshBrowser = useCallback(async () => {
    await loadBrowserEntries(true);
  }, [loadBrowserEntries]);

  const reloadWorkspace = useCallback(
    async (preferredPath?: string, preferredMode?: EditorMode): Promise<BrowserCommandResult> => {
      const [documents, recoveryDrafts, browserResult] = await Promise.all([
        services.repository.list(),
        services.recoveryStore.list(),
        services.browser.list(),
      ]);
      if (!documents.ok)
        return browserCommandFailure("The Markdown workspace could not be reloaded.", "IO_FAILURE");
      if (browserResult.ok) {
        setBrowserEntries(browserResult.value);
        setBrowserError(null);
      } else {
        setBrowserError(browserErrorMessage(browserResult.error));
      }
      const reloaded = createWorkspaceState({
        documents: documents.value,
        recoveryDrafts,
        sessionId: services.createSessionId(),
        blankDocumentId: services.createDocumentId(),
      });
      const selected =
        preferredPath === undefined
          ? reloaded
          : selectWorkspaceDocumentByPath(reloaded, preferredPath);
      replaceState(
        preferredMode === undefined ? selected : setWorkspaceMode(selected, preferredMode),
      );
      return browserCommandSuccess();
    },
    [replaceState, services],
  );

  const getWorkspaceState = useCallback(() => stateRef.current, []);
  const fileActivityState = useFileActivity(services, browserEntries, state?.activeDocument.path);
  const browserCommandOptions = useMemo(
    () => ({
      services,
      getState: getWorkspaceState,
      prepareWorkspaceSwitch,
      saveWithSource,
      reloadWorkspace,
      refreshBrowser,
      onPathMoved: fileActivityState.onPathMoved,
      onPathRemoved: fileActivityState.onPathRemoved,
    }),
    [
      getWorkspaceState,
      prepareWorkspaceSwitch,
      refreshBrowser,
      reloadWorkspace,
      saveWithSource,
      services,
      fileActivityState.onPathMoved,
      fileActivityState.onPathRemoved,
    ],
  );
  const {
    openBrowserFile,
    createBrowserFile,
    createBrowserDirectory,
    renameBrowserEntry,
    moveBrowserEntry,
    copyBrowserEntry,
    removeBrowserEntry,
    shareBrowserEntry,
  } = useWorkspaceBrowserCommands(browserCommandOptions);
  const requestMode = useCallback(
    (mode: EditorMode) => {
      const current = stateRef.current;
      if (current) replaceState(setWorkspaceMode(current, mode));
    },
    [replaceState],
  );
  const selectDocument = useCallback(
    async (documentId: OpenWorkspaceDocument["documentId"]) => {
      await saveWithSource("auto");
      const current = stateRef.current;
      if (current) replaceState(selectWorkspaceDocument(current, documentId));
    },
    [replaceState, saveWithSource],
  );
  const addDocument = useCallback(async () => {
    await saveWithSource("auto");
    const current = stateRef.current;
    if (current) replaceState(addBlankWorkspaceDocument(current, services.createDocumentId()));
  }, [replaceState, saveWithSource, services]);
  const selectSearchResult = useCallback(
    async (result: SearchResult) => {
      await selectDocument(result.documentId);
      const current = stateRef.current;
      if (!current || current.activeDocument.documentId !== result.documentId) return;
      replaceState(
        setWorkspaceSelection(
          current,
          selectionForSearchLine(current.activeDocument.markdown, result.line),
        ),
      );
    },
    [replaceState, selectDocument],
  );
  const activeDocumentId = state?.activeDocument.documentId ?? null;
  const history =
    historyState.documentId === activeDocumentId ? historyState.snapshots : Object.freeze([]);
  const historyError = historyState.documentId === activeDocumentId ? historyState.error : null;

  const restoreHistory = useCallback(
    async (snapshotId: string) => {
      const snapshot = history.find((item) => item.snapshotId === snapshotId);
      const current = stateRef.current;
      if (!snapshot || snapshot.metadataOnly || !current) return;

      if (current.activeDocument.dirty) {
        await saveDocument(current.activeDocument, "manual");
      }
      const latest = stateRef.current;
      if (!latest || latest.activeDocument.dirty || latest.saveState === "conflict") return;

      try {
        await services.historyStore.add({
          documentId: latest.activeDocument.documentId,
          path: latest.activeDocument.path,
          markdown: latest.activeDocument.markdown,
          contentHash:
            latest.activeDocument.baseHash ?? `revision:${latest.activeDocument.revision}`,
          source: "restore",
        });
      } catch {
        return;
      }

      const restored = restoreWorkspaceHistorySnapshot(latest, snapshot);
      if (!restored.ok) return;
      replaceState(restored.value);
      try {
        await writeRecovery(restored.value.activeDocument);
        schedulePersistence(restored.value.activeDocument);
      } catch {
        replaceState(failWorkspaceSave(restored.value, "IO_FAILURE"));
      }
    },
    [
      history,
      replaceState,
      saveDocument,
      schedulePersistence,
      services.historyStore,
      writeRecovery,
    ],
  );
  const removeHistory = useCallback(
    async (snapshotId: string) => {
      const current = stateRef.current;
      if (!current) return;
      await services.historyStore.remove(snapshotId);
      const snapshots = await services.historyStore.list(current.activeDocument.documentId);
      setHistoryState(
        Object.freeze({
          documentId: current.activeDocument.documentId,
          snapshots,
          error: null,
        }),
      );
    },
    [services.historyStore],
  );
  const clearHistory = useCallback(async () => {
    const current = stateRef.current;
    if (!current) return;
    await services.historyStore.clear(current.activeDocument.documentId);
    setHistoryState(
      Object.freeze({
        documentId: current.activeDocument.documentId,
        snapshots: Object.freeze([]),
        error: null,
      }),
    );
  }, [services.historyStore]);

  const loadExternalVersion = useCallback(async () => {
    const current = stateRef.current;
    const external = current?.conflictSnapshot;
    if (!current || !external) return;
    await services.recoveryStore.remove(current.activeDocument.documentId);
    replaceState(loadWorkspaceConflictSnapshot(current, external));
  }, [replaceState, services]);

  const saveConflictCopy = useCallback(async () => {
    const current = stateRef.current;
    const external = current?.conflictSnapshot;
    if (!current || !external || current.saveState !== "conflict") return;
    const copyPath = createConflictCopyPath(
      current.activeDocument.path,
      current.documents.map((document) => document.path),
    );
    await writeRecovery(current.activeDocument);
    replaceState(markWorkspaceSaving(current));
    const result = await services.repository.create({
      path: copyPath,
      markdown: current.activeDocument.markdown,
    });
    const latest = stateRef.current;
    if (!latest) return;
    if (!result.ok) {
      replaceState(failWorkspaceSave(latest, result.error.code));
      return;
    }

    await services.recoveryStore.remove(current.activeDocument.documentId);
    await services.recoveryStore.remove(result.value.documentId);
    replaceState(resolveWorkspaceConflictAsCopy(latest, external, result.value));
    try {
      await services.historyStore.add({
        documentId: result.value.documentId,
        path: result.value.path,
        markdown: result.value.markdown,
        contentHash: result.value.contentHash,
        source: "manual",
      });
      const snapshots = await services.historyStore.list(result.value.documentId);
      setHistoryState(
        Object.freeze({ documentId: result.value.documentId, snapshots, error: null }),
      );
    } catch {
      setHistoryState(
        Object.freeze({
          documentId: result.value.documentId,
          snapshots: Object.freeze([]),
          error: "The copy was saved, but version history could not be updated.",
        }),
      );
    }
  }, [replaceState, services, writeRecovery]);

  return useMemo(
    () => ({
      services,
      state,
      loadingError,
      history,
      historyError,
      browserEntries,
      browserLoading,
      browserError,
      fileActivity: fileActivityState.activity,
      fileActivityError: fileActivityState.error,
      editorReadyVersion,
      flushRequest,
      diagnostics: state?.diagnostics ?? Object.freeze([]),
      editorSettings,
      handleEditorMessage,
      requestMode,
      selectDocument,
      selectSearchResult,
      addDocument,
      saveNow,
      captureAiSnapshot,
      applyAiReplacement,
      prepareWorkspaceSwitch,
      retrySave: saveNow,
      restoreHistory,
      removeHistory,
      clearHistory,
      loadExternalVersion,
      saveConflictCopy,
      refreshBrowser,
      reloadWorkspace,
      openBrowserFile,
      createBrowserFile,
      createBrowserDirectory,
      renameBrowserEntry,
      moveBrowserEntry,
      copyBrowserEntry,
      removeBrowserEntry,
      shareBrowserEntry,
      setFavorite: fileActivityState.setFavorite,
    }),
    [
      addDocument,
      captureAiSnapshot,
      applyAiReplacement,
      editorReadyVersion,
      editorSettings,
      browserEntries,
      browserError,
      browserLoading,
      fileActivityState.activity,
      fileActivityState.error,
      fileActivityState.setFavorite,
      createBrowserDirectory,
      createBrowserFile,
      copyBrowserEntry,
      flushRequest,
      handleEditorMessage,
      history,
      historyError,
      loadExternalVersion,
      loadingError,
      prepareWorkspaceSwitch,
      openBrowserFile,
      refreshBrowser,
      reloadWorkspace,
      removeBrowserEntry,
      shareBrowserEntry,
      renameBrowserEntry,
      moveBrowserEntry,
      requestMode,
      restoreHistory,
      removeHistory,
      clearHistory,
      saveConflictCopy,
      saveNow,
      selectDocument,
      selectSearchResult,
      state,
      services,
    ],
  );
}
