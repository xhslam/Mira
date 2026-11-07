import { CircleMinus, FileText, Layers, Plus } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DocumentId } from "../domain/identifiers";
import { useTranslate } from "./locale";
import { MiraSheet } from "./mira-controls";
import { useTheme, type Theme } from "./theme";
import type { OpenWorkspaceDocument } from "./workspace-state";

type DocumentTabsProps = Readonly<{
  documents: readonly OpenWorkspaceDocument[];
  activeDocumentId: DocumentId;
  onSelect: (documentId: DocumentId) => void;
  onClose: (documentId: DocumentId) => void;
  onAdd: () => void;
  trailing?: ReactNode;
}>;

const activeTabWidth = 100;
const inactiveTabWidth = 76;
const actionWidth = 44;

export function DocumentTabs({
  documents,
  activeDocumentId,
  onSelect,
  onClose,
  onAdd,
  trailing,
}: DocumentTabsProps) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const [stackVisible, setStackVisible] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [groupWidth, setGroupWidth] = useState(0);
  const showStack =
    documents.length > 1 &&
    activeTabWidth + (documents.length - 1) * inactiveTabWidth + actionWidth > groupWidth;

  const scrollView = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const activeIndex = documents.findIndex((document) => document.documentId === activeDocumentId);

  useEffect(() => {
    if (activeIndex < 0 || viewportWidth === 0) return;
    const left = activeIndex * inactiveTabWidth;
    const right = left + activeTabWidth;
    if (left < scrollOffset.current || viewportWidth < activeTabWidth) {
      scrollView.current?.scrollTo({ x: left, animated: false });
    } else if (right > scrollOffset.current + viewportWidth) {
      scrollView.current?.scrollTo({ x: right - viewportWidth, animated: false });
    }
  }, [activeIndex, viewportWidth]);

  function renderDocument(document: OpenWorkspaceDocument, stacked: boolean) {
    const active = document.documentId === activeDocumentId;
    const path = document.path.replace(/\.md$/i, "");
    const name = path.split("/").at(-1) || t("tabs.untitled");
    return (
      <View
        key={document.documentId}
        style={[
          stacked ? styles.stackRow : styles.tab,
          active && (stacked ? styles.activeStackRow : styles.activeTab),
        ]}
      >
        <Pressable
          accessibilityLabel={path}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          onPress={() => {
            if (stacked) setStackVisible(false);
            onSelect(document.documentId);
          }}
          style={({ pressed }) => [
            styles.tabMain,
            stacked && styles.stackMain,
            pressed && styles.pressed,
          ]}
        >
          {stacked ? <FileText color={theme.colors.mutedText} size={16} /> : null}
          <View style={styles.tabCopy}>
            <View style={!stacked && active ? styles.tabUnderline : undefined}>
              <Text numberOfLines={1} style={[styles.tabText, active && styles.activeTabText]}>
                {name}
                {document.dirty ? " *" : ""}
              </Text>
              {!stacked && active ? <View style={styles.underline} /> : null}
            </View>
            {stacked && path !== name ? (
              <Text numberOfLines={1} style={styles.stackPath}>
                {path}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {stacked || active ? (
          <Pressable
            accessibilityLabel={t("tabs.closeNote", { name: path })}
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => onClose(document.documentId)}
            style={({ pressed }) => [
              styles.closeButton,
              stacked && styles.stackClose,
              pressed && styles.pressed,
            ]}
          >
            <CircleMinus color={theme.colors.mutedText} size={17} strokeWidth={1.7} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.lane}>
      <View
        onLayout={(event) => setGroupWidth(event.nativeEvent.layout.width)}
        style={styles.group}
      >
        <ScrollView
          ref={scrollView}
          contentContainerStyle={styles.tabs}
          horizontal
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.strip}
        >
          {documents.map((document) => renderDocument(document, false))}
        </ScrollView>
        {showStack ? (
          <Pressable
            accessibilityLabel={t("tabs.openNotesCount", { count: String(documents.length) })}
            accessibilityRole="button"
            accessibilityState={{ expanded: stackVisible }}
            onPress={() => setStackVisible(true)}
            style={({ pressed }) => [styles.action, styles.stackAction, pressed && styles.pressed]}
          >
            <Layers color={theme.colors.text} size={18} strokeWidth={1.8} />
            <Text style={styles.count}>{documents.length}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={t("tabs.newNote")}
          accessibilityRole="button"
          onPress={onAdd}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Plus color={theme.colors.text} size={20} />
        </Pressable>
      </View>
      {trailing}
      <MiraSheet
        onClose={() => setStackVisible(false)}
        title={t("tabs.openNotes")}
        visible={stackVisible}
      >
        {documents.map((document) => renderDocument(document, true))}
      </MiraSheet>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    lane: {
      minHeight: 46,
      paddingHorizontal: 12,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
    },
    group: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
    strip: { flexGrow: 0, flexShrink: 1, minWidth: 0 },
    tabs: { alignItems: "center" },
    tab: {
      width: inactiveTabWidth,
      flexShrink: 0,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
    },
    stackRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radius.medium,
    },
    tabMain: {
      minWidth: 0,
      minHeight: 44,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingLeft: 8,
      paddingRight: 2,
      justifyContent: "flex-start",
      borderRadius: theme.radius.small,
    },
    stackMain: { paddingLeft: 10 },
    activeTab: { width: activeTabWidth },
    activeStackRow: { backgroundColor: theme.colors.surfaceMuted },
    tabCopy: { flex: 1, minWidth: 0, gap: 2 },
    tabUnderline: { alignSelf: "flex-start", maxWidth: "100%" },
    tabText: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "500" },
    underline: {
      position: "absolute",
      bottom: -6,
      left: 0,
      right: 0,
      height: 1.5,
      backgroundColor: theme.colors.text,
    },
    activeTabText: { color: theme.colors.text },
    stackPath: { color: theme.colors.mutedText, fontSize: 12 },
    closeButton: {
      width: 34,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
    },
    stackClose: { width: actionWidth },
    action: {
      minWidth: actionWidth,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
    },
    stackAction: { flexDirection: "row", gap: 4, paddingHorizontal: 7 },
    count: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    pressed: { opacity: 0.7, backgroundColor: theme.colors.surface },
  });
}
