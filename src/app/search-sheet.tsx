import { Clock3, FileSearch, FileText, History, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SearchResult, SearchScope } from "../search/search-index";
import type { WorkspaceSearch } from "../search/workspace-search";
import type { SearchQueryRecord } from "../phase6/phase6-store";
import { AppSafeArea } from "./app-safe-area";
import type { TranslationKey } from "./i18n";
import { useTranslate } from "./locale";
import { useTheme, type Theme } from "./theme";
import { IconButton } from "./workspace-header";
import { useReducedMotion } from "./use-reduced-motion";

const SCOPES: readonly Readonly<{ id: SearchScope; key: TranslationKey }>[] = Object.freeze([
  Object.freeze({ id: "all", key: "search.scopeAll" }),
  Object.freeze({ id: "filename", key: "search.scopeFiles" }),
  Object.freeze({ id: "content", key: "search.scopeContent" }),
  Object.freeze({ id: "history", key: "search.scopeHistory" }),
]);

const GROUPS: readonly SearchResult["kind"][] = Object.freeze([
  "file",
  "content",
  "history",
  "recent",
]);

const GROUP_KEYS: Readonly<Record<SearchResult["kind"], TranslationKey>> = Object.freeze({
  file: "search.groupFiles",
  content: "search.groupContent",
  history: "search.groupHistory",
  recent: "search.groupRecent",
});

export function SearchSheet({
  visible,
  search,
  onClose,
  onSelect,
}: Readonly<{
  visible: boolean;
  search: WorkspaceSearch;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}>) {
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      visible={visible}
    >
      <AppSafeArea>
        <WorkspaceSearchView onClose={onClose} onSelect={onSelect} search={search} />
      </AppSafeArea>
    </Modal>
  );
}

