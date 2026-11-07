import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ArchiveRestore,
  CalendarClock,
  ChevronLeft,
  Download,
  GitCompareArrows,
  Pencil,
  RotateCw,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { EditorCommand, EditorCommandName } from "../editor-kernel/editor-kernel.dom";
import EditorKernel from "../editor-kernel/editor-kernel.dom";
import { createEditorSavedMessage } from "../editor-bridge/editor-message-builder";
import { createDocumentOpenTransfer } from "../editor-bridge/document-open-transfer";
import { formatStructuredDocument } from "../formats/structured/format";
import {
  advanceLocalResourceState,
  createLocalResourceState,
  localResourcePaths,
  resolveLocalResourcePath,
} from "../formats/local-resource";
import type { DocumentId } from "../domain/identifiers";
import type { SearchResult } from "../search/search-index";
import type { WorkspaceConflictPolicy } from "../workspace/workspace-browser";
import type { AppServices } from "./app-services";
import type { RecoveryDraftStore, RecoveryDraft } from "../recovery/recovery-draft-store";
import { createWorkspaceFileShare } from "../workspace/workspace-file-share";
import { parseWorkspacePath } from "../workspace/workspace-path";
import { legacyRecoveryTextExport } from "./workspace-state";
import { OverlaySideSheet } from "./overlay-side-sheet";
import { DocumentTabs } from "./document-tabs";
import { editorModes } from "./editor-mode-cycle";
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
import { SearchSheet } from "./search-sheet";
import { useTheme, type Theme } from "./theme";
import { MiraSheet, SheetAction } from "./mira-controls";
import { triggerClickFeedback } from "./press-feedback";
import { editableNoteName, noteRenameTargetPath } from "./note-rename";
import { useEditorWorkspace, type EditorWorkspaceController } from "./use-editor-workspace";
import { WorkspaceHeader, WorkspaceModePicker } from "./workspace-header";

