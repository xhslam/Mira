import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  buildStructuredTree,
  formatJsonPath,
  parseStructuredValue,
  type StructuredTree,
  type StructuredTreeNode,
} from "../formats/structured/tree";
import { useTheme, type Theme } from "./theme";

export function StructuredTreeView({
  content,
  parser,
  path,
}: Readonly<{ content: string; parser: "json" | "yaml" | "toml"; path: string }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const initialTree = useMemo(() => {
    try {
      return buildStructuredTree(
        parseStructuredValue(parser, content, /\.(jsonl|ndjson)$/i.test(path)),
      );
    } catch {
      return null;
    }
    // Content changes are handled by the debounced effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parser, path]);
  const identity = `${parser}:${path}`;
  const [preview, setPreview] = useState<
    Readonly<{ identity: string; tree: StructuredTree | null; parseError: boolean }>
  >(() => Object.freeze({ identity, tree: initialTree, parseError: initialTree === null }));
  const tree = preview.identity === identity ? preview.tree : initialTree;
  const parseError = preview.identity === identity ? preview.parseError : initialTree === null;

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        const nextTree = buildStructuredTree(
          parseStructuredValue(parser, content, /\.(jsonl|ndjson)$/i.test(path)),
        );
        setPreview(Object.freeze({ identity, tree: nextTree, parseError: false }));
      } catch {
        setPreview((current) =>
          Object.freeze({
            identity,
            tree: current.identity === identity ? current.tree : initialTree,
            parseError: true,
          }),
        );
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [content, identity, initialTree, parser, path]);

  if (tree === null) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.invalid}>
        <Text style={styles.invalidText}>
          This file has syntax errors; the tree is unavailable.
        </Text>
      </View>
    );
  }

  function toggle(path: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <View style={styles.container}>
      {parseError ? (
        <View accessibilityLiveRegion="polite" style={styles.staleNotice}>
          <Text style={styles.invalidText}>
            Showing the last valid tree while syntax is invalid.
          </Text>
        </View>
      ) : null}
      <ScrollView
        accessibilityLabel="Structured data tree"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <TreeRow collapsed={collapsed} depth={0} node={tree.root} onToggle={toggle} />
      </ScrollView>
    </View>
  );
}

function TreeRow({
  collapsed,
  depth,
  node,
  onToggle,
}: Readonly<{
  collapsed: ReadonlySet<string>;
  depth: number;
  node: StructuredTreeNode;
  onToggle: (path: string) => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const typeColors: Readonly<Record<string, string>> = Object.freeze({
    string: theme.colors.success,
    number: theme.colors.fileTypes.markdown,
    boolean: theme.colors.fileTypes.toml,
    null: theme.colors.mutedText,
    object: theme.colors.text,
    array: theme.colors.text,
  });
  const isCollapsed = collapsed.has(node.path);
  const hasChildren = node.children.length > 0;
  const isContainer = node.type === "object" || node.type === "array";

  return (
    <View>
      <Pressable
        accessibilityLabel={`${node.key}: ${node.type}`}
        accessibilityRole={hasChildren ? "button" : "text"}
        onPress={() => (hasChildren ? onToggle(node.path) : undefined)}
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: 8 + depth * 14 },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.chevron}>{hasChildren ? (isCollapsed ? "▸" : "▾") : " "}</Text>
        <Text numberOfLines={1} style={styles.key}>
          {node.key}
        </Text>
        {isContainer ? (
          <Text style={styles.count}>
            {node.childCount} {node.type === "array" ? "items" : "keys"}
          </Text>
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.value, { color: typeColors[node.type] ?? theme.colors.text }]}
          >
            {node.displayValue}
          </Text>
        )}
        <Text style={styles.path}>{formatJsonPath(node.path)}</Text>
      </Pressable>
      {hasChildren && !isCollapsed ? (
        node.children.map((child) => (
          <TreeRow
            collapsed={collapsed}
            depth={depth + 1}
            key={child.path}
            node={child}
            onToggle={onToggle}
          />
        ))
      ) : (
        <></>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.canvas,
    },
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.canvas,
    },
    content: {
      paddingVertical: 4,
    },
    row: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingRight: 12,
    },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    chevron: {
      width: 14,
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    key: {
      maxWidth: "32%",
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    count: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    value: {
      minWidth: 0,
      flex: 1,
      fontSize: 13,
    },
    path: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    invalid: {
      padding: 16,
      backgroundColor: theme.colors.warningSurface,
    },
    invalidText: {
      color: theme.colors.warningText,
      fontSize: 13,
      lineHeight: 18,
    },
    staleNotice: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.warningSurface,
    },
  });
}
