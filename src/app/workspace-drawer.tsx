import {
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  ListTree,
  RefreshCw,
  Search,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { DocumentId } from "../domain/identifiers";
import type { MarkdownOutlineItem } from "../editor-kernel/editor-kernel-state";
import type { HistorySnapshot } from "../history/history-store";
import { AppSafeArea } from "./app-safe-area";
import type { FileEntry } from "../workspace/workspace-adapter";
import type {
  WorkspaceBrowserCapabilities,
  WorkspaceConflictPolicy,
} from "../workspace/workspace-browser";
import {
  buildFileBrowserModel,
  filesForActivityPaths,
  sortBrowserFiles,
  type FileBrowserSort,
} from "./file-browser-model";
import type { BrowserCommandResult } from "./browser-command";
import type { FileActivity } from "./file-activity-store";
import type { OpenWorkspaceDocument } from "./workspace-state";
import { useTranslate, type Translator } from "./locale";
import { useTheme } from "./theme";
import { IconButton } from "./workspace-header";
import {
  ActionButton,
  EntryActionModal,
  PathDialog,
  RenameDialog,
  TransferDialog,
  NewEntryModal,
  TemplatePickerModal,
} from "./workspace-drawer-dialogs";
import { useWorkspaceDrawerStyles } from "./workspace-drawer-styles";
import { OverlaySideSheet } from "./overlay-side-sheet";
import { WorkspaceDrawerSecondary } from "./workspace-drawer-secondary";
import { useEntryTransfer } from "./use-entry-transfer";
import { DEFAULT_FILE_TEMPLATE_REGISTRY } from "./file-template-registry";
import { useEntryCreation } from "./use-entry-creation";
import { BrowserTree, FlatFileList } from "./workspace-browser-list";

type DrawerView = "files" | "outline" | "history";
type FileBrowserDestination = "all" | "recent" | "favorites";

type WorkspaceDrawerProps = Readonly<{
  visible: boolean;
  workspaceName: string;
  workspaceLocation: string;
  documents: readonly OpenWorkspaceDocument[];
  activeDocumentId: DocumentId;
  browserEntries: readonly FileEntry[];
  browserCapabilities: WorkspaceBrowserCapabilities;
  browserLoading: boolean;
  browserError: string | null;
  fileActivity: FileActivity;
  fileActivityError: string | null;
  outline: readonly MarkdownOutlineItem[];
  history: readonly HistorySnapshot[];
  historyError: string | null;
  onClose: () => void;
  onChooseWorkspace?: () => void;
  onSelectDocument: (documentId: DocumentId) => void;
  onOpenBrowserFile: (entry: FileEntry, confirmed?: boolean) => Promise<BrowserCommandResult>;
  onRefreshBrowser: () => Promise<void>;
  onCreateFile: (
    path: string,
    content: string,
    conflict?: "fail" | "replace" | "keep-both",
  ) => Promise<BrowserCommandResult>;
  onCreateDirectory: (path: string) => Promise<BrowserCommandResult>;
  onRenameEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  onMoveEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  onCopyEntry: (
    entry: FileEntry,
    to: string,
    conflict?: WorkspaceConflictPolicy,
  ) => Promise<BrowserCommandResult>;
  onRemoveEntry: (entry: FileEntry) => Promise<BrowserCommandResult>;
  onShareEntry: (entry: FileEntry) => Promise<BrowserCommandResult>;
  onSetFavorite: (entry: FileEntry, favorite: boolean) => Promise<boolean>;
  onRestoreHistory: (snapshot: HistorySnapshot) => void;
  onRemoveHistory: (snapshot: HistorySnapshot) => void;
  onClearHistory: () => void;
}>;

const SORTS: readonly FileBrowserSort[] = Object.freeze(["name", "modified", "type", "size"]);

export function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = useWorkspaceDrawerStyles();
  const [view, setView] = useState<DrawerView>("files");
  const [destination, setDestination] = useState<FileBrowserDestination>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FileBrowserSort>("name");
  const [expandedPaths, setExpandedPaths] = useState<readonly string[]>(Object.freeze([]));
  const [actionEntry, setActionEntry] = useState<FileEntry | null>(null);
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const transfer = useEntryTransfer({
    capabilities: props.browserCapabilities,
    onMove: props.onMoveEntry,
    onCopy: props.onCopyEntry,
  });
  const creation = useEntryCreation({
    capabilities: props.browserCapabilities,
    onCreateFile: props.onCreateFile,
    onCreateDirectory: props.onCreateDirectory,
  });
  const model = useMemo(
    () => buildFileBrowserModel(props.browserEntries, sort),
    [props.browserEntries, sort],
  );
  const files = useMemo(
    () =>
      sortBrowserFiles(
        props.browserEntries.filter((entry) => entry.kind === "file"),
        sort,
      ),
    [props.browserEntries, sort],
  );
  const filteredFiles = useMemo(() => {
    const normalized = query.normalize("NFC").trim().toLocaleLowerCase();
    return normalized.length === 0
      ? files
      : files.filter((entry) => entry.path.toLocaleLowerCase().includes(normalized));
  }, [files, query]);
  const recentFiles = useMemo(
    () =>
      filesForActivityPaths(
        props.browserEntries,
        props.fileActivity.recent.map((item) => item.path),
      ),
    [props.browserEntries, props.fileActivity.recent],
  );
  const favoriteFiles = useMemo(
    () =>
      sortBrowserFiles(
        filesForActivityPaths(props.browserEntries, props.fileActivity.favorites),
        sort,
      ),
    [props.browserEntries, props.fileActivity.favorites, sort],
  );

  function cycleSort(): void {
    const current = SORTS.indexOf(sort);
    setSort(SORTS[(current + 1) % SORTS.length] ?? "name");
  }

  function toggleDirectory(path: string): void {
    setExpandedPaths((current) =>
      current.includes(path)
        ? Object.freeze(current.filter((item) => item !== path))
        : Object.freeze([...current, path]),
    );
  }

  async function runAction(action: () => Promise<BrowserCommandResult>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (!result.ok) setActionError(result.error ?? "The workspace operation failed.");
      return result.ok;
    } catch {
      setActionError("The workspace operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openEntry(entry: FileEntry): Promise<void> {
    if (entry.kind === "directory") {
      toggleDirectory(entry.path);
      return;
    }
    const result = await props.onOpenBrowserFile(entry);
    if (result.ok) {
      props.onClose();
      return;
    }
    if (result.errorCode === "CONFIRMATION_REQUIRED") {
      Alert.alert("Open large file?", result.error ?? "This file may be slow to open.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open",
          onPress: () => {
            void runAction(() => props.onOpenBrowserFile(entry, true)).then((opened) => {
              if (opened) props.onClose();
            });
          },
        },
      ]);
      return;
    }
    setActionError(result.error ?? "The workspace operation failed.");
  }

  async function submitRename(conflict: WorkspaceConflictPolicy = "fail"): Promise<void> {
    if (!renameEntry || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await props.onRenameEntry(renameEntry, pathInput, conflict);
      if (!result.ok && result.errorCode === "ALREADY_EXISTS" && conflict === "fail") {
        showRenameConflict(pathInput);
        return;
      }
      if (!result.ok) {
        setActionError(result.error ?? "The workspace operation failed.");
        return;
      }
      setRenameEntry(null);
      setPathInput("");
    } catch {
      setActionError("The workspace operation failed.");
    } finally {
      setBusy(false);
    }
  }

  function showRenameConflict(path: string): void {
    if (props.browserCapabilities.renameReplace && props.browserCapabilities.renameKeepBoth) {
      Alert.alert("A file already exists", path, [
        { text: "Cancel", style: "cancel" },
        { text: "Keep both", onPress: () => void submitRename("keep-both") },
        { text: "Replace", style: "destructive", onPress: () => void submitRename("replace") },
      ]);
    } else if (props.browserCapabilities.renameKeepBoth) {
      Alert.alert("A file already exists", path, [
        { text: "Cancel", style: "cancel" },
        { text: "Keep both", onPress: () => void submitRename("keep-both") },
      ]);
    } else {
      Alert.alert("A file already exists", path);
    }
  }

  function confirmRemove(entry: FileEntry): void {
    const permanent = !props.browserCapabilities.trash;
    Alert.alert(
      permanent ? "Delete permanently?" : "Move to Trash?",
      permanent
        ? `${entry.path}\n\nThis provider has no Trash. This action cannot be undone.`
        : entry.path,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: permanent ? "Delete" : "Move to Trash",
          style: "destructive",
          onPress: () => {
            setActionEntry(null);
            void runAction(() => props.onRemoveEntry(entry));
          },
        },
      ],
    );
  }

  return (
    <OverlaySideSheet maxWidth={320} onClose={props.onClose} visible={props.visible}>
      <AppSafeArea contentStyle={styles.sheetFill}>
        <View style={styles.drawerContent}>
          <DrawerHeader {...props} />
          <DrawerTabs view={view} onChange={setView} />
          {view === "files" ? (
            <View style={styles.browserPane}>
              <View style={styles.browserToolbar}>
                <View style={styles.searchField}>
                  <Search color={theme.colors.mutedText} size={17} />
                  <TextInput
                    accessibilityLabel={t("drawer.searchFilesLabel")}
                    autoCapitalize="none"
                    onChangeText={setQuery}
                    placeholder={t("drawer.searchFiles")}
                    placeholderTextColor={theme.colors.mutedText}
                    style={styles.searchInput}
                    value={query}
                  />
                </View>
                <IconButton label={t("drawer.sortBy", { sort })} onPress={cycleSort}>
                  <ArrowUpDown color={theme.colors.text} size={19} />
                </IconButton>
                <IconButton
                  label={t("drawer.refresh")}
                  onPress={() => void props.onRefreshBrowser()}
                >
                  <RefreshCw color={theme.colors.text} size={19} />
                </IconButton>
              </View>
              {query.trim().length === 0 ? (
                <DestinationChips destination={destination} onChange={setDestination} t={t} />
              ) : null}
              {(actionError ?? props.browserError ?? props.fileActivityError) ? (
                <Text accessibilityRole="alert" style={styles.errorBanner}>
                  {actionError ?? props.browserError ?? props.fileActivityError}
                </Text>
              ) : null}
              <ScrollView
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                style={styles.scroll}
              >
                {props.browserLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.colors.accent} size="small" />
                    <Text style={styles.meta}>{t("drawer.reading")}</Text>
                  </View>
                ) : query.trim().length > 0 ? (
                  <FlatFileList
                    activePath={activePath(props)}
                    capabilities={props.browserCapabilities}
                    entries={filteredFiles}
                    favoritePaths={props.fileActivity.favorites}
                    onAction={setActionEntry}
                    onOpen={(entry) => void openEntry(entry)}
                  />
                ) : destination === "recent" || destination === "favorites" ? (
                  <FlatFileList
                    activePath={activePath(props)}
                    capabilities={props.browserCapabilities}
                    entries={destination === "recent" ? recentFiles : favoriteFiles}
                    favoritePaths={props.fileActivity.favorites}
                    onAction={setActionEntry}
                    onOpen={(entry) => void openEntry(entry)}
                  />
                ) : (
                  <BrowserTree
                    activePath={activePath(props)}
                    capabilities={props.browserCapabilities}
                    expandedPaths={expandedPaths}
                    favoritePaths={props.fileActivity.favorites}
                    nodes={model.tree}
                    onAction={setActionEntry}
                    onOpen={(entry) => void openEntry(entry)}
                    onToggle={toggleDirectory}
                  />
                )}
              </ScrollView>
              <View style={styles.browserFooter}>
                <View />
                {props.browserCapabilities.createFile ||
                props.browserCapabilities.createDirectory ? (
                  <View style={styles.createBar}>
                    <ActionButton
                      icon={FilePlus2}
                      label={t("drawer.new")}
                      onPress={creation.openMenu}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <WorkspaceDrawerSecondary
              history={props.history}
              historyError={props.historyError}
              onRestoreHistory={props.onRestoreHistory}
              onRemoveHistory={props.onRemoveHistory}
              onClearHistory={props.onClearHistory}
              outline={props.outline}
              view={view}
            />
          )}
        </View>
      </AppSafeArea>

      <EntryActionModal
        capabilities={props.browserCapabilities}
        entry={actionEntry}
        favorite={actionEntry !== null && props.fileActivity.favorites.includes(actionEntry.path)}
        onClose={() => setActionEntry(null)}
        onCopy={(entry) => {
          setActionEntry(null);
          transfer.begin("copy", entry);
        }}
        onMove={(entry) => {
          setActionEntry(null);
          transfer.begin("move", entry);
        }}
        onFavorite={(entry, favorite) => {
          void props.onSetFavorite(entry, favorite).then(() => {
            setActionEntry(null);
          });
        }}
        onRemove={confirmRemove}
        onShare={(entry) => {
          setActionEntry(null);
          void runAction(() => props.onShareEntry(entry));
        }}
        onRename={(entry) => {
          setActionEntry(null);
          setRenameEntry(entry);
          setPathInput(entry.path);
          setActionError(null);
        }}
      />
      <NewEntryModal
        canCreateDirectory={props.browserCapabilities.createDirectory}
        canCreateFile={props.browserCapabilities.createFile}
        onClose={creation.closeMenu}
        onDirectory={() => creation.begin("directory")}
        onFile={() => creation.begin("file")}
        onTemplate={creation.openTemplates}
        visible={creation.newMenuVisible}
      />
      <TemplatePickerModal
        onClose={creation.closeTemplates}
        onSelect={creation.beginTemplate}
        templates={DEFAULT_FILE_TEMPLATE_REGISTRY.templates}
        visible={creation.templateMenuVisible}
      />
      <PathDialog
        busy={creation.busy}
        error={creation.error}
        kind={creation.kind}
        onCancel={creation.cancel}
        onChange={creation.setValue}
        onSubmit={() => void creation.submit()}
        value={creation.value}
      />
      <RenameDialog
        busy={busy}
        entry={renameEntry}
        onCancel={() => setRenameEntry(null)}
        onChange={setPathInput}
        onSubmit={() => void submitRename()}
        value={pathInput}
      />
      <TransferDialog
        busy={transfer.busy}
        entry={transfer.transfer?.entry ?? null}
        error={transfer.error}
        kind={transfer.transfer?.kind ?? null}
        onCancel={transfer.cancel}
        onChange={transfer.setValue}
        onSubmit={() => void transfer.submit()}
        value={transfer.value}
      />
    </OverlaySideSheet>
  );
}

