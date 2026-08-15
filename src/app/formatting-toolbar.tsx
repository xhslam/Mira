import {
  Brackets,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  Italic,
  Link,
  Languages,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Undo2,
  KeyboardOff,
} from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet } from "react-native";

import type { EditorCommandName } from "../editor-kernel/editor-kernel.dom";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";

const tools: readonly Readonly<{
  name: EditorCommandName;
  label: string;
  icon: React.ComponentType<Readonly<{ color?: string; size?: number }>>;
}>[] = Object.freeze([
  Object.freeze({ name: "undo", label: "Undo", icon: Undo2 }),
  Object.freeze({ name: "redo", label: "Redo", icon: Redo2 }),
  Object.freeze({ name: "bold", label: "Bold", icon: Bold }),
  Object.freeze({ name: "italic", label: "Italic", icon: Italic }),
  Object.freeze({ name: "strike", label: "Strikethrough", icon: Strikethrough }),
  Object.freeze({ name: "heading-1", label: "Heading 1", icon: Heading1 }),
  Object.freeze({ name: "heading-2", label: "Heading 2", icon: Heading2 }),
  Object.freeze({ name: "heading-3", label: "Heading 3", icon: Heading3 }),
  Object.freeze({ name: "heading-4", label: "Heading 4", icon: Heading4 }),
  Object.freeze({ name: "heading-5", label: "Heading 5", icon: Heading5 }),
  Object.freeze({ name: "heading-6", label: "Heading 6", icon: Heading6 }),
  Object.freeze({ name: "bullet-list", label: "Bullet list", icon: List }),
  Object.freeze({ name: "ordered-list", label: "Ordered list", icon: ListOrdered }),
  Object.freeze({ name: "task-list", label: "Task list", icon: ListChecks }),
  Object.freeze({ name: "quote", label: "Block quote", icon: Quote }),
  Object.freeze({ name: "code", label: "Inline code", icon: Code }),
  Object.freeze({ name: "code-block", label: "Code block", icon: FileCode2 }),
  Object.freeze({ name: "table", label: "Table", icon: Table2 }),
  Object.freeze({ name: "table-row-before", label: "Add row above", icon: BetweenVerticalStart }),
  Object.freeze({ name: "table-row-after", label: "Add row below", icon: BetweenVerticalEnd }),
  Object.freeze({ name: "table-row-delete", label: "Delete row", icon: TableRowsSplit }),
  Object.freeze({
    name: "table-column-before",
    label: "Add column before",
    icon: BetweenHorizontalStart,
  }),
  Object.freeze({
    name: "table-column-after",
    label: "Add column after",
    icon: BetweenHorizontalEnd,
  }),
  Object.freeze({ name: "table-column-delete", label: "Delete column", icon: TableColumnsSplit }),
  Object.freeze({ name: "table-delete", label: "Delete table", icon: Trash2 }),
  Object.freeze({ name: "link", label: "Link", icon: Link }),
  Object.freeze({ name: "wiki-link", label: "Wiki link", icon: Brackets }),
  Object.freeze({ name: "image", label: "Local image", icon: Image }),
  Object.freeze({ name: "format-cjk", label: "Format CJK spacing", icon: Languages }),
]);

export function FormattingToolbar({
  onCommand,
  onDismissKeyboard,
  onAi,
}: Readonly<{
  onCommand: (command: EditorCommandName) => void;
  onDismissKeyboard: () => void;
  onAi: () => void;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  return (
    <ScrollView
      accessibilityLabel={t("toolbar.title")}
      accessibilityRole="toolbar"
      contentContainerStyle={styles.content}
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={styles.toolbar}
    >
      <Pressable
        accessibilityLabel={t("toolbar.ai")}
        accessibilityRole="button"
        onPress={onAi}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Sparkles color={theme.colors.accent} size={20} />
      </Pressable>
      {tools.map((tool) => {
        const ToolIcon = tool.icon;
        return (
          <Pressable
            accessibilityLabel={tool.label}
            accessibilityRole="button"
            key={tool.name}
            onPress={() => onCommand(tool.name)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <ToolIcon color={theme.colors.text} size={20} />
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel={t("toolbar.hideKeyboard")}
        accessibilityRole="button"
        onPress={onDismissKeyboard}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <KeyboardOff color={theme.colors.text} size={20} />
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    toolbar: {
      flexGrow: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
    },
    content: {
      alignItems: "center",
      paddingHorizontal: 4,
    },
    button: {
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    pressed: {
      backgroundColor: theme.colors.surfaceMuted,
      opacity: 0.7,
    },
  });
}
