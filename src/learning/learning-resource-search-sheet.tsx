import { ChevronRight, FileText, Search, Video, Volume2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppSafeArea } from "../app/app-safe-area";
import type { Theme } from "../app/theme";
import { useReducedMotion } from "../app/use-reduced-motion";
import { searchLearningResources } from "./learning-resource-search";
import type { LearningResource } from "./learning-types";

type Props = Readonly<{
  visible: boolean;
  resources: readonly LearningResource[];
  theme: Theme;
  onClose: () => void;
  onOpenResource: (resource: LearningResource) => void;
}>;

export function LearningResourceSearchSheet({
  visible,
  resources,
  theme,
  onClose,
  onOpenResource,
}: Props) {
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLearningResources(resources, query), [query, resources]);

  function close() {
    setQuery("");
    onClose();
  }

  function openResource(resource: LearningResource) {
    close();
    onOpenResource(resource);
  }

  return (
    <Modal animationType={reduceMotion ? "none" : "slide"} onRequestClose={close} visible={visible}>
      <AppSafeArea style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LIBRARY SEARCH</Text>
            <Text style={styles.title}>搜索导入的文件</Text>
          </View>
          <Pressable
            accessibilityLabel="关闭资料搜索"
            accessibilityRole="button"
            onPress={close}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <X color={theme.colors.text} size={22} />
          </Pressable>
        </View>

        <View style={styles.searchLane}>
          <Search color={theme.colors.mutedText} size={20} />
          <TextInput
            accessibilityLabel="搜索导入的文件"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={setQuery}
            placeholder="搜索标题、正文或字幕"
            placeholderTextColor={theme.colors.mutedText}
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel="清除搜索"
              accessibilityRole="button"
              onPress={() => setQuery("")}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <X color={theme.colors.mutedText} size={17} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>{query.trim() ? "搜索结果" : "最近的文件"}</Text>
          <Text style={styles.resultCount}>{results.length} 个</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.results}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {results.map((resource) => (
            <ResourceResult
              key={resource.id}
              resource={resource}
              theme={theme}
              styles={styles}
              onPress={() => openResource(resource)}
            />
          ))}
          {results.length === 0 ? (
            <View style={styles.empty}>
              <Search color={theme.colors.mutedText} size={24} />
              <Text style={styles.emptyTitle}>没有找到匹配的文件</Text>
              <Text style={styles.emptyCopy}>试试标题、正文里的词，或字幕内容。</Text>
            </View>
          ) : null}
        </ScrollView>
      </AppSafeArea>
    </Modal>
  );
}

function ResourceResult({
  resource,
  theme,
  styles,
  onPress,
}: Readonly<{
  resource: LearningResource;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}>) {
  const Icon =
    resource.mediaKind === "video" || resource.mediaKind === "youtube"
      ? Video
      : resource.mediaKind === "audio"
        ? Volume2
        : FileText;
  const kind =
    resource.mediaKind === "video" || resource.mediaKind === "youtube"
      ? "视频"
      : resource.mediaKind === "audio"
        ? "音频"
        : "文本";

  return (
    <Pressable
      accessibilityLabel={`打开 ${resource.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.result, pressed && styles.pressed]}
    >
      <View style={styles.resultIcon}>
        <Icon color={theme.colors.accent} size={19} />
      </View>
      <View style={styles.resultCopy}>
        <Text numberOfLines={1} style={styles.resourceTitle}>
          {resource.title}
        </Text>
        <Text numberOfLines={1} style={styles.resourceMeta}>
          {kind} · {resource.sentences.length} 句 · {resource.language || "未设置语言"}
        </Text>
      </View>
      <ChevronRight color={theme.colors.mutedText} size={18} />
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.colors.background },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 17,
      paddingTop: 10,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.1,
    },
    title: {
      color: theme.colors.text,
      fontSize: 27,
      fontWeight: "600",
      letterSpacing: -0.7,
      marginTop: 4,
    },
    closeButton: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 999,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    searchLane: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      gap: 10,
      marginHorizontal: 20,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    input: { color: theme.colors.text, flex: 1, fontSize: 15, minHeight: 48, minWidth: 0 },
    clearButton: {
      alignItems: "center",
      backgroundColor: theme.colors.canvas,
      borderRadius: 999,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    resultHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 9,
      paddingTop: 22,
    },
    resultTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
    resultCount: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "700" },
    results: { paddingBottom: 32, paddingHorizontal: 20 },
    result: {
      alignItems: "center",
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      paddingVertical: 10,
    },
    resultIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 18,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    resultCopy: { flex: 1, gap: 4, minWidth: 0 },
    resourceTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    resourceMeta: { color: theme.colors.mutedText, fontSize: 12 },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 16,
      gap: 7,
      marginTop: 12,
      padding: 28,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600", marginTop: 3 },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 12, textAlign: "center" },
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  });
}