function activePath(props: WorkspaceDrawerProps): string | null {
  return (
    props.documents.find((document) => document.documentId === props.activeDocumentId)?.path ?? null
  );
}

function DrawerHeader(props: WorkspaceDrawerProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = useWorkspaceDrawerStyles();
  return (
    <View style={styles.drawerHeader}>
      <Pressable
        accessibilityHint={t("drawer.chooseWorkspace")}
        accessibilityRole="button"
        disabled={!props.onChooseWorkspace}
        onPress={() => {
          props.onClose();
          props.onChooseWorkspace?.();
        }}
        style={({ pressed }) => [styles.workspaceIdentity, pressed && styles.pressed]}
      >
        <FolderOpen color={theme.colors.accent} size={22} />
        <View style={styles.workspaceText}>
          <Text numberOfLines={1} style={styles.title}>
            {props.workspaceName}
          </Text>
          <Text numberOfLines={1} style={styles.location}>
            {props.workspaceLocation}
          </Text>
        </View>
      </Pressable>
      <IconButton label={t("drawer.close")} onPress={props.onClose}>
        <X color={theme.colors.text} size={21} />
      </IconButton>
    </View>
  );
}

function DrawerTabs({
  view,
  onChange,
}: Readonly<{ view: DrawerView; onChange: (view: DrawerView) => void }>) {
  const styles = useWorkspaceDrawerStyles();
  const t = useTranslate();
  return (
    <View accessibilityRole="tablist" style={styles.views}>
      <DrawerViewButton
        active={view === "files"}
        icon={FileText}
        label={t("drawer.files")}
        onPress={() => onChange("files")}
      />
      <DrawerViewButton
        active={view === "outline"}
        icon={ListTree}
        label={t("drawer.outline")}
        onPress={() => onChange("outline")}
      />
      <DrawerViewButton
        active={view === "history"}
        icon={History}
        label={t("drawer.history")}
        onPress={() => onChange("history")}
      />
    </View>
  );
}

