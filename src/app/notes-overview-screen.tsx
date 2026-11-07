import {
  Check,
  ChevronLeft,
  FileText,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { WorkspaceDocumentSnapshot } from "../workspace/workspace-repository";
import type { FileEntry } from "../workspace/workspace-adapter";
import { parseWorkspacePath } from "../workspace/workspace-path";
import type { BrowserCommandResult } from "./browser-command";
import type { EditorWorkspaceController } from "./editor-workspace-controller";
import { noteFolderSummaries, noteMoveTargetPath, noteParentFolder } from "./note-file-management";
import { editableNoteName, noteRenameTargetPath } from "./note-rename";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";
import { CircleAction } from "./mira-controls";
import { identityColors, useTheme, type Theme } from "./theme";

type NoteActionPage = "menu" | "rename" | "move" | "delete";

type NotesOverviewScreenProps = Readonly<{
  controller: EditorWorkspaceController;
  folder: string | null;
  bottomNavigation?: ReactNode;
  onOpenEditor: () => void;
  onOpenSidebar: () => void;
}>;

export function NotesOverviewScreen({
  controller,
  folder,
  bottomNavigation,
  onOpenEditor,
  onOpenSidebar,
}: NotesOverviewScreenProps) {
  const theme = useTheme();
  const { top: safeAreaTop } = useSafeAreaInsets();
  const styles = createStyles(theme);
  const [documents, setDocuments] = useState<readonly WorkspaceDocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [actionDocument, setActionDocument] = useState<WorkspaceDocumentSnapshot | null>(null);
  const [actionPage, setActionPage] = useState<NoteActionPage>("menu");
  const [actionValue, setActionValue] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void controller.services.repository
      .list()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError("笔记暂时无法读取，请稍后重试。");
          return;
        }
        setDocuments(result.value);
        setError(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [controller.services.repository]);

  useEffect(() => {
    if (!actionDocument) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (actionBusy) return true;
      if (actionPage !== "menu") setActionPage("menu");
      else {
        Keyboard.dismiss();
        setActionDocument(null);
        setActionError(null);
      }
      return true;
    });
    return () => subscription.remove();
  }, [actionBusy, actionDocument, actionPage]);

  const visibleDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return documents.filter((document) => {
      const inFolder = folder === null || document.path.startsWith(`${folder}/`);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        document.path.toLocaleLowerCase().includes(normalizedQuery) ||
        document.markdown.toLocaleLowerCase().includes(normalizedQuery);
      return inFolder && matchesQuery;
    });
  }, [documents, folder, query]);

  async function open(document: WorkspaceDocumentSnapshot): Promise<void> {
    if (openingPath !== null) return;
    setOpeningPath(document.path);
    setError(null);
    const opened = await controller.openDocumentFromOverview(document.path);
    setOpeningPath(null);
    if (opened) onOpenEditor();
    else setError("这篇笔记尚未安全保存，暂时不能切换。");
  }

  async function createNote(): Promise<void> {
    if (openingPath !== null) return;
    setOpeningPath("__new__");
    setError(null);
    const created = await controller.addDocumentFromOverview();
    setOpeningPath(null);
    if (created) onOpenEditor();
    else setError("当前笔记尚未安全保存，暂时不能新建标签。");
  }

  function openActions(document: WorkspaceDocumentSnapshot): void {
    Keyboard.dismiss();
    setActionDocument(document);
    setActionPage("menu");
    setActionValue(editableNoteName(document.path));
    setActionError(null);
  }

  function closeActions(): void {
    if (actionInFlight.current) return;
    Keyboard.dismiss();
    setActionDocument(null);
    setActionPage("menu");
    setActionError(null);
  }

  async function reloadDocuments(): Promise<boolean> {
    const result = await controller.services.repository.list();
    if (!result.ok) return false;
    setDocuments(result.value);
    return true;
  }

  async function runAction(
    action: (entry: FileEntry) => Promise<BrowserCommandResult>,
  ): Promise<void> {
    if (!actionDocument || actionInFlight.current) return;
    const entry = fileEntryFor(actionDocument, controller.browserEntries);
    if (!entry) {
      setActionError("这篇笔记的文件路径无法使用。");
      return;
    }
    actionInFlight.current = true;
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await action(entry);
      if (!result.ok) {
        setActionError(
          result.errorCode === "ALREADY_EXISTS"
            ? "目标位置已有同名文件，请换一个名称或文件夹。"
            : (result.error ?? "操作没有完成，请重试。"),
        );
        return;
      }
      if (!(await reloadDocuments())) setError("操作已完成，笔记列表暂时无法刷新。");
      else setError(null);
      Keyboard.dismiss();
      setActionDocument(null);
      setActionPage("menu");
      setActionError(null);
    } catch {
      setActionError("操作没有完成，请重试。");
    } finally {
      actionInFlight.current = false;
      setActionBusy(false);
    }
  }

  async function renameNote(): Promise<void> {
    if (!actionDocument) return;
    const target = noteRenameTargetPath(actionDocument.path, actionValue);
    if (!target.ok) {
      setActionError(target.code === "EMPTY" ? "请输入笔记名称。" : "名称不能包含路径符号。");
      return;
    }
    if (target.path === actionDocument.path) {
      closeActions();
      return;
    }
    await runAction((entry) => controller.renameBrowserEntry(entry, target.path));
  }

  async function moveNote(folder: string | null): Promise<void> {
    if (!actionDocument) return;
    const target = noteMoveTargetPath(actionDocument.path, folder);
    if (!target.ok) {
      if (target.code !== "SAME") setActionError("目标文件夹无法使用。");
      return;
    }
    await runAction((entry) => controller.moveBrowserEntry(entry, target.path));
  }

  const capabilities = controller.services.browser.capabilities;
  const actionEntry = actionDocument
    ? fileEntryFor(actionDocument, controller.browserEntries)
    : null;
  const favorite = actionEntry
    ? controller.fileActivity.favorites.includes(actionEntry.path)
    : false;
  const folders = useMemo(
    () => noteFolderSummaries(controller.browserEntries),
    [controller.browserEntries],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <CircleAction label="打开全局侧边栏" onPress={onOpenSidebar}>
          <SidebarToggleIcon color={theme.colors.text} expanded={false} />
        </CircleAction>
        <Text style={styles.headerCopy}>Mira</Text>
        <CircleAction
          label={searchVisible ? "关闭搜索" : "搜索笔记"}
          onPress={() => {
            setSearchVisible((visible) => !visible);
            if (searchVisible) setQuery("");
          }}
        >
          {searchVisible ? (
            <ChevronUp color={theme.colors.text} size={21} />
          ) : (
            <Search color={theme.colors.text} size={21} />
          )}
        </CircleAction>
        <CircleAction label="新建笔记" onPress={() => void createNote()}>
          <Plus color={theme.colors.text} size={22} />
        </CircleAction>
      </View>

      {searchVisible ? (
        <View style={styles.searchBar}>
          <Search color={theme.colors.mutedText} size={18} />
          <TextInput
            autoFocus
            onChangeText={setQuery}
            placeholder="搜索标题或正文"
            placeholderTextColor={theme.colors.mutedText}
            style={styles.searchInput}
            value={query}
          />
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.emptyCopy}>正在整理笔记</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={visibleDocuments}
          keyExtractor={(document) => document.documentId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <NoteRow
              busy={openingPath === item.path}
              document={item}
              onOpenActions={() => openActions(item)}
              onPress={() => void open(item)}
              styles={styles}
              theme={theme}
            />
          )}
          ListHeaderComponent={
            <View style={styles.listHeading}>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
                {folder ?? "全部笔记"}
              </Text>
              <Text style={styles.subtitle}>
                {visibleDocuments.length} {query.trim() ? "条匹配结果" : "条笔记"}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyGlyph}>
                <FileText color={theme.colors.mutedText} size={26} />
              </View>
              <Text style={styles.emptyTitle}>
                {query.trim() ? "没有匹配的笔记" : "这里还没有笔记"}
              </Text>
              {!query.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void createNote()}
                  style={({ pressed }) => [styles.firstNote, pressed && styles.pressed]}
                >
                  <Plus color={theme.colors.canvas} size={18} />
                  <Text style={styles.firstNoteText}>新建第一条笔记</Text>
                </Pressable>
              ) : null}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      {bottomNavigation}
      {actionDocument ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          enabled={actionPage === "rename"}
          keyboardVerticalOffset={safeAreaTop}
          pointerEvents="box-none"
          style={styles.actionOverlay}
        >
          <Pressable
            accessibilityLabel="关闭笔记操作"
            onPress={closeActions}
            style={styles.actionBackdrop}
          />
          <View accessibilityRole="menu" style={styles.actionSheet}>
            <View style={styles.actionHandle} />
            <View style={styles.actionHeader}>
              {actionPage === "menu" ? (
                <View style={styles.actionHeaderSpace} />
              ) : (
                <Pressable
                  accessibilityLabel="返回笔记操作"
                  disabled={actionBusy}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActionPage("menu");
                    setActionError(null);
                  }}
                  style={({ pressed }) => [styles.actionIcon, pressed && styles.pressed]}
                >
                  <ChevronLeft color={theme.colors.text} size={21} />
                </Pressable>
              )}
              <View style={styles.actionTitleGroup}>
                <Text numberOfLines={1} style={styles.actionTitle}>
                  {titleFor(actionDocument)}
                </Text>
                <Text numberOfLines={1} style={styles.actionPath}>
                  {actionDocument.path}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="关闭笔记操作"
                accessibilityRole="button"
                disabled={actionBusy}
                onPress={closeActions}
                style={({ pressed }) => [styles.actionIcon, pressed && styles.pressed]}
              >
                {actionBusy ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <ChevronDown color={theme.colors.mutedText} size={20} />
                )}
              </Pressable>
            </View>

            {actionError ? (
              <Text accessibilityRole="alert" style={styles.actionError}>
                {actionError}
              </Text>
            ) : null}

            {actionPage === "menu" ? (
              <View style={styles.actionList}>
                {capabilities.rename ? (
                  <NoteActionRow
                    icon={Pencil}
                    label="重命名"
                    onPress={() => {
                      setActionValue(editableNoteName(actionDocument.path));
                      setActionPage("rename");
                    }}
                    styles={styles}
                    theme={theme}
                  />
                ) : null}
                {capabilities.move ? (
                  <NoteActionRow
                    icon={FolderInput}
                    label="移动到文件夹"
                    onPress={() => setActionPage("move")}
                    styles={styles}
                    theme={theme}
                  />
                ) : null}
                {actionEntry ? (
                  <NoteActionRow
                    icon={Star}
                    label={favorite ? "取消收藏" : "加入收藏"}
                    onPress={() =>
                      void runAction(async (entry) => ({
                        ok: await controller.setFavorite(entry, !favorite),
                        error: "收藏状态没有更新。",
                        errorCode: null,
                      }))
                    }
                    styles={styles}
                    theme={theme}
                  />
                ) : null}
                {capabilities.share ? (
                  <NoteActionRow
                    icon={Share2}
                    label="分享"
                    onPress={() => void runAction(controller.shareBrowserEntry)}
                    styles={styles}
                    theme={theme}
                  />
                ) : null}
                {capabilities.remove ? (
                  <>
                    <View style={styles.actionDivider} />
                    <NoteActionRow
                      danger
                      icon={Trash2}
                      label="删除笔记"
                      onPress={() => setActionPage("delete")}
                      styles={styles}
                      theme={theme}
                    />
                  </>
                ) : null}
              </View>
            ) : actionPage === "rename" ? (
              <View style={styles.actionForm}>
                <Text style={styles.actionPrompt}>新的笔记名称</Text>
                <TextInput
                  accessibilityLabel="新的笔记名称"
                  autoFocus
                  editable={!actionBusy}
                  onChangeText={(value) => {
                    setActionValue(value);
                    setActionError(null);
                  }}
                  onSubmitEditing={() => void renameNote()}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.actionInput}
                  value={actionValue}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={actionBusy}
                  onPress={() => void renameNote()}
                  style={({ pressed }) => [styles.actionPrimary, pressed && styles.pressed]}
                >
                  <Check color={theme.colors.canvas} size={19} />
                  <Text style={styles.actionPrimaryText}>保存名称</Text>
                </Pressable>
              </View>
            ) : actionPage === "move" ? (
              <ScrollView
                contentContainerStyle={styles.actionList}
                keyboardShouldPersistTaps="handled"
                style={styles.actionScroll}
              >
                <Text style={styles.actionPrompt}>选择目标文件夹</Text>
                {noteParentFolder(actionDocument.path) !== null ? (
                  <NoteActionRow
                    icon={FileText}
                    label="根目录"
                    onPress={() => void moveNote(null)}
                    styles={styles}
                    theme={theme}
                  />
                ) : null}
                {folders
                  .filter((folder) => folder.path !== noteParentFolder(actionDocument.path))
                  .map((folder) => (
                    <NoteActionRow
                      icon={FolderInput}
                      key={folder.path}
                      label={folder.path}
                      onPress={() => void moveNote(folder.path)}
                      styles={styles}
                      theme={theme}
                    />
                  ))}
                {folders.length === 0 ? (
                  <Text style={styles.actionEmpty}>先在侧边栏创建一个文件夹。</Text>
                ) : null}
              </ScrollView>
            ) : (
              <View style={styles.deletePanel}>
                <View style={styles.deleteIcon}>
                  <Trash2 color={theme.colors.error} size={25} />
                </View>
                <Text style={styles.deleteTitle}>删除这篇笔记？</Text>
                <Text style={styles.deleteCopy}>当前工作区不提供废纸篓时，此操作无法撤销。</Text>
                <View style={styles.deleteActions}>
                  <Pressable
                    onPress={() => setActionPage("menu")}
                    style={({ pressed }) => [styles.deleteCancel, pressed && styles.pressed]}
                  >
                    <Text style={styles.deleteCancelText}>取消</Text>
                  </Pressable>
                  <Pressable
                    disabled={actionBusy}
                    onPress={() => void runAction(controller.removeBrowserEntry)}
                    style={({ pressed }) => [styles.deleteConfirm, pressed && styles.pressed]}
                  >
                    <Text style={styles.deleteConfirmText}>确认删除</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function NoteRow({
  busy,
  document,
  onOpenActions,
  onPress,
  styles,
  theme,
}: Readonly<{
  busy: boolean;
  document: WorkspaceDocumentSnapshot;
  onOpenActions: () => void;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  const title = titleFor(document);
  const preview = previewFor(document.markdown, title);
  const folder = document.path.includes("/")
    ? document.path.split("/").slice(0, -1).join(" / ")
    : "根目录";
  return (
    <View style={styles.noteRow}>
      <Pressable
        accessibilityLabel={`打开笔记${title}`}
        accessibilityHint="长按可重命名、移动或删除"
        accessibilityRole="button"
        accessibilityState={{ busy }}
        delayLongPress={320}
        onLongPress={onOpenActions}
        onPress={onPress}
        style={({ pressed }) => [styles.noteMain, pressed && styles.pressed]}
      >
        <View style={styles.noteIcon}>
          <FileText color={theme.colors.canvas} size={22} />
        </View>
        <View style={styles.noteCopy}>
          <Text numberOfLines={1} style={styles.noteTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.notePreview}>
            {preview || folder}
          </Text>
        </View>
      </Pressable>
      {busy ? (
        <ActivityIndicator color={theme.colors.accent} size="small" />
      ) : (
        <CircleAction label={`${title}的笔记操作`} onPress={onOpenActions}>
          <MoreHorizontal color={theme.colors.mutedText} size={21} />
        </CircleAction>
      )}
    </View>
  );
}

function NoteActionRow({
  danger = false,
  icon: Icon,
  label,
  onPress,
  styles,
  theme,
}: Readonly<{
  danger?: boolean;
  icon: ComponentType<Readonly<{ color?: string; size?: number }>>;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    >
      <View style={[styles.actionRowIcon, danger && styles.actionRowIconDanger]}>
        <Icon color={danger ? theme.colors.error : theme.colors.accent} size={19} />
      </View>
      <Text style={[styles.actionRowText, danger && styles.actionRowTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function fileEntryFor(
  document: WorkspaceDocumentSnapshot,
  entries: readonly FileEntry[],
): FileEntry | null {
  const existing = entries.find((entry) => entry.kind === "file" && entry.path === document.path);
  if (existing) return existing;
  const parsed = parseWorkspacePath(document.path);
  if (!parsed.ok) return null;
  return Object.freeze({
    path: parsed.value,
    name: document.path.split("/").at(-1) ?? document.path,
    kind: "file",
    size: null,
    modifiedAt: null,
    contentType: "text/markdown",
  });
}

function titleFor(document: WorkspaceDocumentSnapshot): string {
  const heading = /^#\s+(.+)$/mu.exec(document.markdown)?.[1]?.trim();
  return heading || document.path.split("/").at(-1)?.replace(/\.md$/iu, "") || "未命名笔记";
}

function previewFor(markdown: string, title: string): string {
  return markdown
    .replace(/^#{1,6}\s+.+$/gmu, "")
    .replace(/```[\s\S]*?```/gu, "代码片段")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "图片")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[*_>`~-]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(title, "")
    .trim();
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, minHeight: 0, backgroundColor: theme.colors.background },
    header: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
    },
    headerCopy: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 21, fontWeight: "600" },
    listHeading: { paddingBottom: 16, gap: 4 },
    emptyGlyph: {
      alignItems: "center",
      justifyContent: "center",
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
    },
    firstNote: {
      flexDirection: "row",
      minHeight: 48,
      gap: 8,
      alignItems: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.text,
      paddingHorizontal: 16,
    },
    firstNoteText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "600" },
    title: { color: theme.colors.text, fontSize: 34, fontWeight: "600", letterSpacing: -0.9 },
    subtitle: { color: theme.colors.mutedText, fontSize: 12 },
    searchBar: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 13,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    searchInput: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 15 },
    error: {
      marginHorizontal: 14,
      marginBottom: 8,
      padding: 10,
      borderRadius: 10,
      color: theme.colors.warningText,
      backgroundColor: theme.colors.warningSurface,
      fontSize: 12,
    },
    list: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    noteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    noteMain: {
      flex: 1,
      minWidth: 0,
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
    },
    noteIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: identityColors.notes,
    },
    noteCopy: { flex: 1, minWidth: 0, gap: 4 },
    noteTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
    notePreview: { color: theme.colors.mutedText, fontSize: 13 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
    emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 13, textAlign: "center" },
    pressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
    actionOverlay: {
      position: "absolute",
      inset: 0,
      zIndex: 30,
      elevation: 30,
      justifyContent: "flex-end",
    },
    actionBackdrop: {
      position: "absolute",
      inset: 0,
      backgroundColor: theme.colors.overlay,
    },
    actionSheet: {
      width: "100%",
      maxHeight: "84%",
      paddingTop: 8,
      paddingBottom: 22,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: 0,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.surface,
    },
    actionHandle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      marginBottom: 7,
      borderRadius: 2,
      backgroundColor: theme.colors.divider,
    },
    actionHeader: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
    },
    actionHeaderSpace: { width: 42 },
    actionIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
    },
    actionTitleGroup: { minWidth: 0, flex: 1, alignItems: "center" },
    actionTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
    actionPath: { color: theme.colors.mutedText, fontSize: 11, marginTop: 2 },
    actionError: {
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderRadius: 12,
      color: theme.colors.warningText,
      backgroundColor: theme.colors.warningSurface,
      fontSize: 12,
    },
    actionList: { paddingHorizontal: 12, paddingBottom: 4 },
    actionScroll: { maxHeight: 390 },
    actionRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 8,
      borderRadius: 15,
    },
    actionRowPressed: { backgroundColor: theme.colors.surfaceMuted },
    actionRowIcon: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: theme.colors.accentSoft,
    },
    actionRowIconDanger: { backgroundColor: theme.colors.warningSurface },
    actionRowText: { flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    actionRowTextDanger: { color: theme.colors.error },
    actionDivider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 8,
      marginVertical: 5,
      backgroundColor: theme.colors.divider,
    },
    actionForm: { gap: 12, paddingHorizontal: 18, paddingBottom: 6 },
    actionPrompt: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 8,
      paddingTop: 3,
    },
    actionInput: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
      fontSize: 16,
    },
    actionPrimary: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
    },
    actionPrimaryText: { color: theme.colors.canvas, fontSize: 15, fontWeight: "700" },
    actionEmpty: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 20,
      paddingHorizontal: 10,
      paddingVertical: 18,
    },
    deletePanel: { alignItems: "center", paddingHorizontal: 22, paddingBottom: 6 },
    deleteIcon: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.warningSurface,
    },
    deleteTitle: {
      marginTop: 14,
      color: theme.colors.text,
      fontSize: 19,
      fontWeight: "700",
    },
    deleteCopy: {
      marginTop: 7,
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    deleteActions: { width: "100%", flexDirection: "row", gap: 10, marginTop: 20 },
    deleteCancel: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
    },
    deleteCancelText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    deleteConfirm: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: theme.colors.error,
    },
    deleteConfirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  });
}
