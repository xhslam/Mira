import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BookmarkPlus, Check, Download, Link2, Plus, RotateCcw } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Theme } from "../app/theme";
import { reviewVocabularyCard, toAnkiCsv, type VocabularyRating } from "./enjoy-player-domain";
import {
  extractImportantPhrases,
  findRelatedVocabulary,
  type SuggestedPhrase,
} from "./learning-enrichment";
import type { LearningSnapshot } from "./learning-types";
import { upsertPhraseCard } from "./phrase-recognition";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  theme: Theme;
}>;

export function VocabularyScreen({ snapshot, onChange, theme }: Props) {
  const styles = useMemo(() => stylesFor(theme), [theme]);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const now = new Date();
  const due = snapshot.vocabulary.filter((card) => new Date(card.dueAt).getTime() <= now.getTime());
  const active =
    snapshot.vocabulary.find((card) => card.id === focusedId) ??
    due[0] ??
    snapshot.vocabulary[0] ??
    null;
  const suggestions = useMemo(() => {
    const saved = new Set(snapshot.vocabulary.map((card) => card.term.toLowerCase()));
    return extractImportantPhrases(
      snapshot.resources.flatMap((resource) => resource.sentences.map((sentence) => sentence.text)),
    )
      .filter((item) => !saved.has(item.phrase.toLowerCase()))
      .slice(0, 6);
  }, [snapshot.resources, snapshot.vocabulary]);
  const related = active
    ? findRelatedVocabulary(
        active.term,
        snapshot.vocabulary.filter((card) => card.id !== active.id),
      )
    : [];

  function addManual() {
    const phrase = term.trim();
    if (!phrase) return;
    const result = upsertPhraseCard(
      snapshot.vocabulary,
      {
        displayText: phrase,
        canonicalText: phrase,
        confidence: 1,
        context: "用户手动添加到我的短语。",
        phraseType: "manual",
        definition: meaning.trim() || "待补充释义",
      },
      new Date().toISOString(),
      { manual: true },
    );
    onChange(Object.freeze({ ...snapshot, vocabulary: result.cards }));
    setFocusedId(result.cards[0]?.id ?? null);
    setTerm("");
    setMeaning("");
  }

  function addCard(suggestion: SuggestedPhrase, definition = "从句子中识别的可复用表达。") {
    const result = upsertPhraseCard(
      snapshot.vocabulary,
      {
        displayText: suggestion.phrase,
        canonicalText: suggestion.phrase,
        confidence: suggestion.score,
        context: suggestion.context,
        phraseType: "manual",
        definition,
      },
      new Date().toISOString(),
      { manual: true },
    );
    onChange(Object.freeze({ ...snapshot, vocabulary: result.cards }));
    setFocusedId(result.cards[0]?.id ?? null);
  }

  function review(rating: VocabularyRating) {
    if (!active) return;
    const next = reviewVocabularyCard(active, rating, new Date());
    onChange(
      Object.freeze({
        ...snapshot,
        vocabulary: Object.freeze(
          snapshot.vocabulary.map((item) => (item.id === next.id ? next : item)),
        ),
      }),
    );
    setFocusedId(next.id);
  }

  async function exportAnki() {
    if (snapshot.vocabulary.length === 0) return;
    const file = new File(Paths.cache, `mira-phrases-${Date.now()}.csv`);
    file.write(toAnkiCsv(snapshot.vocabulary));
    await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "导出短语到 Anki" });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>记忆</Text>
        <Text style={styles.title}>记住你真正遇见过的表达</Text>
        <Text style={styles.copy}>
          单词和短语都带着出现时的原句。复习时，先回到当初听见它的地方。
        </Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{snapshot.vocabulary.length}</Text>
            <Text style={styles.statLabel}>已积累</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{due.length}</Text>
            <Text style={styles.statLabel}>待复习</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{suggestions.length}</Text>
            <Text style={styles.statLabel}>可收集</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View>
            <Text style={styles.cardTitle}>收一条新短语</Text>
            <Text style={styles.cardCopy}>可以从逐句页点词，也可以在这里手动补充。</Text>
          </View>
          <BookmarkPlus color={theme.colors.primary} size={20} />
        </View>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="例如：make sense of"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          returnKeyType="next"
        />
        <TextInput
          value={meaning}
          onChangeText={setMeaning}
          placeholder="释义或你自己的记忆提示（可选）"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={addManual}
        />
        <Pressable
          accessibilityRole="button"
          onPress={addManual}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Plus color="#FFFFFF" size={18} />
          <Text style={styles.primaryText}>加入短语本</Text>
        </Pressable>
      </View>

      {suggestions.length ? (
        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View>
              <Text style={styles.cardTitle}>值得收下的表达</Text>
              <Text style={styles.cardCopy}>来自你已经听过、读过的句子。</Text>
            </View>
            <BookmarkPlus color={theme.colors.primary} size={20} />
          </View>
          <View style={styles.suggestionList}>
            {suggestions.map((suggestion) => (
              <View key={suggestion.phrase} style={styles.suggestion}>
                <View style={styles.suggestionBody}>
                  <Text style={styles.suggestionTerm}>{suggestion.phrase}</Text>
                  <Text numberOfLines={1} style={styles.suggestionContext}>
                    {suggestion.context}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => addCard(suggestion)}
                  style={({ pressed }) => [styles.collectButton, pressed && styles.pressed]}
                >
                  <Text style={styles.collectText}>收藏</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {active ? (
        <View style={styles.card}>
          <Text style={styles.label}>
            {due.some((card) => card.id === active.id) ? "现在复习" : "当前短语"}
          </Text>
          <Text style={styles.activeTerm}>{active.term}</Text>
          <Text style={styles.definition}>{active.definition}</Text>
          {active.translation ? <Text style={styles.translation}>{active.translation}</Text> : null}
          <Text style={styles.context}>{active.context}</Text>
          <View style={styles.ratings}>
            <Pressable
              accessibilityRole="button"
              onPress={() => review("again")}
              style={({ pressed }) => [styles.again, pressed && styles.pressed]}
            >
              <RotateCcw color="#FFFFFF" size={16} />
              <Text style={styles.ratingText}>陌生</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => review("known")}
              style={({ pressed }) => [styles.known, pressed && styles.pressed]}
            >
              <Text style={styles.knownText}>认识</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => review("easy")}
              style={({ pressed }) => [styles.easy, pressed && styles.pressed]}
            >
              <Check color="#FFFFFF" size={16} />
              <Text style={styles.ratingText}>熟悉</Text>
            </Pressable>
          </View>
          <Text style={styles.reviewMeta}>
            下次复习：{new Date(active.dueAt).toLocaleDateString("zh-CN")} · 已复习{" "}
            {active.repetitions} 次
          </Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconContainer}>
            <BookmarkPlus color={theme.colors.mutedText} size={25} />
          </View>
          <Text style={styles.emptyTitle}>你的短语本还在等待第一条积累</Text>
          <Text style={styles.emptyCopy}>先在语料库导入几句英语，或从逐句页面点击单词开始。</Text>
        </View>
      )}

      {active && related.length ? (
        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View>
              <Text style={styles.cardTitle}>和「{active.term}」语境相近</Text>
              <Text style={styles.cardCopy}>来自共同的表达与出现语境。</Text>
            </View>
            <Link2 color={theme.colors.primary} size={20} />
          </View>
          <View style={styles.relatedList}>
            {related.map((card) => (
              <Pressable
                accessibilityRole="button"
                key={card.id}
                onPress={() => setFocusedId(card.id)}
                style={({ pressed }) => [styles.relatedItem, pressed && styles.pressed]}
              >
                <View style={styles.relatedText}>
                  <Text style={styles.relatedTerm}>{card.term}</Text>
                  <Text numberOfLines={1} style={styles.relatedContext}>
                    {card.context}
                  </Text>
                </View>
                <Text style={styles.openText}>查看</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {snapshot.vocabulary.length ? (
        <View style={styles.card}>
          <View style={styles.libraryHeading}>
            <Text style={styles.cardTitle}>我的全部短语</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void exportAnki()}
              style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
            >
              <Download color={theme.colors.text} size={16} />
              <Text style={styles.exportText}>导出 Anki</Text>
            </Pressable>
          </View>
          <View style={styles.allList}>
            {snapshot.vocabulary.map((card) => (
              <Pressable
                accessibilityRole="button"
                key={card.id}
                onPress={() => setFocusedId(card.id)}
                style={({ pressed }) => [
                  styles.allItem,
                  active?.id === card.id && styles.allItemSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.allText}>
                  <Text style={styles.allTerm}>{card.term}</Text>
                  <Text numberOfLines={1} style={styles.allDefinition}>
                    {card.definition}
                  </Text>
                </View>
                <Text style={styles.allMeta}>{card.repetitions} 次</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function stylesFor(theme: Theme) {
  return StyleSheet.create({
    content: {
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing["3xl"],
    },
    hero: {
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: 1,
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.lg,
    },
    kicker: { color: theme.colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
    title: { color: theme.colors.text, fontSize: 24, fontWeight: "700" },
    copy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    statRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    stat: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      flex: 1,
      gap: 2,
      padding: theme.spacing.sm,
    },
    statValue: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
    statLabel: { color: theme.colors.mutedText, fontSize: 11 },
    card: {
      borderBottomColor: theme.colors.borderSubtle,
      borderBottomWidth: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
    },
    cardHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: theme.spacing.md,
      justifyContent: "space-between",
    },
    cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
    cardCopy: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
      maxWidth: 300,
    },
    input: {
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      color: theme.colors.text,
      fontSize: 14,
      padding: theme.spacing.md,
    },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      gap: theme.spacing.sm,
      justifyContent: "center",
      minHeight: 44,
      padding: theme.spacing.md,
    },
    primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
    suggestionList: { gap: theme.spacing.sm },
    suggestion: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
    },
    suggestionBody: { flex: 1, gap: 3 },
    suggestionTerm: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    suggestionContext: { color: theme.colors.mutedText, fontSize: 11, fontStyle: "italic" },
    collectButton: {
      alignItems: "center",
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radius.sm,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    collectText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
    label: { color: theme.colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
    activeTerm: { color: theme.colors.text, fontSize: 28, fontWeight: "700" },
    definition: { color: theme.colors.text, fontSize: 15, fontWeight: "700", lineHeight: 21 },
    translation: { color: theme.colors.primary, fontSize: 13 },
    context: { color: theme.colors.mutedText, fontSize: 13, fontStyle: "italic", lineHeight: 19 },
    ratings: { flexDirection: "row", gap: theme.spacing.sm },
    again: {
      alignItems: "center",
      backgroundColor: theme.colors.danger,
      borderRadius: theme.radius.md,
      flex: 1,
      flexDirection: "row",
      gap: 5,
      justifyContent: "center",
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    known: {
      alignItems: "center",
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    easy: {
      alignItems: "center",
      backgroundColor: theme.colors.success,
      borderRadius: theme.radius.md,
      flex: 1,
      flexDirection: "row",
      gap: 5,
      justifyContent: "center",
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    ratingText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
    knownText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
    reviewMeta: { color: theme.colors.mutedText, fontSize: 11 },
    emptyCard: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      gap: theme.spacing.xs,
      padding: theme.spacing["2xl"],
    },
    emptyIconContainer: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.full,
      height: 56,
      justifyContent: "center",
      marginBottom: theme.spacing.xs,
      width: 56,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "600", textAlign: "center" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 12, lineHeight: 18, textAlign: "center" },
    relatedList: { gap: theme.spacing.sm },
    relatedItem: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      gap: theme.spacing.sm,
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    relatedText: { flex: 1, gap: 3 },
    relatedTerm: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    relatedContext: { color: theme.colors.mutedText, fontSize: 11 },
    openText: { color: theme.colors.primary, fontSize: 12, fontWeight: "600" },
    libraryHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    exportButton: {
      alignItems: "center",
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      minHeight: 44,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    exportText: { color: theme.colors.text, fontSize: 11, fontWeight: "600" },
    allList: { gap: theme.spacing.xs },
    allItem: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.md,
      flexDirection: "row",
      gap: theme.spacing.sm,
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    allItemSelected: { borderColor: theme.colors.primary, borderWidth: 1 },
    allText: { flex: 1, gap: 3 },
    allTerm: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
    allDefinition: { color: theme.colors.mutedText, fontSize: 11 },
    allMeta: { color: theme.colors.mutedText, fontSize: 10 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  });
}
