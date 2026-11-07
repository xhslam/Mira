import { FileText } from "lucide-react-native";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { setEditorInputEnabled } from "inkstone-workspace-access";
import {
  ActivityIndicator,
  Alert,
  AppState,
  findNodeHandle,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import type { WorkspaceCatalog, WorkspaceRecord } from "../workspace/workspace-catalog";
import { createAppServices, type AppServices } from "./app-services";
import {
  completeWorkspaceCheck,
  createAppShellState,
  failWorkspaceCheck,
  openManagedWorkspace,
  retryWorkspaceCheck,
  selectPrimaryTab,
  type AppShellState,
  type PrimaryTab,
} from "./app-shell-state";
import { EditorWorkspaceView } from "./editor-workspace-screen";
import { AgentHomeScreen } from "./agent-home-screen";
import { LearningScreen } from "./learning-screen";
import { useEditorWorkspace } from "./use-editor-workspace";
import { type AppLocale } from "./i18n";
import { LocaleContext, useTranslate } from "./locale";
import { SettingsScreen } from "./settings-screen";
import { theme as themeContext, useTheme, type Theme, ThemeContext } from "./theme";
import { WorkspacePicker } from "./workspace-picker";
import { openStartupWorkspace } from "./workspace-startup";
import { DEFAULT_SETTINGS } from "./settings-store";
import { UiSoundProvider } from "./ui-sound-context";
import { GlobalSidebar } from "./global-sidebar";
import { NotesOverviewScreen } from "./notes-overview-screen";
import { PrimaryNavigation } from "./primary-navigation";

export function AppShellScreen() {
  if (Platform.OS === "web") return <MobileStorageRequiredScreen />;
  return <NativeAppShellScreen />;
}

function NativeAppShellScreen() {
  const [baseServices] = useState(createAppServices);
  const [services, setServices] = useState(baseServices);
  const editorController = useEditorWorkspace(services);
  const [state, setState] = useState<AppShellState>(createAppShellState);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(EMPTY_WORKSPACE_CATALOG);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [indexReadyVersion, setIndexReadyVersion] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [notesSurface, setNotesSurface] = useState<"overview" | "editor">("overview");
  const [notesFolder, setNotesFolder] = useState<string | null>(null);

  const editorDestination = useRef<View>(null);
  const editorVisible = state.activeTab === "files" && notesSurface === "editor";

  useLayoutEffect(() => {
    if (Platform.OS !== "android" || state.startup !== "ready") return;
    const viewId = findNodeHandle(editorDestination.current);
    if (viewId !== null) {
      void setEditorInputEnabled(viewId, editorVisible).catch(() => {
        if (!editorVisible) Keyboard.dismiss();
      });
    }
  }, [editorVisible, state.startup]);

  function synchronizeIndex(nextServices: AppServices): void {
    void nextServices
      .synchronizeSearchIndex()
      .then(() => setIndexReadyVersion((version) => version + 1))
      .catch(() => {
        // Search is derived state; an indexing failure must never block file access or editing.
      });
  }

  useEffect(() => {
    if (state.startup !== "ready" || indexReadyVersion === 0) return;
    const runForegroundWork = () => {
      void services.automaticBackup.runIfDue().catch(() => {
        // Backup is isolated from the source-of-truth file save path.
      });
      void services.aiAutomations.runDue().catch(() => {
        // AI catch-up tasks remain retryable and cannot block workspace startup.
      });
    };
    runForegroundWork();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") runForegroundWork();
    });
    return () => subscription.remove();
  }, [indexReadyVersion, services, state.startup]);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [locale] = useState<AppLocale>("zh-CN");
  const [clickVibration, setClickVibration] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(DEFAULT_SETTINGS.interaction.soundEnabled);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SETTINGS.interaction.soundVolume);
  const styles = createStyles(themeContext);

  useEffect(() => {
    let active = true;
    void baseServices.settingsStore.load().then((result) => {
      if (!active) return;
      setClickVibration(result.ok ? result.value.interaction.clickVibration : true);
      setSoundEnabled(
        result.ok
          ? result.value.interaction.soundEnabled
          : DEFAULT_SETTINGS.interaction.soundEnabled,
      );
      setSoundVolume(
        result.ok ? result.value.interaction.soundVolume : DEFAULT_SETTINGS.interaction.soundVolume,
      );
    });
    return () => {
      active = false;
    };
  }, [baseServices, settingsRevision]);

  useEffect(() => {
    if (state.startup !== "checking-workspace") return;

    let active = true;
    void openStartupWorkspace(baseServices)
      .then((result) => {
        if (!active) return;
        setCatalog(result.catalog);
        setPickerVisible(result.needsWorkspace);
        setWorkspaceError(result.error);
        if (result.services) {
          setServices(result.services);
          synchronizeIndex(result.services);
        }
        setState((current) =>
          result.error && !result.needsWorkspace
            ? failWorkspaceCheck(current)
            : result.needsWorkspace
              ? completeWorkspaceCheck(current, 0)
              : openManagedWorkspace(current),
        );
      })
      .catch(() => {
        if (active) setState((current) => failWorkspaceCheck(current));
      });

    return () => {
      active = false;
    };
  }, [baseServices, state.startup]);

  async function reloadCatalog(): Promise<WorkspaceCatalog | null> {
    const loaded = await baseServices.workspaceManager.load();
    if (!loaded.ok) {
      setWorkspaceError(loaded.error.message);
      return null;
    }
    setCatalog(loaded.value);
    return loaded.value;
  }

  async function activateRecord(record: WorkspaceRecord, persistSelection: boolean): Promise<void> {
    const nextServices = baseServices.activateWorkspace(record);
    const [documents, recoveryDrafts] = await Promise.all([
      nextServices.repository.list(),
      nextServices.recoveryStore.list(),
    ]);
    if (!documents.ok) throw new Error("The selected workspace could not be opened");
    if (persistSelection) {
      const selected = await baseServices.workspaceManager.select(record.grant.workspaceId);
      if (!selected.ok) throw new Error(selected.error.message);
      setCatalog(selected.value);
    } else {
      await reloadCatalog();
    }
    setServices(nextServices);
    synchronizeIndex(nextServices);
    setPickerVisible(false);
    setWorkspaceError(null);
    setState((current) =>
      completeWorkspaceCheck(current, documents.value.length, recoveryDrafts.length),
    );
    setState((current) => openManagedWorkspace(current));
  }

  async function runWorkspaceAction(action: () => Promise<void>): Promise<void> {
    if (workspaceBusy) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      await action();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "The workspace action failed");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function openManaged(): void {
    void runWorkspaceAction(async () => {
      const ensured = await baseServices.workspaceManager.ensureManaged(
        baseServices.managedWorkspace,
      );
      if (!ensured.ok) throw new Error(ensured.error.message);
      await activateRecord(ensured.value, true);
    });
  }

  function addLinked(): void {
    void runWorkspaceAction(async () => {
      const authorized = await baseServices.workspaceManager.authorize();
      if (!authorized.ok) throw new Error(authorized.error.message);
      await activateRecord(authorized.value, true);
    });
  }

  function selectWorkspace(record: WorkspaceRecord): void {
    void runWorkspaceAction(async () => {
      const restored = await baseServices.workspaceManager.restore(record.grant.workspaceId);
      if (!restored.ok) {
        await reloadCatalog();
        throw new Error(restored.error.message);
      }
      await activateRecord(restored.value, true);
    });
  }

  function reauthorizeWorkspace(record: WorkspaceRecord): void {
    void runWorkspaceAction(async () => {
      const reauthorized = await baseServices.workspaceManager.reauthorize(
        record.grant.workspaceId,
      );
      if (!reauthorized.ok) throw new Error(reauthorized.error.message);
      await activateRecord(reauthorized.value, true);
    });
  }

  function renameWorkspace(record: WorkspaceRecord, displayName: string): void {
    void runWorkspaceAction(async () => {
      const renamed = await baseServices.workspaceManager.rename(
        record.grant.workspaceId,
        displayName,
      );
      if (!renamed.ok) throw new Error(renamed.error.message);
      await reloadCatalog();
    });
  }

  function pinWorkspace(record: WorkspaceRecord, pinned: boolean): void {
    void runWorkspaceAction(async () => {
      const updated = await baseServices.workspaceManager.pin(record.grant.workspaceId, pinned);
      if (!updated.ok) throw new Error(updated.error.message);
      await reloadCatalog();
    });
  }

  function removeWorkspace(record: WorkspaceRecord): void {
    Alert.alert(
      "Remove workspace?",
      "This removes only the Inkstone workspace record. Files in the linked folder will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void runWorkspaceAction(async () => {
              const removed = await baseServices.workspaceManager.remove(record.grant.workspaceId);
              if (!removed.ok) throw new Error(removed.error.message);
              setCatalog(removed.value);
            });
          },
        },
      ],
    );
  }

  function navigatePrimary(tab: PrimaryTab): void {
    Keyboard.dismiss();
    if (tab === "files") {
      setNotesFolder(null);
      setNotesSurface("overview");
    }
    setState((current) => selectPrimaryTab(current, tab));
  }

  function openNotes(folder: string | null): void {
    Keyboard.dismiss();
    setNotesFolder(folder);
    setNotesSurface("overview");
    setSidebarVisible(false);
    setState((current) => selectPrimaryTab(current, "files"));
  }

  function chooseWorkspaceFromSidebar(): void {
    void editorController.prepareWorkspaceSwitch().then((prepared) => {
      if (!prepared) {
        Alert.alert("暂时无法切换工作区", "当前笔记的最新修改尚未确认，工作区保持不变。");
        return;
      }
      setSidebarVisible(false);
      setPickerVisible(true);
    });
  }

  if (state.startup === "checking-workspace") {
    return (
      <LocaleContext.Provider value={locale}>
        <ThemeContext.Provider value={themeContext}>
          <WorkspaceCheckScreen />
        </ThemeContext.Provider>
      </LocaleContext.Provider>
    );
  }

  if (state.startup === "workspace-error") {
    return (
      <LocaleContext.Provider value={locale}>
        <ThemeContext.Provider value={themeContext}>
          <WorkspaceErrorScreen
            message={state.errorMessage}
            onRetry={() => setState((current) => retryWorkspaceCheck(current))}
          />
        </ThemeContext.Provider>
      </LocaleContext.Provider>
    );
  }

  if (state.startup === "needs-workspace") {
    return (
      <LocaleContext.Provider value={locale}>
        <ThemeContext.Provider value={themeContext}>
          <View style={styles.shell}>
            <WorkspaceCheckScreen />
            <WorkspacePicker
              activeWorkspaceId={null}
              busy={workspaceBusy}
              canClose={false}
              catalog={catalog}
              error={workspaceError}
              onAddLinked={addLinked}
              onClose={() => undefined}
              onOpenManaged={openManaged}
              onPin={pinWorkspace}
              onReauthorize={reauthorizeWorkspace}
              onRemove={removeWorkspace}
              onRename={renameWorkspace}
              onSelect={selectWorkspace}
              visible
            />
          </View>
        </ThemeContext.Provider>
      </LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={locale}>
      <ThemeContext.Provider value={themeContext}>
        <UiSoundProvider enabled={soundEnabled} volume={soundVolume}>
          <View style={styles.shell}>
            <View
              ref={editorDestination}
              collapsable={false}
              accessibilityElementsHidden={!editorVisible}
              importantForAccessibility={editorVisible ? "auto" : "no-hide-descendants"}
              pointerEvents={editorVisible ? "auto" : "none"}
              style={[styles.destination, !editorVisible && styles.hiddenDestination]}
            >
              <EditorWorkspaceView
                renderBottomNavigation={(toolbar) =>
                  editorVisible ? (
                    <PrimaryNavigation
                      activeTab="files"
                      clickVibration={clickVibration}
                      onSelect={navigatePrimary}
                    >
                      {toolbar}
                    </PrimaryNavigation>
                  ) : (
                    toolbar
                  )
                }
                controller={editorController}
                key={catalog.activeWorkspaceId ?? "managed"}
                onExitToNotes={() => setNotesSurface("overview")}
                onOpenSidebar={() => setSidebarVisible(true)}
                services={services}
                clickVibration={clickVibration}
              />
            </View>
            {state.activeTab === "files" && notesSurface === "overview" ? (
              <View style={styles.destination}>
                <NotesOverviewScreen
                  bottomNavigation={
                    <PrimaryNavigation
                      activeTab={state.activeTab}
                      clickVibration={clickVibration}
                      onSelect={navigatePrimary}
                    />
                  }
                  controller={editorController}
                  folder={notesFolder}
                  onOpenEditor={() => setNotesSurface("editor")}
                  onOpenSidebar={() => setSidebarVisible(true)}
                />
              </View>
            ) : null}
            {state.activeTab === "agent" ? (
              <View style={styles.destination}>
                <AgentHomeScreen
                  key={services.activeWorkspace.grant.workspaceId}
                  controller={editorController}
                  services={services}
                  onOpenSidebar={() => setSidebarVisible(true)}
                  clickVibration={clickVibration}
                  onNavigate={navigatePrimary}
                />
              </View>
            ) : state.activeTab === "learn" ? (
              <View style={styles.destination}>
                <LearningScreen
                  onOpenSidebar={() => setSidebarVisible(true)}
                  renderBottomNavigation={(actions) => (
                    <PrimaryNavigation
                      activeTab="learn"
                      clickVibration={clickVibration}
                      onSelect={navigatePrimary}
                    >
                      {actions}
                    </PrimaryNavigation>
                  )}
                  services={services}
                />
              </View>
            ) : state.activeTab === "settings" ? (
              <View style={styles.destination}>
                <SettingsScreen
                  onOpenSidebar={() => setSidebarVisible(true)}
                  onClearAiAudit={() =>
                    services.aiStore.clearToolAudit(services.activeWorkspace.grant.workspaceId)
                  }
                  onClearAiConversations={async () => {
                    const conversations = await services.aiStore.listConversations(
                      services.activeWorkspace.grant.workspaceId,
                    );
                    for (const conversation of conversations) {
                      await services.aiStore.removeConversation(conversation.id);
                    }
                    await services.aiStore.clearPromptHistory(
                      services.activeWorkspace.grant.workspaceId,
                    );
                  }}
                  onClearSearchHistory={() => services.workspaceSearch.clearRecentQueries()}
                  onSettingsChanged={() => setSettingsRevision((revision) => revision + 1)}
                  store={services.settingsStore}
                />
              </View>
            ) : null}
            {state.activeTab === "settings" ? (
              <PrimaryNavigation
                activeTab={state.activeTab}
                clickVibration={clickVibration}
                onSelect={navigatePrimary}
              />
            ) : null}
            <GlobalSidebar
              activeFolder={notesFolder}
              activeTab={state.activeTab}
              canCreateFolder={editorController.services.browser.capabilities.createDirectory}
              canMoveFiles={editorController.services.browser.capabilities.move}
              entries={editorController.browserEntries}
              onChooseWorkspace={chooseWorkspaceFromSidebar}
              onClose={() => setSidebarVisible(false)}
              onCreateFolder={editorController.createBrowserDirectory}
              onMoveFile={editorController.moveBrowserEntry}
              onOpenNote={async (path) => {
                const opened = await editorController.openDocumentFromOverview(path);
                if (opened) {
                  setSidebarVisible(false);
                  setNotesSurface("editor");
                  setState((current) => selectPrimaryTab(current, "files"));
                }
                return opened;
              }}
              onOpenNotes={openNotes}
              visible={sidebarVisible}
              workspaceName={services.activeWorkspace.grant.displayName}
            />
            <WorkspacePicker
              activeWorkspaceId={catalog.activeWorkspaceId}
              busy={workspaceBusy}
              canClose
              catalog={catalog}
              error={workspaceError}
              onAddLinked={addLinked}
              onClose={() => setPickerVisible(false)}
              onOpenManaged={openManaged}
              onPin={pinWorkspace}
              onReauthorize={reauthorizeWorkspace}
              onRemove={removeWorkspace}
              onRename={renameWorkspace}
              onSelect={selectWorkspace}
              visible={pickerVisible}
            />
          </View>
        </UiSoundProvider>
      </ThemeContext.Provider>
    </LocaleContext.Provider>
  );
}