type EditorWorkspaceScreenProps = Readonly<{
  services?: AppServices;
  clickVibration?: boolean;
  /**
   * The app shell can place the editor toolbar beside its navigation control
   * while keeping the editor WebView mounted across surface changes.
   */
  renderBottomNavigation?: (toolbar?: ReactNode) => ReactNode;
  onOpenSidebar?: () => void;
  onExitToNotes?: () => void;
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
  renderBottomNavigation,
  onOpenSidebar,
  onExitToNotes,
  initialPath,
  initialSearchResult,
}: EditorWorkspaceScreenProps & Readonly<{ controller: EditorWorkspaceController }>) {
  const theme = useTheme();
  const locale = useLocale();
  const t = useTranslate();
  const styles = createStyles(theme);
  const [searchVisible, setSearchVisible] = useState(false);
  const [legacyRecoveryVisible, setLegacyRecoveryVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPage, setMenuPage] = useState<"note" | "backup">("note");
  const [renameDocumentId, setRenameDocumentId] = useState<DocumentId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const renameInFlight = useRef(false);
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
      activeDocument &&
      controller.state &&
      !activeDocument.dirty &&
      !activeDocument.recovered &&
      activeDocument.baseHash
        ? createEditorSavedMessage({
            sessionId: controller.state.sessionId,
            documentId: activeDocument.documentId,
            revision: activeDocument.revision,
            contentHash: activeDocument.baseHash,
          })
        : null,
    [activeDocument, controller.state],
  );
  const legacyDrawing = activeDocument?.formatId === "legacy-drawing";
  const sourceReadOnly =
    legacyDrawing ||
    ((activeDocument?.formatId === "code" || activeDocument?.formatId === "unknown-text") &&
      !editableCodeDocuments.has(activeDocument.documentId));
  const usesEditorKernel =
    activeDocument !== null && activeDocument.mode !== "tree" && activeDocument.mode !== "table";

  function issueCommand(name: EditorCommandName, content?: string): void {
    setCommand((current) =>
      Object.freeze({ id: (current?.id ?? 0) + 1, name, ...(content ? { content } : {}) }),
    );
  }

  function closeMenu(): void {
    setMenuVisible(false);
    setMenuPage("note");
  }

  function beginRename(): void {
    if (
      !activeDocument ||
      renameInFlight.current ||
      !controller.services.browser.capabilities.rename
    )
      return;
    closeMenu();
    Keyboard.dismiss();
    setRenameValue(editableNoteName(activeDocument.path));
    setRenameError(null);
    setRenameDocumentId(activeDocument.documentId);
  }

  function cancelRename(): void {
    if (renameInFlight.current) return;
    Keyboard.dismiss();
    setRenameDocumentId(null);
    setRenameValue("");
    setRenameError(null);
  }

  async function submitRename(conflict: WorkspaceConflictPolicy = "fail"): Promise<void> {
    if (!activeDocument || activeDocument.documentId !== renameDocumentId || renameInFlight.current)
      return;
    const target = noteRenameTargetPath(activeDocument.path, renameValue);
    if (!target.ok) {
      const key =
        target.code === "EMPTY"
          ? "header.renameEmpty"
          : target.code === "PATH_SYMBOL"
            ? "header.renamePathSymbol"
            : "header.renameInvalid";
      setRenameError(t(key));
      return;
    }
    if (target.path === activeDocument.path) {
      cancelRename();
      return;
    }

    renameInFlight.current = true;
    setRenameBusy(true);
    setRenameError(null);
    let result: Awaited<ReturnType<typeof controller.renameActiveDocument>>;
    try {
      result = await controller.renameActiveDocument(renameDocumentId, target.path, conflict);
    } catch {
      setRenameError(t("header.renameFailed"));
      return;
    } finally {
      renameInFlight.current = false;
      setRenameBusy(false);
    }
    if (result.ok) {
      Keyboard.dismiss();
      setRenameDocumentId(null);
      setRenameValue("");
      return;
    }
    if (result.errorCode === "ALREADY_EXISTS" && conflict === "fail") {
      setRenameError(t("header.renameExists"));
      const capabilities = controller.services.browser.capabilities;
      Alert.alert(t("header.renameExists"), target.path, [
        { text: t("header.cancel"), style: "cancel" },
        ...(capabilities.renameKeepBoth
          ? [
              {
                text: t("header.keepBoth"),
                onPress: () => void submitRename("keep-both"),
              },
            ]
          : []),
        ...(capabilities.renameReplace
          ? [
              {
                text: t("header.replace"),
                style: "destructive" as const,
                onPress: () => void submitRename("replace"),
              },
            ]
          : []),
      ]);
      return;
    }
    setRenameError(t("header.renameFailed"));
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
    closeMenu();
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
    closeMenu();
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
    closeMenu();
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
        {renderBottomNavigation?.()}
      </View>
    );
  }

  const formattingToolbar =
    activeDocument.mode === "wysiwyg" ? (
      <FormattingToolbar
        onAi={() => {
          Keyboard.dismiss();
          setQuickAssistantVisible(true);
        }}
        onCommand={issueCommand}
        onDismissKeyboard={() => Keyboard.dismiss()}
      />
    ) : null;

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        canRename={controller.services.browser.capabilities.rename}
        dirty={activeDocument.dirty}
        filename={activeDocument.path}
        onOpenDrawer={() => {
          triggerClickFeedback(clickVibration);
          Keyboard.dismiss();
          onOpenSidebar?.();
        }}
        onBeginRename={beginRename}
        onOpenMenu={() => {
          setMenuPage("note");
          setMenuVisible((visible) => !visible);
        }}
        onOpenSearch={() => {
          Keyboard.dismiss();
          setSearchVisible(true);
        }}
        saveState={controller.state.saveState}
        rename={
          renameDocumentId === activeDocument.documentId
            ? {
                value: renameValue,
                error: renameError,
                busy: renameBusy,
                onChange: (value) => {
                  setRenameValue(value);
                  setRenameError(null);
                },
                onCancel: cancelRename,
                onSubmit: () => void submitRename(),
              }
            : null
        }
      />

      <DocumentTabs
        activeDocumentId={activeDocument.documentId}
        documents={controller.state.documents}
        trailing={
          <WorkspaceModePicker
            key={activeDocument.documentId}
            mode={activeDocument.mode}
            modes={editorModes(activeDocument.formatId)}
            onSelect={(mode) => {
              triggerClickFeedback(clickVibration);
              controller.requestMode(mode);
            }}
          />
        }
        onAdd={() => {
          Keyboard.dismiss();
          void controller.addDocument();
        }}
        onClose={(documentId) => {
          Keyboard.dismiss();
          void controller.closeDocument(documentId).then((result) => {
            if (result === "last") onExitToNotes?.();
            if (result === "failed") {
              Alert.alert("暂时无法关闭笔记", "请先确认当前修改已经保存，再关闭这个标签。");
            }
          });
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
            <Text style={styles.readOnlyText}>
              {legacyDrawing && activeDocument.recovered
                ? "保留的恢复草稿（只读），未覆盖原文件"
                : t("editor.viewMode")}
            </Text>
            {legacyDrawing && activeDocument.recovered ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setLegacyRecoveryVisible(true)}
                style={styles.readOnlyButton}
              >
                <Text style={styles.readOnlyButtonText}>查看与导出草稿</Text>
              </Pressable>
            ) : null}
            {legacyDrawing ? null : (
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
            )}
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

      {renderBottomNavigation?.(formattingToolbar) ?? formattingToolbar}

      <MiraSheet
        onClose={closeMenu}
        title={menuPage === "note" ? editableNoteName(activeDocument.path) : t("menu.backup")}
        visible={menuVisible}
      >
        {menuPage === "note" ? (
          <>
            {controller.services.browser.capabilities.rename ? (
              <MenuAction icon={Pencil} label={t("menu.renameNote")} onPress={beginRename} />
            ) : null}
            <MenuAction
              icon={Sparkles}
              label={t("menu.aiAssistant")}
              onPress={() => {
                Keyboard.dismiss();
                closeMenu();
                setQuickAssistantVisible(true);
              }}
            />
            <MenuAction
              icon={SearchIcon}
              label={t("menu.findReplace")}
              onPress={() => {
                closeMenu();
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
                  closeMenu();
                  confirmStructuredFormatting();
                }}
              />
            ) : null}
            <View style={styles.menuDivider} />
            <MenuAction
              icon={ArchiveRestore}
              label="绘图恢复草稿"
              onPress={() => {
                closeMenu();
                setLegacyRecoveryVisible(true);
              }}
            />
            <MenuAction
              icon={ArchiveRestore}
              label={t("menu.backup")}
              onPress={() => setMenuPage("backup")}
            />
          </>
        ) : (
          <>
            <MenuAction
              icon={ChevronLeft}
              label={t("menu.back")}
              onPress={() => setMenuPage("note")}
            />
            <View style={styles.menuDivider} />
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
          </>
        )}
      </MiraSheet>
      {legacyRecoveryVisible ? (
        <LegacyRecoveryPanel
          key={controller.services.activeWorkspace.grant.workspaceId}
          store={controller.services.recoveryStore}
          visible
          onClose={() => setLegacyRecoveryVisible(false)}
        />
      ) : null}
      <AiQuickAssistant
        controller={controller}
        onClose={() => setQuickAssistantVisible(false)}
        visible={quickAssistantVisible}
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
  return (
    <SheetAction
      icon={<Icon color={theme.colors.text} size={19} />}
      label={label}
      onPress={onPress}
    />
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
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 5,
      marginHorizontal: 10,
      backgroundColor: theme.colors.divider,
    },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
    },
  });
}

