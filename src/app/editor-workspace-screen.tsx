import { StyleSheet, Text, View } from "react-native";

import { theme } from "./theme";

export function EditorWorkspaceScreen() {
  return (
    <View style={styles.screen}>
      <View accessibilityRole="header" style={styles.filenameLane}>
        <View accessibilityElementsHidden importantForAccessibility="no" style={styles.fileMark} />
        <Text allowFontScaling maxFontSizeMultiplier={2} numberOfLines={1} style={styles.filename}>
          Untitled.md
        </Text>
      </View>
      <View accessibilityLabel="Editor" style={styles.canvas} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.background,
  },
  filenameLane: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.compact,
    paddingHorizontal: theme.spacing.standard,
    paddingVertical: theme.spacing.compact,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.background,
  },
  fileMark: {
    width: 4,
    height: 24,
    flexShrink: 0,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  filename: {
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  canvas: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.canvas,
  },
});