export function WorkspaceSearchView({
  search,
  onClose,
  onSelect,
}: Readonly<{
  search: WorkspaceSearch;
  onClose?: () => void;
  onSelect: (result: SearchResult) => void;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [results, setResults] = useState<readonly SearchResult[]>(Object.freeze([]));
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [recentQueries, setRecentQueries] = useState<readonly SearchQueryRecord[]>(
    Object.freeze([]),
  );

  useEffect(() => {
    let active = true;
    void search.recentQueries().then((items) => {
      if (active) setRecentQueries(items);
    });
    return () => {
      active = false;
    };
  }, [search]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let active = true;
    const timer = setTimeout(() => {
      setStatus("loading");
      void search
        .search(normalized, scope)
        .then((response) => {
          if (!active) return;
          setResults(response.results);
          setStatus("ready");
        })
        .catch(() => {
          if (active) setStatus("error");
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, scope, search]);

  const grouped = useMemo(
    () =>
      query.trim().length === 0
        ? Object.freeze([])
        : GROUPS.map((kind) =>
            Object.freeze({
              kind,
              results: results.filter((result) => result.kind === kind),
            }),
          ).filter((group) => group.results.length > 0),
    [query, results],
  );

  return (
    <View style={styles.sheet}>
      <View style={styles.searchLane}>
        <Search color={theme.colors.mutedText} size={20} />
        <TextInput
          accessibilityLabel={t("search.label")}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setQuery(value);
            if (!value.trim()) {
              setResults(Object.freeze([]));
              setStatus("idle");
            }
          }}
          placeholder={t("search.placeholder")}
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          value={query}
        />
        {status === "loading" ? (
          <ActivityIndicator color={theme.colors.accent} size="small" />
        ) : null}
        {onClose ? (
          <IconButton label={t("search.close")} onPress={onClose}>
            <X color={theme.colors.text} size={21} />
          </IconButton>
        ) : null}
      </View>
      <View
        accessibilityLabel={t("search.scope")}
        accessibilityRole="tablist"
        style={styles.scopes}
      >
        {SCOPES.map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === item.id }}
            key={item.id}
            onPress={() => setScope(item.id)}
            style={[styles.scope, scope === item.id && styles.scopeSelected]}
          >
            <Text style={[styles.scopeText, scope === item.id && styles.scopeTextSelected]}>
              {t(item.key)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {status === "idle" && recentQueries.length > 0 ? (
          <View>
            <View style={styles.recentHeader}>
              <Text style={styles.groupLabel}>{t("search.recentSearches")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void search.clearRecentQueries().then(() => setRecentQueries(Object.freeze([])));
                }}
              >
                <Text style={styles.clearText}>{t("search.clear")}</Text>
              </Pressable>
            </View>
            {recentQueries.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={`${item.scope}:${item.query}`}
                onPress={() => {
                  setScope(item.scope);
                  setQuery(item.query);
                }}
                style={({ pressed }) => [styles.queryRow, pressed && styles.pressed]}
              >
                <Clock3 color={theme.colors.mutedText} size={17} />
                <Text numberOfLines={1} style={styles.filename}>
                  {item.query}
                </Text>
                <Text style={styles.queryScope}>{item.scope}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {grouped.map((group) => (
          <View key={group.kind}>
            <Text style={styles.groupLabel}>{t(GROUP_KEYS[group.kind])}</Text>
            {group.results.map((result) => (
              <SearchResultRow key={result.id} onPress={() => onSelect(result)} result={result} />
            ))}
          </View>
        ))}
        {status === "idle" && recentQueries.length === 0 ? (
          <Text style={styles.empty}>{t("search.enterTerm")}</Text>
        ) : null}
        {status === "ready" && results.length === 0 ? (
          <Text style={styles.empty}>{t("search.noResults")}</Text>
        ) : null}
        {status === "error" ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("search.unavailable")}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SearchResultRow({
  result,
  onPress,
}: Readonly<{ result: SearchResult; onPress: () => void }>) {
  const theme = useTheme();
  const t = useTranslate();
  const styles = createStyles(theme);
  const Icon =
    result.kind === "history"
      ? History
      : result.kind === "recent"
        ? Clock3
        : result.kind === "content"
          ? FileSearch
          : FileText;
  return (
    <Pressable
      accessibilityLabel={t("search.resultLabel", {
        group: t(GROUP_KEYS[result.kind]),
        title: result.title,
      })}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.result, pressed && styles.pressed]}
    >
      <Icon color={theme.colors.accent} size={18} />
      <View style={styles.resultText}>
        <Text numberOfLines={1} style={styles.filename}>
          {result.title}
        </Text>
        <Text numberOfLines={2} style={styles.snippet}>
          {result.line ? `${t("search.line", { line: result.line })} · ` : ""}
          {result.snippet || t("search.emptyNote")}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: { flex: 1, minHeight: 0, backgroundColor: theme.colors.background },
    searchLane: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 12,
      marginTop: 6,
      paddingHorizontal: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      backgroundColor: theme.colors.canvas,
      shadowColor: "#10131A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    input: { minWidth: 0, minHeight: 48, flex: 1, color: theme.colors.text, fontSize: 16 },
    scopes: {
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 12,
      paddingTop: 10,
    },
    scope: {
      minHeight: 36,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    scopeSelected: { backgroundColor: theme.colors.accentSoft },
    scopeText: { color: theme.colors.mutedText, fontSize: 13, fontWeight: "600" },
    scopeTextSelected: { color: theme.colors.accent },
    groupLabel: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 18,
      paddingBottom: 6,
      paddingTop: 16,
      textTransform: "uppercase",
    },
    recentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingRight: 18,
    },
    clearText: { color: theme.colors.accent, fontSize: 13, fontWeight: "600" },
    queryRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 18,
    },
    queryScope: {
      marginLeft: "auto",
      color: theme.colors.mutedText,
      fontSize: 12,
      textTransform: "capitalize",
    },
    result: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    resultText: { minWidth: 0, flex: 1 },
    filename: { color: theme.colors.text, fontSize: 15, fontWeight: "600" },
    snippet: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 3 },
    empty: { color: theme.colors.mutedText, fontSize: 15, padding: 20, textAlign: "center" },
    error: { color: theme.colors.error, fontSize: 14, lineHeight: 20, padding: 20 },
    pressed: { backgroundColor: theme.colors.accentSoft },
  });
}
