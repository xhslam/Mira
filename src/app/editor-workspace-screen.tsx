import {
  ArchiveRestore,
  CalendarClock,
  Download,
  FilePlus2,
  GitCompareArrows,
  RotateCw,
  Save,
  Search as SearchIcon,
  Sparkles,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { EditorCommand, EditorCommandName } from "../editor-kernel/editor-kernel.dom";
import EditorKernel from "../editor-kernel/editor-kernel.dom";
import { createEditorSavedMessage } from "../editor-bridge/editor-message-builder";
import { createDocumentOpenTransfer } from "../editor-bridge/document-open-transfer";
import { extractMarkdownOutline } from "../editor-kernel/editor-kernel-state";
import { formatStructuredDocument } from "../formats/structured/format";
import {
  advanceLocalResourceState,
  createLocalResourceState,
  localResourcePaths,
  resolveLocalResourcePath,
} from "../formats/local-resource";
import type { HistorySnapshot } from "../history/history-store";
import type { SearchResult } from "../search/search-index";
import type { AppServices } from "./app-services";
import { DocumentTabs } from "./document-tabs";
import { nextEditorMode } from "./editor-mode-cycle";
import { StructuredTreeView } from "./structured-tree-view";
import { StructuredTableView } from "./structured-table-view";
import {
  acknowledgeEditorRendererReady,
  beginEditorRendererRecovery,
  createEditorRendererRecoveryState,
  retryEditorRendererRecovery,
} from "./editor-renderer-recovery";
import { FormattingToolbar } from "./formatting-toolbar";
import { AiQuickAssistant } from "./ai-quick-assistant";
import { useLocale, useTranslate } from "./locale";
import { resolveWorkspaceLocation, resolveWorkspaceName } from "./managed-workspace-identity";
import { SearchSheet } from "./search-sheet";
import { useTheme, type Theme } from "./theme";
import { triggerClickFeedback } from "./press-feedback";
import { useEditorWorkspace, type EditorWorkspaceController } from "./use-editor-workspace";
import { WorkspaceDrawer } from "./workspace-drawer";
import { WorkspaceHeader } from "./workspace-header";

type EditorWorkspaceScreenProps = Readonly<{
  services?: AppServices;
  clickVibration?: boolean;
  /**
   * The app shell hands its primary navigation to this screen so the workspace
   * drawer overlay, which is mounted after it in this subtree, can paint above
   * the tab bar. React Native orders siblings only, so a shell-level tab bar
   * could never be covered by an overlay nested inside this screen.
   */
  bottomNavigation?: ReactNode;
  onChooseWorkspace?: () => void;
  initialPath?: string;
  initialSearchResult?: SearchResult;
}>;

export function EditorWorkspaceScreen(props: EditorWorkspaceScreenProps = {}) {
  const controller = useEditorWorkspace(props.services);
  return <EditorWorkspaceView {...props} controller={controller} />;
}

export function EditorWorkspaceView({
  controller,
  clickVibration = true,
  bottomNavigation,
  onChooseWorkspace,
  initialPath,
  initialSearchResult,
}: EditorWorkspaceScreenProps & Readonly<{ controller: EditorWorkspaceController }>) {
  const theme = useTheme();
  const locale = useLocale();
  const t = useTranslate();
  const styles = createStyles(theme);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [quickAssistantVisible, setQuickAssistantVisible] = useState(false);
  const [command, setCommand] = useState<EditorCommand | null>(null);
  const [editableCodeDocuments, setEditableCodeDocuments] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Paired with a monotonic revision: the DOM bridge re-serializes props on
  // every native render, so the editor kernel cannot use the map's identity to
  // decide whether it must rebuild its editor instance.
  const [localResourceState, setLocalResourceState] = useState(createLocalResourceState);
  const [rendererRecovery, setRendererRecovery] = useState(createEditorRendererRecoveryState);
  const controllerState = controller.state;
  const selectDocument = controller.selectDocument;
  const initialPathConsumed = useRef(false);

  useEffect(() => {
    const targetPath = initialSearchResult?.path ?? initialPath;
    if (!targetPath || !controllerState || initialPathConsumed.current) return;
    const document = controllerState.documents.find((item) => item.path === targetPath);
    if (document && initialSearchResult) {
      initialPathConsumed.current = true;
      void controller.selectSearchResult(initialSearchResult);
      return;
    }
    if (document && document.documentId !== controllerState.activeDocument.documentId) {
      initialPathConsumed.current = true;
      void selectDocument(document.documentId);
    } else if (document) {
      initialPathConsumed.current = true;
    }
  }, [controller, controllerState, initialPath, initialSearchResult, selectDocument]);

  const activeDocument = controller.state?.activeDocument ?? null;
  const activeDocumentId = activeDocument?.documentId;
  const activeDocumentMarkdown = activeDocument?.markdown;
  const activeDocumentPath = activeDocument?.path;
  useEffect(() => {
    let active = true;
    const paths = activeDocumentMarkdown
      ? localResourcePaths(activeDocumentMarkdown)
      : Object.freeze([]);
    void Promise.all(
      paths.map(async (path) => {
        const resolved = activeDocumentPath
          ? resolveLocalResourcePath(activeDocumentPath, path)
          : null;
        const dataUri = resolved ? await controller.services.readWorkspaceResource(resolved) : null;
        return dataUri ? ([path, dataUri] as const) : null;
      }),
    ).then((entries) => {
      if (!active) return;
      const next = Object.freeze(Object.fromEntries(entries.filter((entry) => entry !== null)));
      setLocalResourceState((current) => advanceLocalResourceState(current, next));
    });
    return () => {
      active = false;
    };
  }, [activeDocumentId, activeDocumentMarkdown, activeDocumentPath, controller.services]);
  const acknowledgedRendererRecovery = useMemo(
    () => acknowledgeEditorRendererReady(rendererRecovery, controller.editorReadyVersion),
    [controller.editorReadyVersion, rendererRecovery],
  );
  const outline = useMemo(
    () => extractMarkdownOutline(activeDocument?.markdown ?? ""),
    [activeDocument?.markdown],
  );
  const documentOpenTransfer = useMemo(
    () =>
      activeDocument && controller.state
        ? createDocumentOpenTransfer({
            sessionId: controller.state.sessionId,
            documentId: activeDocument.documentId,
            revision: activeDocument.revision,
            content: activeDocument.markdown,
            view: activeDocument.mode,
            selection: activeDocument.selection,
          })
        : null,
    [activeDocument, controller.state],
  );
  const documentSavedMessage = useMemo(
    () =>
      activeDocument && controller.state && !activeDocument.dirty && activeDocument.baseHash
        ? createEditorSavedMessage({
            sessionId: controller.state.sessionId,
            documentId: activeDocument.documentId,
            revision: activeDocument.revision,
            contentHash: activeDocument.baseHash,
          })
        : null,
    [activeDocument, controller.state],
  );
  const sourceReadOnly =
    (activeDocument?.formatId === "code" || activeDocument?.formatId === "unknown-text") &&
    !editableCodeDocuments.has(activeDocument.documentId);
  const usesEditorKernel =
    activeDocument !== null && activeDocument.mode !== "tree" && activeDocument.mode !== "table";

  function issueCommand(name: EditorCommandName, content?: string): void {
    setCommand((current) =>
      Object.freeze({ id: (current?.id ?? 0) + 1, name, ...(content ? { content } : {}) }),
    );
  }

  function confirmStructuredFormatting(): void {
    if (
      activeDocument === null ||
      (activeDocument.formatId !== "json" &&
        activeDocument.formatId !== "yaml" &&
        activeDocument.formatId !== "toml")
    ) {
      return;
    }
    let formatted: string;
    try {
      formatted = formatStructuredDocument(
        activeDocument.formatId,
        activeDocument.markdown,
        /\.(jsonl|ndjson)$/i.test(activeDocument.path),
      );
    } catch {
      Alert.alert("Formatting unavailable", "Fix syntax errors before formatting this file.");
      return;
    }
    if (formatted === activeDocument.markdown) {
      Alert.alert("Already formatted", "No source changes are needed.");
      return;
    }
    Alert.alert("Format document?", "This will normalize indentation and whitespace.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Apply",
        onPress: () => {
          controller.requestMode("source");
          issueCommand("replace-document", formatted);
        },
      },
    ]);
  }

  function recoverEditorRenderer(): void {
    setRendererRecovery((current) =>
      beginEditorRendererRecovery(
        acknowledgeEditorRendererReady(current, controller.editorReadyVersion),
        controller.editorReadyVersion,
      ),
    );
  }

  async function requestOpenExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      Alert.alert("Link blocked", "This link uses an unsupported URL scheme.");
      return;
    }
    Alert.alert("Open external link?", url, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open",
        onPress: () => {
          void Linking.openURL(url).catch(() => {
            Alert.alert("Unable to open link", "No application can handle this link.");
          });
        },
      },
    ]);
  }

  async function requestOpenWiki(target: string): Promise<void> {
    const normalized = target.trim().replace(/\\/g, "/");
    if (!normalized || normalized.includes("..") || !controller.state) {
      Alert.alert("Wiki link blocked", "This Wiki link target is not a valid workspace path.");
      return;
    }
    const candidates = new Set([
      normalized,
      `${normalized}.md`,
      `${normalized}.excalidraw`,
      `${normalized}.excalidraw.md`,
    ]);
    const match = controller.state.documents.find((document) => {
      const leaf = document.path.split("/").at(-1) ?? document.path;
      const stem = leaf.replace(/(?:\.excalidraw)?\.(?:md|markdown|mdown|mkd)$/i, "");
      return candidates.has(document.path) || stem === normalized;
    });
    if (!match) {
      Alert.alert("Wiki page not found", `No Markdown file matches “${target}”.`);
      return;
    }
    await controller.selectDocument(match.documentId);
  }

  async function pickLocalAttachment(): Promise<string | null> {
    if (!activeDocument) return null;
    const result = await controller.services.attachmentImporter.pickAndStore(activeDocument.path);
    if (result.ok) return result.value;
    if (result.error.code !== "CANCELLED") {
      Alert.alert("Attachment not inserted", result.error.message);
    }
    return null;
  }

  function confirmHistoryRestore(snapshot: HistorySnapshot): void {
    const preview = snapshot.markdown.trim().slice(0, 220) || "(empty note)";
    Alert.alert(
      "Restore this version?",
      `${new Date(snapshot.createdAt).toLocaleString()}\n\n${preview}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            setDrawerVisible(false);
            void controller.restoreHistory(snapshot.snapshotId);
          },
        },
      ],
    );
  }

  function confirmHistoryRemove(snapshot: HistorySnapshot): void {
    Alert.alert("Delete this version?", "This history snapshot cannot be recovered.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void controller.removeHistory(snapshot.snapshotId),
      },
    ]);
  }

  function confirmHistoryClear(): void {
    Alert.alert("Delete all history?", "Saved files are kept, but version history is permanent.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => void controller.clearHistory() },
    ]);
  }

  function openConflictResolution(): void {
    const external = controller.state?.conflictSnapshot;
    if (!external || !activeDocument) return;
    const localPreview = activeDocument.markdown.trim().slice(0, 160) || "(empty)";
    const externalPreview = external.markdown.trim().slice(0, 160) || "(empty)";
    Alert.alert(
      "File changed outside Inkstone",
      `LOCAL EDITS\n${localPreview}\n\nEXTERNAL FILE\n${externalPreview}`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Load external", onPress: () => void controller.loadExternalVersion() },
        { text: "Save local copy", onPress: () => void controller.saveConflictCopy() },
      ],
    );
  }

  async function exportBackup(): Promise<void> {
    setMenuVisible(false);
    const prepared = await controller.prepareWorkspaceSwitch();
    if (!prepared) {
      Alert.alert("Backup paused", "Save or resolve the current file before creating a backup.");
      return;
    }
    const result = await controller.services.backupFiles.exportAndShare(
      controller.services.activeWorkspace.grant.workspaceId,
    );
    if (!result.ok && result.error.code !== "CANCELLED") {
      Alert.alert(
        "Backup not created",
        `${result.error.message}. Your workspace files are unchanged.`,
      );
    }
  }

  async function importBackup(): Promise<void> {
    setMenuVisible(false);
    const prepared = await controller.prepareWorkspaceSwitch();
    if (!prepared) {
      Alert.alert("Restore paused", "Save or resolve the current file before restoring a backup.");
      return;
    }
    const selected = await controller.services.backupFiles.pickAndPreflight();
    if (!selected.ok) {
      if (selected.error.code !== "CANCELLED") {
        Alert.alert(
          "Backup rejected",
          `${selected.error.message}. No workspace files were changed.`,
        );
      }
      return;
    }
    const { archive, preview } = selected.value;
    const summary = `${preview.files.length} files · ${preview.totalBytes} bytes · ${preview.conflicts.length} conflicts`;
    const restore = async (policy: "fail" | "replace" | "keep-both") => {
      const result = await controller.services.backupFiles.restorePicked(archive, policy);
      if (!result.ok) {
        Alert.alert(
          "Restore stopped",
          `${result.error.message}. Review the workspace before retrying.`,
        );
        return;
      }
      const reloaded = await controller.reloadWorkspace();
      if (!reloaded.ok) {
        Alert.alert(
          "Restore completed",
          "Files were restored, but the editor could not reload the workspace. Reopen Inkstone to refresh it.",
        );
        return;
      }
      Alert.alert(
        "Restore complete",
        `${result.value.files.length} backup entries were verified and processed.`,
      );
    };
    Alert.alert("Restore verified backup?", summary, [
      { text: "Cancel", style: "cancel" },
      { text: "Keep both", onPress: () => void restore("keep-both") },
      ...(preview.conflicts.length > 0
        ? [
            {
              text: "Replace",
              style: "destructive" as const,
              onPress: () => void restore("replace"),
            },
          ]
        : [{ text: "Restore", onPress: () => void restore("fail") }]),
    ]);
  }

  async function configureAutomaticBackup(): Promise<void> {
    setMenuVisible(false);
    const configured = await controller.services.automaticBackup.configure();
    if (configured === "cancelled") return;
    try {
      await controller.services.automaticBackup.runNow();
      Alert.alert("Automatic backup enabled", "The folder was verified with a complete backup.");
    } catch {
      await controller.services.automaticBackup.disable();
      Alert.alert(
        "Automatic backup not enabled",
        "The selected folder could not accept a verified backup. Workspace files are unchanged.",
      );
    }
  }

  async function chooseWorkspace(): Promise<void> {
    if (!onChooseWorkspace) return;
    if (await controller.prepareWorkspaceSwitch()) {
      onChooseWorkspace();
      return;
    }
    Alert.alert(
      "Workspace switch paused",
      "The latest editor changes could not be confirmed. Your current workspace remains open.",
    );
  }

  if (!controller.state || !activeDocument || !documentOpenTransfer?.ok) {
    return (
      <View style={styles.screen}>
        <View style={styles.centered}>
          {controller.loadingError ? (
            <>
              <Text accessibilityRole="alert" style={styles.errorTitle}>
                {t("editor.workspaceUnavailable")}
              </Text>
              <Text style={styles.errorBody}>{controller.loadingError}</Text>
            </>
          ) : (
            <ActivityIndicator
              accessibilityLabel={t("editor.openingWorkspace")}
              color={theme.colors.accent}
              size="large"
            />
          )}
        </View>
        {bottomNavigation}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        dirty={activeDocument.dirty}
        editorMode={activeDocument.mode}
        nextEditorMode={nextEditorMode(activeDocument.mode, activeDocument.formatId)}
        filename={activeDocument.path}
        onOpenDrawer={() => {
          triggerClickFeedback(clickVibration);
          Keyboard.dismiss();
          setDrawerVisible(true);
        }}
        onOpenMenu={() => setMenuVisible((visible) => !visible)}
        onOpenSearch={() => {
          Keyboard.dismiss();
          setSearchVisible(true);
        }}
        onToggleEditorMode={() => {
          triggerClickFeedback(clickVibration);
          Keyboard.dismiss();
          controller.requestMode(nextEditorMode(activeDocument.mode, activeDocument.formatId));
        }}
        saveState={controller.state.saveState}
        showEditorMode={
          activeDocument.formatId === "markdown" ||
          activeDocument.formatId === "json" ||
          activeDocument.formatId === "yaml" ||
          activeDocument.formatId === "toml"
        }
      />

      <DocumentTabs
        activeDocumentId={activeDocument.documentId}
        documents={controller.state.documents}
        onAdd={() => {
          Keyboard.dismiss();
          void controller.addDocument();
        }}
        onSelect={(documentId) => {
          Keyboard.dismiss();
          void controller.selectDocument(documentId);
        }}
      />

      <View style={styles.editorFrame}>
        {activeDocument.mode === "tree" &&
        (activeDocument.formatId === "json" ||
          activeDocument.formatId === "yaml" ||
          activeDocument.formatId === "toml") ? (
          <StructuredTreeView
            content={activeDocument.markdown}
            parser={activeDocument.formatId}
            path={activeDocument.path}
          />
        ) : activeDocument.mode === "table" &&
          (activeDocument.formatId === "json" ||
            activeDocument.formatId === "yaml" ||
            activeDocument.formatId === "toml") ? (
          <StructuredTableView
            content={activeDocument.markdown}
            parser={activeDocument.formatId}
            path={activeDocument.path}
          />
        ) : (
          <EditorKernel
            command={command}
            documentId={activeDocument.documentId}
            dom={{
              accessibilityLabel: t("editor.markdownEditor"),
              style: styles.editorKernel,
              scrollEnabled: false,
              overScrollMode: "never",
              mixedContentMode: "never",
              allowsBackForwardNavigationGestures: false,
              onContentProcessDidTerminate: recoverEditorRenderer,
              onRenderProcessGone: recoverEditorRenderer,
              onShouldStartLoadWithRequest: ({ url }) =>
                url.startsWith("file:") ||
                url.startsWith("http://localhost") ||
                url.startsWith("https://localhost"),
            }}
            flushRequest={controller.flushRequest}
            documentOpenMessages={documentOpenTransfer.value}
            documentSavedMessage={documentSavedMessage}
            formatId={activeDocument.formatId}
            locale={locale}
            markdown={activeDocument.markdown}
            mode={
              activeDocument.mode === "wysiwyg" || activeDocument.mode === "reading"
                ? activeDocument.mode
                : "source"
            }
            path={activeDocument.path}
            readOnly={sourceReadOnly || activeDocument.mode === "reading"}
            themeMode={theme.mode}
            editorFontSize={controller.editorSettings.fontSize}
            editorLineHeight={controller.editorSettings.lineHeight}
            showLineNumbers={controller.editorSettings.lineNumbers}
            wordWrap={controller.editorSettings.wordWrap}
            localResources={localResourceState.resources}
            localResourceRevision={localResourceState.revision}
            onOpenExternal={requestOpenExternal}
            onOpenWiki={requestOpenWiki}
            onPickAttachment={pickLocalAttachment}
            onRendererError={async () => recoverEditorRenderer()}
            onShareExport={controller.services.shareDrawingExport}
            onProtocolMessage={controller.handleEditorMessage}
            onSnapshot={controller.handleEditorMessage}
            revision={activeDocument.revision}
            selection={activeDocument.selection}
            sessionId={controller.state.sessionId}
            key={acknowledgedRendererRecovery.generation}
          />
        )}
        {sourceReadOnly && activeDocument.mode === "source" ? (
          <View accessibilityRole="summary" style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>{t("editor.viewMode")}</Text>
            <Pressable
              accessibilityLabel={t("editor.enableEditing")}
              accessibilityRole="button"
              onPress={() =>
                setEditableCodeDocuments(
                  (current) => new Set([...current, activeDocument.documentId]),
                )
              }
              style={styles.readOnlyButton}
            >
              <Text style={styles.readOnlyButtonText}>{t("editor.enableEditing")}</Text>
            </Pressable>
          </View>
        ) : null}
        {usesEditorKernel && acknowledgedRendererRecovery.status === "recovering" ? (
          <View
            accessibilityLiveRegion="polite"
            pointerEvents="none"
            style={styles.recoveryOverlay}
          >
            <ActivityIndicator color={theme.colors.accent} size="small" />
            <Text style={styles.recoveryText}>{t("editor.restoring")}</Text>
          </View>
        ) : null}
        {usesEditorKernel && acknowledgedRendererRecovery.status === "failed" ? (
          <View accessibilityRole="alert" style={styles.recoveryOverlay}>
            <Text style={styles.recoveryTitle}>{t("editor.rendererStopped")}</Text>
            <Text style={styles.recoveryText}>{t("editor.draftAvailable")}</Text>
            <Pressable
              accessibilityLabel={t("editor.retryEditor")}
              accessibilityRole="button"
              onPress={() =>
                setRendererRecovery((current) =>
                  retryEditorRendererRecovery(
                    acknowledgeEditorRendererReady(current, controller.editorReadyVersion),
                    controller.editorReadyVersion,
                  ),
                )
              }
              style={styles.recoveryButton}
            >
              <RotateCw color="#FFFFFF" size={18} />
              <Text style={styles.recoveryButtonText}>{t("editor.retry")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {controller.diagnostics.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={styles.diagnosticsBanner}>
          {controller.diagnostics.slice(0, 3).map((diagnostic, index) => (
            <Text
              key={`${index}-${diagnostic.from}-${diagnostic.to}`}
              style={styles.diagnosticsText}
            >
              {diagnostic.severity === "error" ? "Error" : "Warning"}: {diagnostic.message}
            </Text>
          ))}
          {controller.diagnostics.length > 3 ? (
            <Text style={styles.diagnosticsText}>+{controller.diagnostics.length - 3} more</Text>
          ) : null}
        </View>
      ) : null}

      {controller.state.errorMessage ? (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{controller.state.errorMessage}</Text>
          <Pressable
            accessibilityLabel={
              controller.state.saveState === "conflict" ? "Resolve conflict" : "Retry save"
            }
            accessibilityRole="button"
            onPress={() =>
              controller.state?.saveState === "conflict"
                ? openConflictResolution()
                : void controller.retrySave()
            }
            style={styles.bannerButton}
          >
            {controller.state.saveState === "conflict" ? (
              <GitCompareArrows color="#FFFFFF" size={20} />
            ) : (
              <RotateCw color="#FFFFFF" size={19} />
            )}
          </Pressable>
        </View>
      ) : null}

      {activeDocument.mode === "wysiwyg" ? (
        <FormattingToolbar
          onAi={() => {
            Keyboard.dismiss();
            setQuickAssistantVisible(true);
          }}
          onCommand={issueCommand}
          onDismissKeyboard={() => Keyboard.dismiss()}
        />
      ) : null}

      {bottomNavigation}

      {menuVisible ? (
        <>
          <Pressable
            accessibilityLabel={t("editor.closeActions")}
            onPress={() => setMenuVisible(false)}
            style={styles.menuScrim}
          />
          <View accessibilityRole="menu" style={styles.menu}>
            <MenuAction
              icon={Sparkles}
              label={t("menu.aiAssistant")}
              onPress={() => {
                Keyboard.dismiss();
                setMenuVisible(false);
                setQuickAssistantVisible(true);
              }}
            />
            <MenuAction
              icon={Save}
              label={t("menu.saveNow")}
              onPress={() => {
                setMenuVisible(false);
                void controller.saveNow();
              }}
            />
            <MenuAction
              icon={SearchIcon}
              label={t("menu.findReplace")}
              onPress={() => {
                setMenuVisible(false);
                controller.requestMode("source");
                issueCommand("find");
              }}
            />
            {activeDocument.formatId === "json" ||
            activeDocument.formatId === "yaml" ||
            activeDocument.formatId === "toml" ? (
              <MenuAction
                icon={GitCompareArrows}
                label={t("menu.formatDocument")}
                onPress={() => {
                  setMenuVisible(false);
                  confirmStructuredFormatting();
                }}
              />
            ) : null}
            <MenuAction
              icon={FilePlus2}
              label={t("menu.newNote")}
              onPress={() => {
                setMenuVisible(false);
                void controller.addDocument();
              }}
            />
            <MenuAction
              icon={Download}
              label={t("menu.exportBackup")}
              onPress={() => void exportBackup()}
            />
            <MenuAction
              icon={ArchiveRestore}
              label={t("menu.restoreBackup")}
              onPress={() => void importBackup()}
            />
            <MenuAction
              icon={CalendarClock}
              label={t("menu.automaticBackup")}
              onPress={() => void configureAutomaticBackup()}
            />
            <MenuAction icon={X} label={t("menu.close")} onPress={() => setMenuVisible(false)} />
          </View>
        </>
      ) : null}
      <AiQuickAssistant
        controller={controller}
        onClose={() => setQuickAssistantVisible(false)}
        visible={quickAssistantVisible}
      />

      <WorkspaceDrawer
        activeDocumentId={activeDocument.documentId}
        browserCapabilities={controller.services.browser.capabilities}
        browserEntries={controller.browserEntries}
        browserError={controller.browserError}
        browserLoading={controller.browserLoading}
        fileActivity={controller.fileActivity}
        fileActivityError={controller.fileActivityError}
        documents={controller.state.documents}
        history={controller.history}
        historyError={controller.historyError}
        onClose={() => setDrawerVisible(false)}
        onCreateDirectory={controller.createBrowserDirectory}
        onCreateFile={controller.createBrowserFile}
        onCopyEntry={controller.copyBrowserEntry}
        {...(onChooseWorkspace ? { onChooseWorkspace: () => void chooseWorkspace() } : {})}
        onOpenBrowserFile={controller.openBrowserFile}
        onMoveEntry={controller.moveBrowserEntry}
        onRefreshBrowser={controller.refreshBrowser}
        onRemoveEntry={controller.removeBrowserEntry}
        onRenameEntry={controller.renameBrowserEntry}
        onSelectDocument={(documentId) => void controller.selectDocument(documentId)}
        onSetFavorite={controller.setFavorite}
        onShareEntry={controller.shareBrowserEntry}
        onRestoreHistory={confirmHistoryRestore}
        onRemoveHistory={confirmHistoryRemove}
        onClearHistory={confirmHistoryClear}
        outline={outline}
        visible={drawerVisible}
        workspaceLocation={resolveWorkspaceLocation(controller.services.activeWorkspace.grant, t)}
        workspaceName={resolveWorkspaceName(controller.services.activeWorkspace.grant, t)}
      />
      <SearchSheet
        onClose={() => setSearchVisible(false)}
        onSelect={(result) => {
          setSearchVisible(false);
          void controller.selectSearchResult(result);
        }}
        search={controller.services.workspaceSearch}
        visible={searchVisible}
      />
    </View>
  );
}

function MenuAction({
  icon: Icon,
  label,
  onPress,
}: Readonly<{
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>>;
  label: string;
  onPress: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
    >
      <Icon color={theme.colors.text} size={19} />
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.colors.background,
    },
    editorFrame: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.colors.canvas,
    },
    recoveryOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 2,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 24,
      backgroundColor: theme.colors.canvas,
    },
    recoveryTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
    recoveryText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    recoveryButton: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    recoveryButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    editorKernel: {
      flex: 1,
      backgroundColor: theme.colors.canvas,
    },
    readOnlyBanner: {
      position: "absolute",
      top: 8,
      right: 8,
      zIndex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    readOnlyText: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    readOnlyButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    readOnlyButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 24,
      backgroundColor: theme.colors.background,
    },
    errorTitle: {
      color: theme.colors.error,
      fontSize: 18,
      fontWeight: "700",
    },
    errorBody: {
      color: theme.colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    errorBanner: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 14,
      backgroundColor: theme.colors.error,
    },
    diagnosticsBanner: {
      minHeight: 40,
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: theme.colors.warningSurface,
    },
    diagnosticsText: {
      color: theme.colors.warningText,
      fontSize: 12,
      lineHeight: 17,
    },
    errorBannerText: {
      minWidth: 0,
      flex: 1,
      color: "#FFFFFF",
      fontSize: 12,
      lineHeight: 17,
    },
    bannerButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    menuScrim: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 10,
    },
    menu: {
      position: "absolute",
      zIndex: 11,
      top: 52,
      right: 8,
      width: 190,
      paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
      elevation: 8,
    },
    menuAction: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
    },
    menuLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
    },
  });
}
