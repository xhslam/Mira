import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";

import { createStructuredTable } from "../formats/structured/table";
import { useTheme, type Theme } from "./theme";

export function StructuredTableView({
  content,
  parser,
  path,
}: Readonly<{ content: string; parser: "json" | "yaml" | "toml"; path: string }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  let table;
  try {
    table = createStructuredTable(parser, content, /\.(jsonl|ndjson)$/i.test(path));
  } catch {
    table = null;
  }
  if (table === null) {
    return (
      <View accessibilityRole="alert" style={styles.empty}>
        <Text style={styles.emptyText}>
          Table view requires a valid root array containing objects. Source text is unchanged.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal style={styles.horizontal}>
      <View>
        <View accessibilityRole="header" style={styles.row}>
          {table.columns.map((column) => (
            <Text key={column} numberOfLines={1} style={[styles.cell, styles.heading]}>
              {column}
            </Text>
          ))}
        </View>
        <FlatList
          accessibilityLabel="Structured data table"
          data={table.rows}
          keyExtractor={(_item, index) => String(index)}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {table.columns.map((column) => (
                <Text key={column} numberOfLines={2} selectable style={styles.cell}>
                  {item[column]}
                </Text>
              ))}
            </View>
          )}
        />
        {table.truncated ? (
          <Text style={styles.notice}>Table truncated at safety limits.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    horizontal: { flex: 1, backgroundColor: theme.colors.canvas },
    row: {
      minHeight: 40,
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderSubtle,
    },
    cell: { width: 160, padding: 9, color: theme.colors.text, fontSize: 12 },
    heading: { fontWeight: "700", backgroundColor: theme.colors.surfaceMuted },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    emptyText: { color: theme.colors.mutedText, textAlign: "center" },
    notice: {
      padding: 10,
      color: theme.colors.warningText,
      backgroundColor: theme.colors.warningSurface,
    },
  });
}
