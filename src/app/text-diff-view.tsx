import { FlatList, StyleSheet, Text, View } from "react-native";

import { createTextDiff, type TextDiffKind } from "../formats/text-diff";
import { useTheme, type Theme } from "./theme";

type DiffRow = Readonly<{ id: string; kind: TextDiffKind; line: string }>;

export function TextDiffView({
  before,
  after,
}: Readonly<{ before: string | null; after: string }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  if (before === null) {
    return (
      <View accessibilityRole="alert" style={styles.empty}>
        <Text style={styles.emptyText}>
          The saved baseline is unavailable for this recovered draft.
        </Text>
      </View>
    );
  }
  const rows = createTextDiff(before, after).flatMap((segment, segmentIndex) =>
    segment.lines.map((line, lineIndex) =>
      Object.freeze({
        id: `${segmentIndex}:${lineIndex}`,
        kind: segment.kind,
        line,
      }),
    ),
  );
  return (
    <FlatList
      accessibilityLabel="Changes from the last saved version"
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <DiffLine row={item} />}
      style={styles.list}
    />
  );
}

function DiffLine({ row }: Readonly<{ row: DiffRow }>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const marker = row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " ";
  return (
    <View
      style={[
        styles.row,
        row.kind === "added" && styles.added,
        row.kind === "removed" && styles.removed,
      ]}
    >
      <Text style={styles.marker}>{marker}</Text>
      <Text selectable style={styles.line}>
        {row.line || " "}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: theme.colors.canvas },
    row: { minHeight: 28, flexDirection: "row", paddingHorizontal: 10, paddingVertical: 4 },
    added: { backgroundColor: theme.colors.successSoft },
    removed: { backgroundColor: theme.colors.dangerSoft },
    marker: { width: 20, color: theme.colors.mutedText, fontFamily: "monospace" },
    line: { flex: 1, color: theme.colors.text, fontFamily: "monospace", fontSize: 12 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    emptyText: { color: theme.colors.mutedText, textAlign: "center" },
  });
}
