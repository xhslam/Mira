import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Clipboard from "expo-clipboard";
import {
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  Leaf,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Target,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react-native";
import type { Theme } from "../app/theme";
import type { VocabularyCard } from "./enjoy-player-domain";
import {
  filterAndSortMemories,
  filterAndSortPhrases,
  setPhraseMastery,
  togglePhraseFavorite,
  type MemorySort,
  type PhraseFilter,
  type PhraseSort,
  updateMemory,
  updatePhraseCard,
} from "./phrase-memory-domain";
import type { LearningMemory, LearningMemoryCategory, LearningSnapshot } from "./learning-types";
import { upsertPhraseCard } from "./phrase-recognition";

type LibraryTab = "phrases" | "memories";
type ActionTarget =
  Readonly<{ kind: "phrase"; id: string }> | Readonly<{ kind: "memory"; id: string }>;

type Props = Readonly<{
  snapshot: LearningSnapshot;
  onChange: (next: LearningSnapshot) => void;
  onClose: () => void;
  theme: Theme;
}>;

const PHRASE_SORT_LABELS: Readonly<Record<PhraseSort, string>> = Object.freeze({
  newest: "最新添加",
  oldest: "最早添加",
  recentEncounter: "最近遇到",
  frequency: "出现最多",
  alphabetical: "A → Z",
});

const MEMORY_SORT_LABELS: Readonly<Record<MemorySort, string>> = Object.freeze({
  newest: "最新添加",
  oldest: "最早添加",
  updated: "最近更新",
});

const MEMORY_CATEGORY_LABELS: Readonly<Record<LearningMemoryCategory, string>> = Object.freeze({
  preference: "偏好",
  goal: "学习目标",
  weakness: "薄弱点",
  learning: "学习信息",
  other: "其他",
});

export function PhraseMemoryScreen({ snapshot, onChange, onClose, theme }: Props) {
  const styles = useMemo(() => stylesFor(theme), [theme]);
  const [tab, setTab] = useState<LibraryTab>("phrases");
  const [query, setQuery] = useState("");
  const [phraseSort, setPhraseSort] = useState<PhraseSort>("newest");
  const [memorySort, setMemorySort] = useState<MemorySort>("newest");
  const [phraseFilter, setPhraseFilter] = useState<PhraseFilter>("all");
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPhrase = snapshot.vocabulary.find((item) => item.id === selectedPhraseId) ?? null;
  const selectedMemory = snapshot.memories.find((item) => item.id === selectedMemoryId) ?? null;
  const phrases = useMemo(
    () =>
      filterAndSortPhrases(snapshot.vocabulary, { query, sort: phraseSort, filter: phraseFilter }),
    [phraseFilter, phraseSort, query, snapshot.vocabulary],
  );
  const memories = useMemo(
    () => filterAndSortMemories(snapshot.memories, { query, sort: memorySort }),
    [memorySort, query, snapshot.memories],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedPhraseId) {
        setSelectedPhraseId(null);
        return true;
      }
      if (selectedMemoryId) {
        setSelectedMemoryId(null);
        return true;
      }
      if (composerVisible || sortVisible || filterVisible || actionTarget) {
        setComposerVisible(false);
        setSortVisible(false);
        setFilterVisible(false);
        setActionTarget(null);
        return true;
      }
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [
    actionTarget,
    composerVisible,
    filterVisible,
    onClose,
    selectedMemoryId,
    selectedPhraseId,
    sortVisible,
  ]);

  function persist(next: LearningSnapshot) {
    onChange(Object.freeze(next));
  }

  function toggleFavorite(id: string) {
    const card = snapshot.vocabulary.find((item) => item.id === id);
    if (!card) return;
    const next = togglePhraseFavorite(card, new Date().toISOString());
    persist(
      Object.freeze({
        ...snapshot,
        vocabulary: Object.freeze(
          snapshot.vocabulary.map((item) => (item.id === id ? next : item)),
        ),
      }),
    );
  }

  function setMastery(id: string, status: "learning" | "mastered") {
    const card = snapshot.vocabulary.find((item) => item.id === id);
    if (!card) return;
    const next = setPhraseMastery(card, status, new Date().toISOString());
    persist(
      Object.freeze({
        ...snapshot,
        vocabulary: Object.freeze(
          snapshot.vocabulary.map((item) => (item.id === id ? next : item)),
        ),
      }),
    );
    setActionTarget(null);
  }

  function deletePhrase(id: string) {
    Alert.alert("确定删除这个短语吗？", "删除后无法恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          persist(
            Object.freeze({
              ...snapshot,
              vocabulary: Object.freeze(snapshot.vocabulary.filter((item) => item.id !== id)),
            }),
          );
          setSelectedPhraseId(null);
          setActionTarget(null);
        },
      },
    ]);
  }

  function deleteMemory(id: string) {
    Alert.alert("确定删除这条记忆吗？", "删除后无法恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          persist(
            Object.freeze({
              ...snapshot,
              memories: Object.freeze(snapshot.memories.filter((item) => item.id !== id)),
            }),
          );
          setSelectedMemoryId(null);
          setActionTarget(null);
        },
      },
    ]);
  }

  function savePhrase(
    values: Readonly<{ term: string; definition: string; context: string; notes: string }>,
  ) {
    const now = new Date().toISOString();
    if (selectedPhrase) {
      const result = updatePhraseCard(
        snapshot.vocabulary,
        selectedPhrase.id,
        {
          term: values.term,
          definition: values.definition,
          notes: values.notes,
          masteryStatus: selectedPhrase.masteryStatus ?? "learning",
        },
        now,
      );
      if (result.error === "duplicate") {
        setNotice("已存在相同的短语");
        return;
      }
      persist(Object.freeze({ ...snapshot, vocabulary: result.cards }));
      setComposerVisible(false);
      return;
    }
    const result = upsertPhraseCard(
      snapshot.vocabulary,
      {
        displayText: values.term,
        canonicalText: values.term,
        confidence: 1,
        context: values.context.trim() || "用户手动保存的表达。",
        phraseType: "manual",
        definition: values.definition.trim() || "待补充释义",
      },
      now,
      { manual: true },
    );
    const card = result.cards[0];
    const updated = card
      ? Object.freeze({
          ...card,
          ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
          sourceType: "manual" as const,
          masteryStatus: "learning" as const,
        })
      : null;
    persist(
      Object.freeze({
        ...snapshot,
        vocabulary: Object.freeze(
          result.cards.map((item, index) => (index === 0 && updated ? updated : item)),
        ),
      }),
    );
    setComposerVisible(false);
  }

  function saveMemory(
    values: Readonly<{
      text: string;
      category: LearningMemoryCategory | null;
      tags: readonly string[];
      notes: string;
    }>,
  ) {
    const now = new Date().toISOString();
    if (selectedMemory) {
      persist(
        Object.freeze({
          ...snapshot,
          memories: updateMemory(snapshot.memories, selectedMemory.id, values, now),
        }),
      );
      setComposerVisible(false);
      return;
    }
    const text = values.text.trim();
    if (!text) return;
    const memory: LearningMemory = Object.freeze({
      id: `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      category: values.category,
      tags: Object.freeze([...new Set(values.tags.map((item) => item.trim()).filter(Boolean))]),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      sourceType: "user",
      createdAt: now,
      updatedAt: now,
    });
    persist(
      Object.freeze({ ...snapshot, memories: Object.freeze([memory, ...snapshot.memories]) }),
    );
    setComposerVisible(false);
  }

  function openEditPhrase(id: string) {
    setSelectedPhraseId(id);
    setActionTarget(null);
    setComposerVisible(true);
  }

  function openEditMemory(id: string) {
    setSelectedMemoryId(id);
    setActionTarget(null);
    setComposerVisible(true);
  }

  if (selectedPhrase && !composerVisible) {
    return (
      <PhraseDetail
        card={selectedPhrase}
        onBack={() => setSelectedPhraseId(null)}
        onEdit={() => setComposerVisible(true)}
        onDelete={() => deletePhrase(selectedPhrase.id)}
        onToggleFavorite={() => toggleFavorite(selectedPhrase.id)}
        onSetMastery={(status) => setMastery(selectedPhrase.id, status)}
        styles={styles}
        theme={theme}
      />
    );
  }

  const isPhraseTab = tab === "phrases";
  const listData = isPhraseTab ? phrases : memories;
  const countLabel = query.trim()
    ? `找到 ${listData.length} 条结果`
    : isPhraseTab
      ? `${snapshot.vocabulary.length} 个短语`
      : `${snapshot.memories.length} 条记忆`;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="返回个人资料"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.iconButton}
        >
          <ArrowLeft color={theme.colors.text} size={22} />
        </Pressable>
        <Text style={styles.title}>短语与记忆</Text>
        <Pressable
          accessibilityLabel={isPhraseTab ? "添加短语" : "添加记忆"}
          accessibilityRole="button"
          onPress={() => {
            setSelectedPhraseId(null);
            setSelectedMemoryId(null);
            setComposerVisible(true);
          }}
          style={styles.iconButton}
        >
          <Plus color={theme.colors.text} size={21} />
        </Pressable>
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: isPhraseTab }}
          onPress={() => {
            setTab("phrases");
            setQuery("");
          }}
          style={[styles.tab, isPhraseTab && styles.tabActive]}
        >
          <Text style={[styles.tabText, isPhraseTab && styles.tabTextActive]}>短语</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: !isPhraseTab }}
          onPress={() => {
            setTab("memories");
            setQuery("");
          }}
          style={[styles.tab, !isPhraseTab && styles.tabActive]}
        >
          <Text style={[styles.tabText, !isPhraseTab && styles.tabTextActive]}>记忆</Text>
        </Pressable>
      </View>

      <FlatList<VocabularyCard | LearningMemory>
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Search color={theme.colors.mutedText} size={18} />
                <TextInput
                  accessibilityLabel={isPhraseTab ? "搜索短语" : "搜索记忆"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setQuery}
                  placeholder={isPhraseTab ? "搜索短语" : "搜索记忆"}
                  placeholderTextColor={theme.colors.mutedText}
                  style={styles.searchInput}
                  value={query}
                />
              </View>
              {isPhraseTab ? (
                <Pressable
                  accessibilityLabel="筛选短语"
                  accessibilityRole="button"
                  onPress={() => setFilterVisible(true)}
                  style={[styles.filterButton, phraseFilter !== "all" && styles.filterButtonActive]}
                >
                  <SlidersHorizontal
                    color={phraseFilter === "all" ? theme.colors.mutedText : theme.colors.accent}
                    size={18}
                  />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.toolbar}>
              <Text style={styles.listCount}>{countLabel}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSortVisible(true)}
                style={styles.sortButton}
              >
                <Text style={styles.sortText}>
                  {isPhraseTab ? PHRASE_SORT_LABELS[phraseSort] : MEMORY_SORT_LABELS[memorySort]}
                </Text>
                <ChevronDown color={theme.colors.mutedText} size={15} />
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title={query.trim() ? "没有找到匹配内容" : isPhraseTab ? "还没有短语" : "还没有记忆"}
            copy={
              isPhraseTab
                ? "你在视频、阅读、对话或英语练习中遇到的有用表达会出现在这里。"
                : "随着你使用 Auris，Nia 可以逐渐记住对学习真正有帮助的信息。"
            }
            onAdd={() => {
              setSelectedPhraseId(null);
              setSelectedMemoryId(null);
              setComposerVisible(true);
            }}
            styles={styles}
          />
        }
        renderItem={({ item }) =>
          isPhraseTab ? (
            <PhraseCard
              card={item as VocabularyCard}
              onOpen={() => setSelectedPhraseId(item.id)}
              onFavorite={() => toggleFavorite(item.id)}
              onMenu={() => setActionTarget({ kind: "phrase", id: item.id })}
              styles={styles}
              theme={theme}
            />
          ) : (
            <MemoryCard
              memory={item as LearningMemory}
              onOpen={() => setSelectedMemoryId(item.id)}
              onMenu={() => setActionTarget({ kind: "memory", id: item.id })}
              styles={styles}
              theme={theme}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {selectedMemory ? (
        <MemoryDetailSheet
          memory={selectedMemory}
          onClose={() => setSelectedMemoryId(null)}
          onEdit={() => setComposerVisible(true)}
          onDelete={() => deleteMemory(selectedMemory.id)}
          styles={styles}
          theme={theme}
        />
      ) : null}
      {composerVisible ? (
        <ComposerModal
          visible
          mode={
            selectedPhrase
              ? "editPhrase"
              : selectedMemory
                ? "editMemory"
                : isPhraseTab
                  ? "addPhrase"
                  : "addMemory"
          }
          phrase={selectedPhrase}
          memory={selectedMemory}
          onClose={() => setComposerVisible(false)}
          onSavePhrase={savePhrase}
          onSaveMemory={saveMemory}
          styles={styles}
          theme={theme}
        />
      ) : null}
      <SelectionModal
        visible={sortVisible}
        title="排序方式"
        options={
          isPhraseTab
            ? (Object.keys(PHRASE_SORT_LABELS) as PhraseSort[]).map((value) => ({
                value,
                label: PHRASE_SORT_LABELS[value],
              }))
            : (Object.keys(MEMORY_SORT_LABELS) as MemorySort[]).map((value) => ({
                value,
                label: MEMORY_SORT_LABELS[value],
              }))
        }
        selected={isPhraseTab ? phraseSort : memorySort}
        onClose={() => setSortVisible(false)}
        onSelect={(value) => {
          if (isPhraseTab) setPhraseSort(value as PhraseSort);
          else setMemorySort(value as MemorySort);
          setSortVisible(false);
        }}
        styles={styles}
        theme={theme}
      />
      <SelectionModal
        visible={filterVisible}
        title="筛选短语"
        options={[
          { value: "all", label: "全部" },
          { value: "learning", label: "正在学习" },
          { value: "mastered", label: "已掌握" },
          { value: "favorites", label: "收藏" },
        ]}
        selected={phraseFilter}
        onClose={() => setFilterVisible(false)}
        onSelect={(value) => {
          setPhraseFilter(value as PhraseFilter);
          setFilterVisible(false);
        }}
        styles={styles}
        theme={theme}
      />
      <ActionMenu
        target={actionTarget}
        phrase={
          actionTarget?.kind === "phrase"
            ? (snapshot.vocabulary.find((item) => item.id === actionTarget.id) ?? null)
            : null
        }
        onClose={() => setActionTarget(null)}
        onEdit={() => {
          if (!actionTarget) return;
          if (actionTarget.kind === "phrase") openEditPhrase(actionTarget.id);
          else openEditMemory(actionTarget.id);
        }}
        onFavorite={() => {
          if (actionTarget?.kind === "phrase") toggleFavorite(actionTarget.id);
          setActionTarget(null);
        }}
        onMastery={() => {
          if (actionTarget?.kind === "phrase")
            setMastery(
              actionTarget.id,
              (snapshot.vocabulary.find((item) => item.id === actionTarget.id)?.masteryStatus ??
                "learning") === "mastered"
                ? "learning"
                : "mastered",
            );
        }}
        onDelete={() => {
          if (actionTarget?.kind === "phrase") deletePhrase(actionTarget.id);
          else if (actionTarget?.kind === "memory") deleteMemory(actionTarget.id);
        }}
        styles={styles}
        theme={theme}
      />
      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={styles.toast}>
          <Text style={styles.toastText}>{notice}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PhraseCard({
  card,
  onOpen,
  onFavorite,
  onMenu,
  styles,
  theme,
}: Readonly<{
  card: VocabularyCard;
  onOpen: () => void;
  onFavorite: () => void;
  onMenu: () => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.phraseTerm}>{card.term}</Text>
          <View style={styles.cardActions}>
            <Pressable
              accessibilityLabel={card.isFavorite ? "取消收藏" : "收藏"}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onFavorite}
            >
              <Star
                color={card.isFavorite ? theme.colors.accent : theme.colors.mutedText}
                fill={card.isFavorite ? theme.colors.accent : "transparent"}
                size={18}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="短语操作"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onMenu}
            >
              <Ellipsis color={theme.colors.mutedText} size={19} />
            </Pressable>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.phraseMeaning}>
          {card.translation ?? card.definition}
        </Text>
        <Text numberOfLines={1} style={styles.context}>
          {card.context}
        </Text>
        <Text style={styles.meta}>
          {sourceLabel(card)} · {formatDate(card.createdAt)}
        </Text>
      </Pressable>
    </View>
  );
}

function MemoryCard({
  memory,
  onOpen,
  onMenu,
  styles,
  theme,
}: Readonly<{
  memory: LearningMemory;
  onOpen: () => void;
  onMenu: () => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  const Icon =
    memory.category === "goal" ? Target : memory.category === "weakness" ? TriangleAlert : Leaf;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.memoryCardPressable, pressed && styles.pressed]}
      >
        <View style={styles.memoryIcon}>
          <Icon color={theme.colors.accent} size={21} />
        </View>
        <View style={styles.memoryCopy}>
          <Text numberOfLines={2} style={styles.memoryText}>
            {memory.text}
          </Text>
          <Text numberOfLines={1} style={styles.memoryMeta}>
            {memory.category ? MEMORY_CATEGORY_LABELS[memory.category] : "学习信息"}
            {memory.tags.length ? ` · ${memory.tags.join(" · ")}` : ""}
          </Text>
          <Text style={styles.meta}>{formatDate(memory.createdAt)}</Text>
        </View>
        <Pressable
          accessibilityLabel="记忆操作"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onMenu}
        >
          <Ellipsis color={theme.colors.mutedText} size={19} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function PhraseDetail({
  card,
  onBack,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSetMastery,
  styles,
  theme,
}: Readonly<{
  card: VocabularyCard;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onSetMastery: (status: "learning" | "mastered") => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  const [copied, setCopied] = useState(false);
  return (
    <ScrollView
      contentContainerStyle={styles.detailContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel="返回短语列表"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.iconButton}
        >
          <ArrowLeft color={theme.colors.text} size={22} />
        </Pressable>
        <Text style={styles.detailTitle}>短语详情</Text>
        <Pressable
          accessibilityLabel="编辑短语"
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.iconButton}
        >
          <Ellipsis color={theme.colors.text} size={21} />
        </Pressable>
      </View>
      <View style={styles.heroRow}>
        <View>
          <Text style={styles.detailTerm}>{card.term}</Text>
          <Text style={styles.detailMeaning}>{card.translation ?? card.definition}</Text>
        </View>
        <Pressable
          accessibilityLabel={card.isFavorite ? "取消收藏" : "收藏"}
          accessibilityRole="button"
          onPress={onToggleFavorite}
          style={styles.heroFavorite}
        >
          <Star
            color={card.isFavorite ? theme.colors.accent : theme.colors.mutedText}
            fill={card.isFavorite ? theme.colors.accent : "transparent"}
            size={25}
          />
        </Pressable>
      </View>
      <DetailSection
        title="原始上下文"
        action={
          <Pressable
            accessibilityLabel="复制原始上下文"
            accessibilityRole="button"
            onPress={() => {
              void Clipboard.setStringAsync(card.context).then(() => setCopied(true));
            }}
          >
            <Copy color={theme.colors.mutedText} size={18} />
          </Pressable>
        }
        styles={styles}
      >
        <Text style={styles.detailBody}>{card.context}</Text>
        {copied ? <Text style={styles.copyNotice}>已复制</Text> : null}
      </DetailSection>
      <DetailSection title="解释" styles={styles}>
        <Text style={styles.detailBody}>{card.definition}</Text>
        {card.notes ? <Text style={styles.detailNote}>{card.notes}</Text> : null}
      </DetailSection>
      <DetailSection title="来源" styles={styles}>
        <Text style={styles.detailBody}>
          {sourceLabel(card)} · {formatDate(card.createdAt)}
        </Text>
      </DetailSection>
      <DetailSection title="掌握状态" styles={styles}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onSetMastery(
              (card.masteryStatus ?? "learning") === "mastered" ? "learning" : "mastered",
            )
          }
          style={styles.statusChip}
        >
          <Text style={styles.statusChipText}>
            {(card.masteryStatus ?? "learning") === "mastered" ? "已掌握" : "正在学习"}
          </Text>
        </Pressable>
      </DetailSection>
      <View style={styles.detailActions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>编辑</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteButton}>
          <Trash2 color={theme.colors.danger} size={16} />
          <Text style={styles.deleteText}>删除</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function MemoryDetailSheet({
  memory,
  onClose,
  onEdit,
  onDelete,
  styles,
  theme,
}: Readonly<{
  memory: LearningMemory;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>记忆详情</Text>
            <Pressable
              accessibilityLabel="关闭记忆详情"
              accessibilityRole="button"
              onPress={onClose}
            >
              <X color={theme.colors.mutedText} size={20} />
            </Pressable>
          </View>
          <Text style={styles.memoryDetail}>{memory.text}</Text>
          <DetailSection title="分类" styles={styles}>
            <Text style={styles.detailBody}>
              {memory.category ? MEMORY_CATEGORY_LABELS[memory.category] : "学习信息"}
            </Text>
          </DetailSection>
          <DetailSection title="标签" styles={styles}>
            <Text style={styles.detailBody}>{memory.tags.join(" · ") || "暂无标签"}</Text>
          </DetailSection>
          <DetailSection title="更新时间" styles={styles}>
            <Text style={styles.detailBody}>{formatDate(memory.updatedAt)}</Text>
          </DetailSection>
          <View style={styles.detailActions}>
            <Pressable accessibilityRole="button" onPress={onEdit} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>编辑</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteButton}>
              <Trash2 color={theme.colors.danger} size={16} />
              <Text style={styles.deleteText}>删除</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ComposerModal({
  visible,
  mode,
  phrase,
  memory,
  onClose,
  onSavePhrase,
  onSaveMemory,
  styles,
  theme,
}: Readonly<{
  visible: boolean;
  mode: "addPhrase" | "editPhrase" | "addMemory" | "editMemory";
  phrase: VocabularyCard | null;
  memory: LearningMemory | null;
  onClose: () => void;
  onSavePhrase: (
    values: Readonly<{ term: string; definition: string; context: string; notes: string }>,
  ) => void;
  onSaveMemory: (
    values: Readonly<{
      text: string;
      category: LearningMemoryCategory | null;
      tags: readonly string[];
      notes: string;
    }>,
  ) => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  const phraseMode = mode === "addPhrase" || mode === "editPhrase";
  const [term, setTerm] = useState(phraseMode ? (phrase?.term ?? "") : (memory?.text ?? ""));
  const [definition, setDefinition] = useState(
    phraseMode ? (phrase?.translation ?? phrase?.definition ?? "") : "",
  );
  const [context, setContext] = useState(phraseMode ? (phrase?.context ?? "") : "");
  const [notes, setNotes] = useState(phraseMode ? (phrase?.notes ?? "") : (memory?.notes ?? ""));
  const [category, setCategory] = useState<LearningMemoryCategory | null>(memory?.category ?? null);
  const [tags, setTags] = useState(memory?.tags.join("，") ?? "");
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {phraseMode
                ? mode === "editPhrase"
                  ? "编辑短语"
                  : "添加短语"
                : mode === "editMemory"
                  ? "编辑记忆"
                  : "添加记忆"}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <X color={theme.colors.mutedText} size={20} />
            </Pressable>
          </View>
          {phraseMode ? (
            <>
              <Field
                label="短语 *"
                value={term}
                onChange={setTerm}
                placeholder="例如：figure out"
                styles={styles}
                theme={theme}
                english
              />
              <Field
                label="中文解释"
                value={definition}
                onChange={setDefinition}
                placeholder="例如：弄清楚；想明白"
                styles={styles}
                theme={theme}
              />
              <Field
                label="例句"
                value={context}
                onChange={setContext}
                placeholder="输入原始上下文（可选）"
                styles={styles}
                theme={theme}
              />
              <Field
                label="备注"
                value={notes}
                onChange={setNotes}
                placeholder="备注（可选）"
                styles={styles}
                theme={theme}
              />
            </>
          ) : (
            <>
              <Field
                label="内容 *"
                value={term}
                onChange={setTerm}
                placeholder="例如：用户更喜欢自然的美式表达"
                styles={styles}
                theme={theme}
                multiline
              />
              <CategoryPicker
                value={category}
                onChange={setCategory}
                styles={styles}
                theme={theme}
              />
              <Field
                label="标签"
                value={tags}
                onChange={setTags}
                placeholder="用逗号分隔（可选）"
                styles={styles}
                theme={theme}
              />
              <Field
                label="备注"
                value={notes}
                onChange={setNotes}
                placeholder="备注（可选）"
                styles={styles}
                theme={theme}
              />
            </>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (phraseMode) onSavePhrase({ term, definition, context, notes });
              else onSaveMemory({ text: term, category, tags: tags.split(/[,，]/u), notes });
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>保存</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  styles,
  theme,
  multiline = false,
  english = false,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
  multiline?: boolean;
  english?: boolean;
}>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={english ? "none" : "sentences"}
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedText}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function CategoryPicker({
  value,
  onChange,
  styles,
  theme,
}: Readonly<{
  value: LearningMemoryCategory | null;
  onChange: (value: LearningMemoryCategory) => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>分类</Text>
      <View style={styles.categoryRow}>
        {(Object.keys(MEMORY_CATEGORY_LABELS) as LearningMemoryCategory[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => onChange(item)}
            style={[styles.categoryChip, value === item && styles.categoryChipActive]}
          >
            <Text
              style={[styles.categoryChipText, value === item && { color: theme.colors.accent }]}
            >
              {MEMORY_CATEGORY_LABELS[item]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SelectionModal({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
  styles,
  theme,
}: Readonly<{
  visible: boolean;
  title: string;
  options: readonly Readonly<{ value: string; label: string }>[];
  selected: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.selectionMenu}>
          <Text style={styles.menuTitle}>{title}</Text>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => onSelect(option.value)}
              style={styles.menuRow}
            >
              <Text style={styles.menuText}>{option.label}</Text>
              {selected === option.value ? <Check color={theme.colors.accent} size={18} /> : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function ActionMenu({
  target,
  phrase,
  onClose,
  onEdit,
  onFavorite,
  onMastery,
  onDelete,
  styles,
  theme,
}: Readonly<{
  target: ActionTarget | null;
  phrase: VocabularyCard | null;
  onClose: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onMastery: () => void;
  onDelete: () => void;
  styles: ReturnType<typeof stylesFor>;
  theme: Theme;
}>) {
  return (
    <Modal transparent animationType="fade" visible={target !== null} onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.selectionMenu}>
          <Text style={styles.menuTitle}>
            {target?.kind === "phrase" ? "短语操作" : "记忆操作"}
          </Text>
          <Pressable accessibilityRole="button" onPress={onEdit} style={styles.menuRow}>
            <Text style={styles.menuText}>编辑</Text>
          </Pressable>
          {target?.kind === "phrase" ? (
            <>
              <Pressable accessibilityRole="button" onPress={onFavorite} style={styles.menuRow}>
                <Text style={styles.menuText}>{phrase?.isFavorite ? "取消收藏" : "收藏"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onMastery} style={styles.menuRow}>
                <Text style={styles.menuText}>
                  {(phrase?.masteryStatus ?? "learning") === "mastered"
                    ? "标记为学习中"
                    : "标记为已掌握"}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onDelete} style={styles.menuRow}>
            <Text style={[styles.menuText, { color: theme.colors.danger }]}>删除</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function EmptyState({
  title,
  copy,
  onAdd,
  styles,
}: Readonly<{
  title: string;
  copy: string;
  onAdd: () => void;
  styles: ReturnType<typeof stylesFor>;
}>) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
      <Pressable accessibilityRole="button" onPress={onAdd} style={styles.emptyAction}>
        <Text style={styles.emptyActionText}>添加</Text>
      </Pressable>
    </View>
  );
}

function DetailSection({
  title,
  action,
  children,
  styles,
}: Readonly<{
  title: string;
  action?: ReactNode;
  children: ReactNode;
  styles: ReturnType<typeof stylesFor>;
}>) {
  return (
    <View style={styles.detailSection}>
      <View style={styles.detailSectionHeader}>
        <Text style={styles.detailLabel}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function sourceLabel(card: VocabularyCard): string {
  if (card.sourceType === "video") return "视频";
  if (card.sourceType === "conversation") return "对话";
  if (card.sourceType === "reading") return "阅读";
  return card.sourceResourceId ? "学习材料" : "手动添加";
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN").replaceAll("/", "/");
}

function stylesFor(theme: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.colors.canvas, flex: 1 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    iconButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
    title: { color: theme.colors.text, fontSize: 23, fontWeight: "700" },
    tabs: {
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-around",
      marginHorizontal: 20,
      marginTop: 12,
    },
    tab: { alignItems: "center", flex: 1, paddingBottom: 12 },
    tabActive: { borderBottomColor: theme.colors.accent, borderBottomWidth: 2 },
    tabText: { color: theme.colors.mutedText, fontSize: 15, fontWeight: "600" },
    tabTextActive: { color: theme.colors.accent },
    listContent: { flexGrow: 1, padding: 20, paddingBottom: 42 },
    searchRow: { flexDirection: "row", gap: 10 },
    searchBox: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
    },
    searchInput: { color: theme.colors.text, flex: 1, fontSize: 14, paddingVertical: 11 },
    filterButton: {
      alignItems: "center",
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: "center",
      width: 46,
    },
    filterButtonActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    toolbar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 15,
    },
    listCount: { color: theme.colors.mutedText, fontSize: 13 },
    sortButton: { alignItems: "center", flexDirection: "row", gap: 2 },
    sortText: { color: theme.colors.mutedText, fontSize: 12 },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 10,
      overflow: "hidden",
    },
    cardPressable: { gap: 7, padding: 15 },
    cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    cardActions: { alignItems: "center", flexDirection: "row", gap: 13 },
    phraseTerm: { color: theme.colors.accent, flex: 1, fontSize: 19, fontWeight: "700" },
    phraseMeaning: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    context: { color: theme.colors.mutedText, fontSize: 13, fontStyle: "italic" },
    meta: { color: theme.colors.mutedText, fontSize: 11, marginTop: 3 },
    memoryCardPressable: { alignItems: "flex-start", flexDirection: "row", gap: 12, padding: 15 },
    memoryIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    memoryCopy: { flex: 1, gap: 6 },
    memoryText: { color: theme.colors.text, fontSize: 16, fontWeight: "700", lineHeight: 22 },
    memoryDetail: { color: theme.colors.text, fontSize: 21, fontWeight: "700", lineHeight: 30 },
    memoryMeta: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" },
    empty: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 16,
      gap: 8,
      marginTop: 18,
      padding: 28,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
    emptyCopy: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20, textAlign: "center" },
    emptyAction: {
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 9,
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    emptyActionText: { color: theme.colors.accent, fontSize: 13, fontWeight: "700" },
    detailContent: {
      backgroundColor: theme.colors.canvas,
      gap: 17,
      minHeight: "100%",
      padding: 20,
      paddingBottom: 42,
    },
    detailHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    detailTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700" },
    heroRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
    },
    detailTerm: { color: theme.colors.accent, fontSize: 32, fontWeight: "700" },
    detailMeaning: { color: theme.colors.text, fontSize: 17, fontWeight: "600", marginTop: 8 },
    heroFavorite: { padding: 6 },
    detailSection: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.divider,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 9,
      padding: 14,
    },
    detailSectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    detailLabel: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    detailBody: { color: theme.colors.text, fontSize: 14, lineHeight: 22 },
    detailNote: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    copyNotice: { color: theme.colors.success, fontSize: 12 },
    statusChip: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 99,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    statusChipText: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
    detailActions: { flexDirection: "row", gap: 10, marginTop: 4 },
    secondaryButton: {
      alignItems: "center",
      borderColor: theme.colors.divider,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      flex: 1,
      padding: 12,
    },
    secondaryButtonText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
    deleteButton: {
      alignItems: "center",
      borderColor: theme.colors.danger,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      padding: 12,
    },
    deleteText: { color: theme.colors.danger, fontSize: 14, fontWeight: "700" },
    sheetBackdrop: { backgroundColor: "rgba(0,0,0,0.32)", flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: theme.colors.canvas,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      gap: 14,
      maxHeight: "85%",
      padding: 20,
      paddingBottom: 30,
    },
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: theme.colors.divider,
      borderRadius: 99,
      height: 4,
      width: 40,
    },
    sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    sheetTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
    field: { gap: 7 },
    fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
    input: {
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.text,
      fontSize: 14,
      padding: 11,
    },
    multilineInput: { minHeight: 74, textAlignVertical: "top" },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: 11,
      marginTop: 4,
      padding: 13,
    },
    primaryButtonText: { color: theme.colors.canvas, fontSize: 14, fontWeight: "700" },
    categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    categoryChip: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    categoryChipActive: { backgroundColor: theme.colors.accentSoft },
    categoryChipText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "600" },
    menuBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.18)",
      flex: 1,
      justifyContent: "center",
      padding: 28,
    },
    selectionMenu: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      maxWidth: 340,
      padding: 8,
      width: "100%",
    },
    menuTitle: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontWeight: "700",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    menuRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 13,
    },
    menuText: { color: theme.colors.text, fontSize: 15 },
    toast: {
      alignSelf: "center",
      backgroundColor: theme.colors.text,
      borderRadius: 99,
      bottom: 30,
      paddingHorizontal: 14,
      paddingVertical: 9,
      position: "absolute",
    },
    toastText: { color: theme.colors.canvas, fontSize: 12 },
    pressed: { opacity: 0.74 },
  });
}