/** Read-only recovery access stays available even after the editor tab closes. */
function LegacyRecoveryPanel({
  store,
  visible,
  onClose,
}: Readonly<{
  store: RecoveryDraftStore;
  visible: boolean;
  onClose: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [drafts, setDrafts] = useState<readonly RecoveryDraft[]>([]);
  const [selected, setSelected] = useState<RecoveryDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void store
      .list()
      .then((items) => {
        if (active) setDrafts(items.filter((draft) => legacyRecoveryTextExport(draft) !== null));
      })
      .catch(() => {
        if (active) setError("恢复草稿暂时无法读取，请关闭后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store, visible]);

  async function exportDraft(draft: RecoveryDraft): Promise<void> {
    const payload = legacyRecoveryTextExport(draft);
    const path = parseWorkspacePath(draft.path);
    if (busy || !payload || !path.ok) return;
    setBusy(true);
    setError(null);
    // Reuse the generic random-cache sharing boundary. Only a new inert .txt
    // cache file is written; the source file and recovery store are never mutated.
    const share = createWorkspaceFileShare({
      cacheDirectoryUri: Paths.cache.uri,
      createId: Crypto.randomUUID,
      isAvailable: Sharing.isAvailableAsync,
      share: Sharing.shareAsync,
      // Successful share files use the existing inkstone-share-* prefix and
      // are retained for receiver access; ordinary share maintenance expires them.
      cleanupExpired: async () => undefined,
      remove: async (uri) => {
        new File(uri).delete();
      },
      source: {
        async exportFile(_path, destination) {
          const file = new File(destination.uri);
          file.create({ overwrite: false });
          file.write(payload.contents);
          if ((await file.text()) !== payload.contents) {
            throw new Error("Recovery export read-back verification failed");
          }
          return { ok: true, value: { uri: destination.uri, contentType: "text/plain" } };
        },
      },
    });
    try {
      const result = await share.share(path.value, payload.name);
      if (!result.ok) setError("无法打开系统分享，请重试。原文件和恢复草稿保持不变。");
    } catch {
      setError("无法打开系统分享，请重试。原文件和恢复草稿保持不变。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OverlaySideSheet visible={visible} onClose={onClose} widthFraction={0.95} maxWidth={680}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.readOnlyButton}>
          <Text style={styles.readOnlyButtonText}>关闭恢复草稿</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.recoveryTitle}>
          绘图恢复草稿
        </Text>
        <Text style={styles.readOnlyText}>
          草稿单独保留，不会写回原文件。关闭标签或切换工作区不会删除草稿。
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.readOnlyText}>
            {error}
          </Text>
        ) : null}
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {drafts.map((draft) => (
            <Pressable
              key={draft.documentId}
              accessibilityRole="button"
              onPress={() => setSelected(draft)}
              style={[styles.readOnlyButton, { minHeight: 48 }]}
            >
              <Text style={styles.readOnlyButtonText}>{draft.path}</Text>
            </Pressable>
          ))}
          {!loading && !error && drafts.length === 0 ? (
            <Text style={styles.readOnlyText}>没有保留的绘图恢复草稿。</Text>
          ) : null}
          {selected ? (
            <>
              <Text selectable style={styles.readOnlyText}>
                {selected.path}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void exportDraft(selected)}
                style={[styles.readOnlyButton, { minHeight: 48 }]}
              >
                <Text style={styles.readOnlyButtonText}>
                  {busy ? "正在打开分享…" : "导出恢复原文（.txt）"}
                </Text>
              </Pressable>
              <Text selectable style={[styles.readOnlyText, { fontFamily: "monospace" }]}>
                {selected.markdown}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </View>
    </OverlaySideSheet>
  );
}
