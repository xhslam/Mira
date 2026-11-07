import { useMemo, useState } from "react";
import {
  FileText,
  FolderOpen,
  Link,
  LockKeyhole,
  Plus,
  Subtitles,
  Volume2,
} from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { Theme } from "../app/theme";
import {
  discoverResourceKind,
  listDiscoverResources,
  type DiscoverResourceFilter,
} from "./discover-resources";
import { resourceProgress } from "./learning-session";
import type { LearningImportIntent, LearningResource, LearningSnapshot } from "./learning-types";

type Props = Readonly<{
  snapshot: LearningSnapshot;
  theme: Theme;
  onChange: (next: LearningSnapshot) => void;
  onOpenImport: () => void;
  onOpenResource: (resource: LearningResource) => void;
}>;

type LocalImportIntent = Exclude<LearningImportIntent, null>;

const FILTERS: readonly Readonly<{
  id: DiscoverResourceFilter;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ id: "all", label: "全部" }),
  Object.freeze({ id: "video", label: "视频" }),
  Object.freeze({ id: "audio", label: "音频" }),
  Object.freeze({ id: "text", label: "文字" }),
]);

export function DiscoverScreen({ snapshot, theme, onChange, onOpenImport, onOpenResource }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<DiscoverResourceFilter>("all");
  const resources = useMemo(
    () => listDiscoverResources(snapshot.resources, filter, 2),
    [filter, snapshot.resources],
  );

  function openLibrary(intent: LocalImportIntent) {
    onChange(
      Object.freeze({
        ...snapshot,
        ui: Object.freeze({ ...snapshot.ui, section: "library", importIntent: intent }),
      }),
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.intro}>
        <Text style={styles.heading}>选择下一段想听的内容</Text>
        <View accessibilityRole="tablist" style={styles.filters}>
          {FILTERS.map((item) => {
            const selected = item.id === filter;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setFilter(item.id)}
                style={({ pressed }) => [
                  styles.filter,
                  selected && styles.filterSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.materials}>
        {resources.length ? (
          resources.map((resource, index) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              progress={resourceProgress(snapshot, resource)}
              artworkIndex={index}
              styles={styles}
              onPress={() => onOpenResource(resource)}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {snapshot.resources.length ? "没有这一类学习材料" : "还没有学习材料"}
            </Text>
            <Text style={styles.emptyText}>
              {snapshot.resources.length
                ? "切换类型，或添加一段新的内容。"
                : "添加视频、音频或文字后，就能从这里直接开始学习。"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.importArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加学习材料"
          onPress={onOpenImport}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}
        >
          <View style={styles.primaryIcon}>
            <Plus color="#FFFFFF" size={24} strokeWidth={2.25} />
          </View>
          <Text style={styles.primaryActionText}>添加学习材料</Text>
        </Pressable>

        <View style={styles.shortcuts}>
          <ImportShortcut
            icon={Link}
            label="粘贴链接"
            onPress={() => openLibrary("url")}
            styles={styles}
            theme={theme}
          />
          <ImportShortcut
            icon={FolderOpen}
            label="本地文件"
            onPress={() => openLibrary("local")}
            styles={styles}
            theme={theme}
          />
          <ImportShortcut
            icon={Subtitles}
            label="导入字幕"
            onPress={() => openLibrary("subtitle")}
            styles={styles}
            theme={theme}
          />
        </View>

        <View style={styles.trustNote}>
          <LockKeyhole color={theme.colors.mutedText} size={14} strokeWidth={1.8} />
          <Text style={styles.trustText}>资料与字幕仅保存在本机</Text>
        </View>
      </View>
    </View>
  );
}

function ResourceCard(
  props: Readonly<{
    resource: LearningResource;
    progress: number;
    artworkIndex: number;
    styles: ReturnType<typeof createStyles>;
    onPress: () => void;
  }>,
) {
  const { resource, progress, artworkIndex, styles, onPress } = props;
  const kind = discoverResourceKind(resource);
  const kindLabel = kind === "video" ? "视频" : kind === "audio" ? "音频" : "文字";
  const state = progress > 0 ? `已完成 ${progress}%` : "未开始";
  const ArtworkIcon = kind === "audio" ? Volume2 : kind === "text" ? FileText : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${resource.title}，${kindLabel}，${resource.sentences.length} 句，${state}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.artwork}>
        {resource.thumbnailUri ? (
          <Image resizeMode="cover" source={{ uri: resource.thumbnailUri }} style={styles.image} />
        ) : (
          <DiscoverArtwork variant={artworkIndex % 2} />
        )}
        <View style={styles.artworkBadge}>
          {ArtworkIcon ? (
            <ArtworkIcon color="#FFFFFF" size={18} strokeWidth={2.1} />
          ) : (
            <View style={styles.smallPlay} />
          )}
        </View>
      </View>

      <View style={styles.cardCopy}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {resource.title}
        </Text>
        <Text numberOfLines={1} style={styles.cardMeta}>
          {kindLabel} · {resource.sentences.length} 句 · {state}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.playButton}>
        <View style={styles.playTriangle} />
      </View>
    </Pressable>
  );
}

function DiscoverArtwork({ variant }: Readonly<{ variant: number }>) {
  return (
    <Svg height="100%" viewBox="0 0 120 120" width="100%">
      <Defs>
        <LinearGradient id={`discover-sky-${variant}`} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={variant === 0 ? "#DDE9F3" : "#716DAF"} />
          <Stop offset="0.55" stopColor={variant === 0 ? "#91B8D2" : "#A67596"} />
          <Stop offset="1" stopColor={variant === 0 ? "#29567C" : "#152F55"} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#discover-sky-${variant})`} height="120" width="120" />
      {variant === 0 ? (
        <>
          <Path d="M0 76 L23 57 L39 67 L59 48 L78 65 L95 55 L120 73 V120 H0 Z" fill="#668FAF" />
          <Path d="M0 91 L28 69 L48 85 L72 63 L93 81 L120 66 V120 H0 Z" fill="#315E82" />
          <Path d="M0 104 L36 82 L63 99 L89 79 L120 96 V120 H0 Z" fill="#173B60" />
        </>
      ) : (
        <>
          <Path d="M0 73 Q28 68 61 74 T120 72 V120 H0 Z" fill="#26365D" />
          <Path d="M59 120 L63 78 H67 L74 120 Z" fill="#0C1830" />
          <Path d="M44 120 L57 83 H70 L86 120 Z" fill="#162542" />
          <Path d="M47 97 H83 M43 107 H89" stroke="#697293" strokeWidth="1.4" />
        </>
      )}
    </Svg>
  );
}

function ImportShortcut(
  props: Readonly<{
    icon: typeof Link;
    label: string;
    onPress: () => void;
    styles: ReturnType<typeof createStyles>;
    theme: Theme;
  }>,
) {
  const { icon: Icon, label, onPress, styles, theme } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <Icon color={theme.colors.primary} size={20} strokeWidth={1.9} />
      <Text numberOfLines={1} style={styles.shortcutText}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      gap: theme.spacing[6],
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[6],
    },
    intro: { gap: theme.spacing[4] },
    heading: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "700",
      letterSpacing: -0.5,
      lineHeight: 32,
    },
    filters: { flexDirection: "row", gap: theme.spacing[2] },
    filter: {
      alignItems: "center",
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 68,
      paddingHorizontal: theme.spacing[4],
    },
    filterSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterText: { color: theme.colors.mutedText, fontSize: 14, fontWeight: "600" },
    filterTextSelected: { color: "#FFFFFF", fontWeight: "700" },
    materials: { gap: theme.spacing[3] },
    card: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: theme.spacing[3],
      minHeight: 120,
      padding: theme.spacing[3],
      ...theme.shadows.sm,
    },
    cardPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    artwork: { borderRadius: theme.radius.medium, height: 96, overflow: "hidden", width: 96 },
    image: { height: "100%", width: "100%" },
    artworkBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.overlay,
      borderRadius: theme.radius.pill,
      bottom: 8,
      height: 34,
      justifyContent: "center",
      left: 8,
      position: "absolute",
      width: 34,
    },
    smallPlay: {
      borderBottomColor: "transparent",
      borderBottomWidth: 6,
      borderLeftColor: "#FFFFFF",
      borderLeftWidth: 9,
      borderTopColor: "transparent",
      borderTopWidth: 6,
      marginLeft: 2,
    },
    cardCopy: { flex: 1, gap: 8, minWidth: 0 },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      lineHeight: 22,
    },
    cardMeta: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "500" },
    progressTrack: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radius.pill,
      height: 4,
      overflow: "hidden",
    },
    progressFill: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      height: "100%",
    },
    playButton: {
      alignItems: "center",
      borderColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    playTriangle: {
      borderBottomColor: "transparent",
      borderBottomWidth: 7,
      borderLeftColor: theme.colors.primary,
      borderLeftWidth: 11,
      borderTopColor: "transparent",
      borderTopWidth: 7,
      marginLeft: 3,
    },
    empty: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 6,
      minHeight: 120,
      padding: theme.spacing[5],
      ...theme.shadows.sm,
    },
    emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "700" },
    emptyText: { color: theme.colors.mutedText, fontSize: 13, lineHeight: 20 },
    importArea: { gap: theme.spacing[3], paddingBottom: theme.spacing[4] },
    primaryAction: {
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.medium,
      flexDirection: "row",
      gap: theme.spacing[2],
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: theme.spacing[4],
      ...theme.shadows.sm,
    },
    primaryActionPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    primaryIcon: {
      alignItems: "center",
      borderColor: "#FFFFFF",
      borderRadius: theme.radius.pill,
      borderWidth: 1.8,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    shortcuts: { flexDirection: "row", gap: theme.spacing[2] },
    shortcut: {
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderSubtle,
      borderRadius: theme.radius.medium,
      borderWidth: StyleSheet.hairlineWidth,
      flex: 1,
      gap: theme.spacing[2],
      justifyContent: "center",
      minHeight: 76,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[3],
      ...theme.shadows.sm,
    },
    shortcutText: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
    trustNote: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing[2],
      justifyContent: "center",
      minHeight: 36,
    },
    trustText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: "500" },
    pressed: { opacity: 0.68, transform: [{ scale: 0.97 }] },
  });
}
