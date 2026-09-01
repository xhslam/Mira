import {
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Menu,
  Palette,
  Settings,
  X,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { FileEntry } from "../workspace/workspace-adapter";
import type { BrowserCommandResult } from "./browser-command";
import type { PrimaryTab } from "./app-shell-state";
import {
  isNoteFileEntry,
  noteFilesInFolder,
  noteFolderSummaries,
  noteMoveTargetPath,
  noteParentFolder,
} from "./note-file-management";
import { OverlaySideSheet } from "./overlay-side-sheet";
import { SidebarToggleIcon } from "./sidebar-toggle-icon";
import { useTheme, type Theme } from "./theme";

type GlobalSidebarProps = Readonly<{
  activeTab: PrimaryTab;
  activeFolder: string | null;
  canCreateFolder: boolean;
  canMoveFiles: boolean;
  entries: readonly FileEntry[];
  onChooseWorkspace: () => void;
  onClose: () => void;
  onCreateFolder: (path: string) => Promise<BrowserCommandResult>;
  onMoveFile: (entry: FileEntry, to: string) => Promise<BrowserCommandResult>;
  onOpenNote: (path: string) => Promise<boolean>;
  onOpenNotes: (folder: string | null) => void;
  onSelectTab: (tab: Exclude<PrimaryTab, "files">) => void;
  visible: boolean;
  workspaceName: string;
}>;

export function GlobalSidebar({
  activeTab,
  activeFolder,
  canCreateFolder,
  canMoveFiles,
  entries,
  onChooseWorkspace,
  onClose,
  onCreateFolder,
  onMoveFile,
  onOpenNote,
  onOpenNotes,
  onSelectTab,
  visible,
  workspaceName,
}: GlobalSidebarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const noteEntries = useMemo(() => entries.filter(isNoteFileEntry), [entries]);
  const folders = useMemo(() => noteFolderSummaries(entries), [entries]);
  const [expandedFolders, setExpandedFolders] = useState<readonly string[]>(() =>
    folders.map((folder) => folder.path),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderValue, setFolderValue] = useState("");
  const [organizeBusy, setOrganizeBusy] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | undefined>(undefined);
  const rootDropRef = useRef<View | null>(null);
  const folderDropRefs = useRef(new Map<string, View>());
  const dropZones = useRef<readonly Readonly<{ path: string; top: number; bottom: number }>[]>([]);

  function toggleFolder(path: string): void {
    setExpandedFolders((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : Object.freeze([...current, path]),
    );
  }

  async function createFolder(): Promise<void> {
    const value = folderValue.normalize("NFC").trim();
    if (!value || organizeBusy) {
      if (!value) setOrganizeError("请输入文件夹名称。");
      return;
    }
    setOrganizeBusy(true);
    setOrganizeError(null);
    try {
      const result = await onCreateFolder(value);
      if (!result.ok) {
        setOrganizeError(result.error ?? "文件夹没有创建成功。");
        return;
      }
      setCreatingFolder(false);
      setFolderValue("");
      setExpandedFolders((current) =>
        current.includes(value) ? current : Object.freeze([...current, value]),
      );
    } catch {
      setOrganizeError("文件夹没有创建成功。");
    } finally {
      setOrganizeBusy(false);
    }
  }

  function measureDropZones(): void {
    const next: Readonly<{ path: string; top: number; bottom: number }>[] = [];
    const measure = (path: string, node: View | null) => {
      node?.measureInWindow((_x, y, _width, height) => {
        next.push(Object.freeze({ path, top: y, bottom: y + height }));
        dropZones.current = Object.freeze([...next]);
      });
    };
    measure("", rootDropRef.current);
    for (const [path, node] of folderDropRefs.current) measure(path, node);
  }

  function targetAt(pageY: number, entry: FileEntry): string | undefined {
    const zone = dropZones.current.find((item) => pageY >= item.top && pageY <= item.bottom);
    if (!zone) return undefined;
    const folder = zone.path || null;
    return noteParentFolder(entry.path) === folder ? undefined : zone.path;
  }

  function startDrag(entry: FileEntry): void {
    if (!canMoveFiles || organizeBusy) return;
    measureDropZones();
    setDraggingPath(entry.path);
    setDragTarget(undefined);
    setOrganizeError(null);
  }

  function moveDrag(entry: FileEntry, pageY: number): void {
    setDragTarget(targetAt(pageY, entry));
  }

  async function finishDrag(entry: FileEntry, pageY: number): Promise<void> {
    const targetFolder = targetAt(pageY, entry);
    setDraggingPath(null);
    setDragTarget(undefined);
    if (targetFolder === undefined) return;
    const target = noteMoveTargetPath(entry.path, targetFolder || null);
    if (!target.ok) return;
    setOrganizeBusy(true);
    setOrganizeError(null);
    try {
      const result = await onMoveFile(entry, target.path);
      if (!result.ok) setOrganizeError(result.error ?? "笔记没有移动成功。");
    } catch {
      setOrganizeError("笔记没有移动成功。");
    } finally {
      setOrganizeBusy(false);
    }
  }

  return (
    <OverlaySideSheet maxWidth={390} onClose={onClose} visible={visible} widthFraction={0.84}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="关闭全局侧边栏"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <SidebarToggleIcon color={theme.colors.text} expanded={visible} size={24} />
          </Pressable>
          <View style={styles.identity}>
            <Text numberOfLines={1} style={styles.appName}>
              MIRA
            </Text>
            <Text numberOfLines={1} style={styles.workspaceName}>
              {workspaceName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="打开设置"
            accessibilityRole="button"
            onPress={() => onSelectTab("settings")}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Settings color={theme.colors.text} size={23} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.primaryGroup}>
            <SidebarRow
              active={activeTab === "learn"}
              count={null}
              icon={BookOpen}
              label="学习"
              onPress={() => onSelectTab("learn")}
              styles={styles}
              theme={theme}
            />
            <View ref={rootDropRef} style={dragTarget === "" ? styles.dropTargetActive : undefined}>
              <SidebarRow
                active={activeTab === "files" && activeFolder === null}
                count={noteEntries.length}
                icon={FileText}
                label={draggingPath ? "移动到根目录" : "全部笔记"}
                onPress={() => onOpenNotes(null)}
                styles={styles}
                theme={theme}
              />
            </View>
            <SidebarRow
              active={activeTab === "ai"}
              count={null}
              icon={Bot}
              label="AI 助手"
              onPress={() => onSelectTab("ai")}
              styles={styles}
              theme={theme}
            />
            <SidebarRow
              active={activeTab === "drawings"}
              count={null}
              icon={Palette}
              label="画板"
              onPress={() => onSelectTab("drawings")}
              styles={styles}
              theme={theme}
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>文件夹</Text>
            <Text style={styles.sectionMeta}>{folders.length} 个</Text>
            {canCreateFolder ? (
              <Pressable
                accessibilityLabel="新建文件夹"
                onPress={() => {
                  setCreatingFolder(true);
                  setOrganizeError(null);
                }}
                style={({ pressed }) => [styles.folderAdd, pressed && styles.pressed]}
              >
                <FolderPlus color={theme.colors.accent} size={19} />
              </Pressable>
            ) : null}
          </View>
          {creatingFolder ? (
            <View style={styles.createFolderPanel}>
              <TextInput
                accessibilityLabel="文件夹名称"
                autoCapitalize="none"
                autoFocus
                onChangeText={setFolderValue}
                onSubmitEditing={() => void createFolder()}
                placeholder="例如：项目/九月"
                placeholderTextColor={theme.colors.mutedText}
                returnKeyType="done"
                style={styles.folderInput}
                value={folderValue}
              />
              <Pressable
                accessibilityLabel="取消创建文件夹"
                disabled={organizeBusy}
                onPress={() => {
                  Keyboard.dismiss();
                  setCreatingFolder(false);
                  setFolderValue("");
                  setOrganizeError(null);
                }}
                style={({ pressed }) => [styles.folderInputAction, pressed && styles.pressed]}
              >
                <X color={theme.colors.mutedText} size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel="确认创建文件夹"
                disabled={organizeBusy}
                onPress={() => void createFolder()}
                style={({ pressed }) => [styles.folderInputAction, pressed && styles.pressed]}
              >
                {organizeBusy ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <Check color={theme.colors.accent} size={19} />
                )}
              </Pressable>
            </View>
          ) : null}
          {draggingPath ? (
            <View style={styles.dragHint}>
              <GripVertical color={theme.colors.accent} size={16} />
              <Text numberOfLines={1} style={styles.dragHintText}>
                把纸片拖到目标文件夹
              </Text>
            </View>
          ) : null}
          {organizeError ? (
            <Text accessibilityRole="alert" style={styles.organizeError}>
              {organizeError}
            </Text>
          ) : null}
          {folders.length > 0 ? (
            folders.map((folder) => {
              const expanded = expandedFolders.includes(folder.path);
              const notes = noteFilesInFolder(entries, folder.path);
              return (
                <View key={folder.path}>
                  <View
                    ref={(node) => {
                      if (node) folderDropRefs.current.set(folder.path, node);
                      else folderDropRefs.current.delete(folder.path);
                    }}
                    style={[
                      styles.folderRowShell,
                      dragTarget === folder.path && styles.dropTargetActive,
                      { marginLeft: folder.depth * 11 },
                    ]}
                  >
                    <Pressable
                      accessibilityLabel={expanded ? "收起文件夹" : "展开文件夹"}
                      onPress={() => toggleFolder(folder.path)}
                      style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
                    >
                      {expanded ? (
                        <ChevronDown color={theme.colors.mutedText} size={17} />
                      ) : (
                        <ChevronRight color={theme.colors.mutedText} size={17} />
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onOpenNotes(folder.path)}
                      style={({ pressed }) => [
                        styles.folderRow,
                        activeTab === "files" &&
                          activeFolder === folder.path &&
                          styles.folderRowActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.folderMark} />
                      <Folder color={theme.colors.mutedText} size={19} />
                      <Text numberOfLines={1} style={styles.folderName}>
                        {folder.name}
                      </Text>
                      <Text style={styles.count}>{folder.count}</Text>
                    </Pressable>
                  </View>
                  {expanded
                    ? notes.map((entry) => (
                        <DraggableNoteRow
                          disabled={!canMoveFiles || organizeBusy}
                          dragging={draggingPath === entry.path}
                          entry={entry}
                          key={entry.path}
                          onDragEnd={(item, pageY) => void finishDrag(item, pageY)}
                          onDragMove={moveDrag}
                          onDragStart={startDrag}
                          onOpen={() => void onOpenNote(entry.path)}
                          styles={styles}
                          theme={theme}
                        />
                      ))
                    : null}
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>点击“文件夹 +”创建第一层整理空间。</Text>
          )}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={onChooseWorkspace}
          style={({ pressed }) => [styles.workspaceButton, pressed && styles.pressed]}
        >
          <Menu color={theme.colors.accent} size={19} />
          <Text style={styles.workspaceButtonText}>切换工作区</Text>
        </Pressable>
      </View>
    </OverlaySideSheet>
  );
}

function DraggableNoteRow({
  disabled,
  dragging,
  entry,
  onDragEnd,
  onDragMove,
  onDragStart,
  onOpen,
  styles,
  theme,
}: Readonly<{
  disabled: boolean;
  dragging: boolean;
  entry: FileEntry;
  onDragEnd: (entry: FileEntry, pageY: number) => void;
  onDragMove: (entry: FileEntry, pageY: number) => void;
  onDragStart: (entry: FileEntry) => void;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  const [pan] = useState(() => new Animated.ValueXY());
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => onDragStart(entry),
        onPanResponderMove: (_event, gesture) => {
          pan.setValue({ x: gesture.dx, y: gesture.dy });
          onDragMove(entry, gesture.moveY);
        },
        onPanResponderRelease: (_event, gesture) => {
          onDragEnd(entry, gesture.moveY);
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
        onPanResponderTerminate: () => {
          onDragEnd(entry, -1);
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
      }),
    [disabled, entry, onDragEnd, onDragMove, onDragStart, pan],
  );

  return (
    <Animated.View
      style={[
        styles.noteFileRow,
        dragging && styles.noteFileDragging,
        { transform: pan.getTranslateTransform() },
      ]}
    >
      <Pressable
        accessibilityLabel={`打开笔记 ${entry.name}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.noteFileMain, pressed && styles.pressed]}
      >
        <FileText color={theme.colors.accent} size={16} />
        <Text numberOfLines={1} style={styles.noteFileName}>
          {entry.name.replace(/\.(?:md|markdown|mdown|mkd)$/iu, "")}
        </Text>
      </Pressable>
      <View
        accessibilityLabel={`拖动 ${entry.name} 到其他文件夹`}
        accessibilityRole="button"
        style={[styles.dragHandle, disabled && styles.dragHandleDisabled]}
        {...panResponder.panHandlers}
      >
        <GripVertical color={theme.colors.mutedText} size={18} />
      </View>
    </Animated.View>
  );
}

function SidebarRow({
  active,
  count,
  icon: Icon,
  label,
  onPress,
  styles,
  theme,
}: Readonly<{
  active: boolean;
  count: number | null;
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>>;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryRow,
        active && styles.primaryRowActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.primaryIcon, active && styles.primaryIconActive]}>
        <Icon color={active ? theme.colors.text : theme.colors.mutedText} size={21} />
      </View>
      <Text style={[styles.primaryLabel, active && styles.primaryLabelActive]}>{label}</Text>
      {count === null ? null : <Text style={styles.count}>{count}</Text>}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: {
      flex: 1,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.colors.divider,
      backgroundColor: theme.colors.surface,
    },
    header: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    identity: { minWidth: 0, flex: 1 },
    appName: { color: theme.colors.text, fontSize: 17, fontWeight: "800", letterSpacing: 0.8 },
    workspaceName: { color: theme.colors.mutedText, fontSize: 11, marginTop: 2 },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.medium,
    },
    content: { flexGrow: 1, padding: 12, paddingBottom: 24 },
    primaryGroup: { gap: 4 },
    primaryRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 10,
      borderRadius: 14,
    },
    primaryRowActive: { backgroundColor: theme.colors.accentSoft },
    primaryIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceMuted,
    },
    primaryIconActive: { backgroundColor: "rgba(10, 132, 255, 0.2)" },
    primaryLabel: {
      minWidth: 0,
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600",
    },
    primaryLabelActive: { color: theme.colors.text, fontWeight: "700" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 28,
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    sectionTitle: { flex: 1, color: theme.colors.mutedText, fontSize: 14, fontWeight: "700" },
    sectionMeta: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
    folderAdd: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      marginRight: -5,
      borderRadius: 12,
      backgroundColor: theme.colors.accentSoft,
    },
    createFolderPanel: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: 8,
      paddingLeft: 10,
      paddingRight: 4,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: 16,
      backgroundColor: theme.colors.background,
    },
    folderInput: {
      minWidth: 0,
      flex: 1,
      color: theme.colors.text,
      fontSize: 14,
      paddingVertical: 9,
    },
    folderInputAction: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    dragHint: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginBottom: 6,
      paddingHorizontal: 11,
      borderRadius: 12,
      backgroundColor: theme.colors.accentSoft,
    },
    dragHintText: { minWidth: 0, flex: 1, color: theme.colors.accent, fontSize: 12 },
    organizeError: {
      marginBottom: 7,
      padding: 9,
      borderRadius: 10,
      color: theme.colors.warningText,
      backgroundColor: theme.colors.warningSurface,
      fontSize: 11,
      lineHeight: 16,
    },
    folderRowShell: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
    },
    disclosure: {
      width: 35,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    folderRow: {
      minWidth: 0,
      minHeight: 52,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingLeft: 2,
      paddingRight: 9,
      borderRadius: 12,
    },
    folderRowActive: { backgroundColor: theme.colors.surfaceMuted },
    folderMark: { width: 4, height: 28, borderRadius: 2, backgroundColor: theme.colors.accent },
    folderName: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    count: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "600" },
    dropTargetActive: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    noteFileRow: {
      minHeight: 45,
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 47,
      marginRight: 4,
      marginBottom: 2,
      borderRadius: 13,
      backgroundColor: theme.colors.surfaceMuted,
    },
    noteFileDragging: {
      zIndex: 20,
      elevation: 12,
      opacity: 0.88,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.canvas,
      transform: [{ scale: 1.025 }],
    },
    noteFileMain: {
      minWidth: 0,
      minHeight: 45,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 11,
    },
    noteFileName: { minWidth: 0, flex: 1, color: theme.colors.text, fontSize: 13 },
    dragHandle: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
    },
    dragHandleDisabled: { opacity: 0.35 },
    empty: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 19, padding: 12 },
    workspaceButton: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    workspaceButtonText: { color: theme.colors.accent, fontSize: 14, fontWeight: "700" },
    pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  });
}