function MobileStorageRequiredScreen() {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  return (
    <View style={styles.centeredScreen}>
      <FileText color={theme.colors.accent} size={34} />
      <Text accessibilityRole="header" style={styles.errorTitle}>
        {t("web.title")}
      </Text>
      <Text style={styles.supportingText}>{t("web.body")}</Text>
    </View>
  );
}

const EMPTY_WORKSPACE_CATALOG: WorkspaceCatalog = Object.freeze({
  version: 1,
  activeWorkspaceId: null,
  workspaces: Object.freeze([]),
});

function WorkspaceCheckScreen() {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  return (
    <View style={styles.centeredScreen}>
      <ActivityIndicator
        accessibilityLabel={t("startup.checkingLabel")}
        color={theme.colors.accent}
        size="large"
      />
      <Text style={styles.supportingText}>{t("startup.checkingAccess")}</Text>
    </View>
  );
}

function WorkspaceErrorScreen({
  message,
  onRetry,
}: Readonly<{ message: string | null; onRetry: () => void }>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  return (
    <View style={styles.centeredScreen}>
      <Text accessibilityRole="alert" style={styles.errorTitle}>
        {t("startup.workspaceUnavailable")}
      </Text>
      <Text style={styles.supportingText}>{message ?? t("startup.workspaceCheckFailed")}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
      >
        <Text style={styles.primaryButtonText}>{t("startup.retry")}</Text>
      </Pressable>
    </View>
  );
}

