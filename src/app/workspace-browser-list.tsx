import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  MoreHorizontal,
  Star,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { FileEntry } from "../workspace/workspace-adapter";
import type { WorkspaceBrowserCapabilities } from "../workspace/workspace-browser";
import type { FileBrowserTreeNode } from "./file-browser-model";
import { useTranslate } from "./locale";
import { useTheme } from "./theme";
import { useWorkspaceDrawerStyles } from "./workspace-drawer-styles";
import { IconButton } from "./workspace-header";

type BrowserListProps = Readonly<{
  activePath: string | null;
  capabilities: WorkspaceBrowserCapabilities;
  favoritePaths: readonly string[];
  onOpen: (entry: FileEntry) => void;
  onAction: (entry: FileEntry) => void;
}>;

export function FlatFileList({
  entries,
  activePath,
  capabilities,
  favoritePaths,
  onOpen,
  onAction,
}: BrowserListProps & Readonly<{ entries: readonly FileEntry[] }>) {
  const styles = useWorkspaceDrawerStyles();
  const t = useTranslate();
  if (entries.length === 0) return <Text style={styles.empty}>{t("drawer.noMatchingFiles")}</Text>;
  return (
    <>
      {entries.map((entry) => (
        <BrowserEntryRow
          key={entry.path}
          active={entry.path === activePath}
          capabilities={capabilities}
          depth={0}
          entry={entry}
          favorite={favoritePaths.includes(entry.path)}
          onAction={onAction}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

export function BrowserTree({
  nodes,
  expandedPaths,
  activePath,
  capabilities,
  favoritePaths,
  onToggle,
  onOpen,
  onAction,
  depth = 0,
}: BrowserListProps &
  Readonly<{
    nodes: readonly FileBrowserTreeNode[];
    expandedPaths: readonly string[];
    onToggle: (path: string) => void;
    depth?: number;
  }>) {
  const styles = useWorkspaceDrawerStyles();
  const t = useTranslate();
  if (nodes.length === 0 && depth === 0) {
    return <Text style={styles.empty}>{t("drawer.noFiles")}</Text>;
  }
  return (
    <>
      {nodes.map((node) => {
        const expanded = expandedPaths.includes(node.path);
        return (
          <View key={node.path}>
            <BrowserEntryRow
              active={node.path === activePath}
              capabilities={capabilities}
              depth={depth}
              entry={node.entry}
              expanded={expanded}
              favorite={favoritePaths.includes(node.path)}
              onAction={onAction}
              onOpen={node.kind === "directory" ? () => onToggle(node.path) : onOpen}
            />
            {node.kind === "directory" && expanded ? (
              <BrowserTree
                activePath={activePath}
                capabilities={capabilities}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                favoritePaths={favoritePaths}
                nodes={node.children}
                onAction={onAction}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function BrowserEntryRow({
  entry,
  active,
  depth,
  expanded = false,
  capabilities,
  favorite,
  onOpen,
  onAction,
}: Readonly<{
  entry: FileEntry;
  active: boolean;
  depth: number;
  expanded?: boolean;
  capabilities: WorkspaceBrowserCapabilities;
  favorite: boolean;
  onOpen: (entry: FileEntry) => void;
  onAction: (entry: FileEntry) => void;
}>) {
  const theme = useTheme();
  const styles = useWorkspaceDrawerStyles();
  const actionable =
    entry.kind === "file" ||
    capabilities.renameDirectory ||
    capabilities.moveDirectory ||
    capabilities.copyDirectory ||
    capabilities.removeDirectory;
  const providerActionable =
    entry.kind === "file"
      ? capabilities.rename ||
        capabilities.move ||
        capabilities.copy ||
        capabilities.remove ||
        capabilities.share
      : capabilities.renameDirectory ||
        capabilities.moveDirectory ||
        capabilities.copyDirectory ||
        capabilities.removeDirectory;
  const EntryIcon = entry.kind === "directory" ? Folder : FileText;
  return (
    <View style={[styles.entryRow, active && styles.activeRow, { paddingLeft: 12 + depth * 16 }]}>
      <Pressable
        accessibilityRole="button"
        {...(actionable ? { onLongPress: () => onAction(entry) } : {})}
        onPress={() => onOpen(entry)}
        style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}
      >
        {entry.kind === "directory" ? (
          expanded ? (
            <ChevronDown color={theme.colors.mutedText} size={16} />
          ) : (
            <ChevronRight color={theme.colors.mutedText} size={16} />
          )
        ) : (
          <View style={styles.chevronSpace} />
        )}
        <EntryIcon
          color={entry.kind === "directory" ? theme.colors.mutedText : theme.colors.accent}
          size={18}
        />
        <View style={styles.entryText}>
          <Text numberOfLines={1} style={styles.rowText}>
            {entry.name}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {entry.path}
          </Text>
        </View>
      </Pressable>
      {actionable ? (
        <>
          {favorite ? <Star color={theme.colors.accent} size={15} /> : null}
          <IconButton
            label={`${providerActionable ? "Actions" : "Favorite options"} for ${entry.name}`}
            onPress={() => onAction(entry)}
          >
            <MoreHorizontal color={theme.colors.mutedText} size={19} />
          </IconButton>
        </>
      ) : null}
    </View>
  );
}