/**
 * Flat All / Recent / Favorites switch. This replaces the former
 * "BY FORMAT" landing page, which added a navigation level and duplicated
 * information the tree already shows.
 */
function DestinationChips({
  destination,
  onChange,
  t,
}: Readonly<{
  destination: FileBrowserDestination;
  onChange: (destination: FileBrowserDestination) => void;
  t: Translator;
}>) {
  const styles = useWorkspaceDrawerStyles();
  // Text-only chips: at a 60% drawer width three iconned chips could not fit
  // their labels, so the icons were dropped rather than truncating the text.
  const chips: readonly Readonly<{ id: FileBrowserDestination; label: string }>[] = [
    { id: "all", label: t("drawer.allFiles") },
    { id: "recent", label: t("drawer.recent") },
    { id: "favorites", label: t("drawer.favorites") },
  ];
  return (
    <View accessibilityRole="tablist" style={styles.chips}>
      {chips.map((chip) => {
        const active = chip.id === destination;
        return (
          <Pressable
            accessibilityLabel={chip.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={chip.id}
            onPress={() => onChange(chip.id)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.activeChip,
              pressed && styles.pressed,
            ]}
          >
            <Text numberOfLines={1} style={[styles.chipText, active && styles.activeChipText]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DrawerViewButton({
  active,
  icon: Icon,
  label,
  onPress,
}: Readonly<{
  active: boolean;
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>>;
  label: string;
  onPress: () => void;
}>) {
  const theme = useTheme();
  const styles = useWorkspaceDrawerStyles();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.viewButton,
        active && styles.activeViewButton,
        pressed && styles.pressed,
      ]}
    >
      <Icon color={active ? theme.colors.accent : theme.colors.mutedText} size={17} />
      <Text style={[styles.viewText, active && styles.activeViewText]}>{label}</Text>
    </Pressable>
  );
}