const absoluteFill: ViewStyle = Object.freeze({
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.colors.background,
    },
    destination: {
      flex: 1,
      minHeight: 0,
    },
    // Keep the renderer attached for draft/flush continuity. Android blocks
    // native focus inside this destination while another page is visible.
    hiddenDestination: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      opacity: 0,
      overflow: "hidden",
    },
    centeredScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 24,
      backgroundColor: theme.colors.background,
    },
    supportingText: {
      maxWidth: 480,
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 23,
      textAlign: "center",
    },
    guideScreen: {
      flex: 1,
      justifyContent: "center",
      gap: 20,
      paddingHorizontal: 20,
      paddingVertical: 28,
      backgroundColor: theme.colors.background,
    },
    guideHeader: {
      alignItems: "center",
      gap: 10,
    },
    guideIcon: {
      width: 64,
      height: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft,
    },
    guideTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "700",
    },
    guideBody: {
      maxWidth: 520,
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 23,
      textAlign: "center",
    },
    workspaceCard: {
      width: "100%",
      maxWidth: 560,
      minHeight: 92,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft,
    },
    workspaceCardIcon: {
      width: 48,
      height: 48,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
    },
    workspaceCardText: {
      minWidth: 0,
      flex: 1,
      gap: 3,
    },
    workspaceName: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    workspacePath: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    workspaceCapability: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 17,
    },
    primaryButton: {
      minWidth: 200,
      minHeight: 48,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 22,
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
    },
    primaryButtonPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.97 }],
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "700",
    },
    phaseNotice: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      gap: 4,
      padding: 14,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    phaseNoticeTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    phaseNoticeText: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
    },
    errorTitle: {
      color: theme.colors.error,
      fontSize: 20,
      fontWeight: "700",
    },
    plannedScreen: {
      ...absoluteFill,
      bottom: 84,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      padding: 28,
      backgroundColor: theme.colors.background,
    },
    phasePill: {
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      fontSize: 12,
      fontWeight: "700",
    },
    plannedTitle: {
      color: theme.colors.text,
      fontSize: 23,
      fontWeight: "700",
      textAlign: "center",
    },
    plannedBody: {
      maxWidth: 520,
      color: theme.colors.mutedText,
      fontSize: 15,
      lineHeight: 23,
      textAlign: "center",
    },
    plannedBoundary: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontStyle: "italic",
      textAlign: "center",
    },
  });
}
