import { Check, Cpu, Search, Settings2 } from "lucide-react-native";
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { AiProviderProfile } from "../ai/provider-profile";
import { MiraSheet, SheetAction } from "./mira-controls";
import { useTheme, type Theme } from "./theme";

export function AiModelPicker({
  visible,
  profiles,
  activeProfileId,
  onSelect,
  onManage,
  onClose,
}: Readonly<{
  visible: boolean;
  profiles: readonly AiProviderProfile[];
  activeProfileId: AiProviderProfile["id"] | null;
  onSelect: (profile: AiProviderProfile) => void;
  onManage: () => void;
  onClose: () => void;
}>) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [query, setQuery] = useState("");
  function finish(action: () => void) {
    Keyboard.dismiss();
    setQuery("");
    action();
  }

  const term = query.trim().toLocaleLowerCase();
  const matches = profiles.filter((profile) =>
    `${profile.name} ${profile.model}`.toLocaleLowerCase().includes(term),
  );

  return (
    <MiraSheet title="选择模型" visible={visible} onClose={() => finish(onClose)}>
      {profiles.length > 0 ? (
        <View style={styles.search}>
          <Search color={theme.colors.mutedText} size={18} />
          <TextInput
            accessibilityLabel="搜索模型"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="搜索模型"
            placeholderTextColor={theme.colors.mutedText}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
        </View>
      ) : null}
      {matches.length === 0 ? (
        <Text style={styles.empty}>{profiles.length ? "没有匹配的模型" : "还没有可用模型"}</Text>
      ) : null}
      {matches.map((profile) => {
        const selected = profile.id === activeProfileId;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={profile.id}
            onPress={() => finish(() => onSelect(profile))}
            style={({ pressed }) => [styles.row, (selected || pressed) && styles.selected]}
          >
            <Cpu color={theme.colors.mutedText} size={20} />
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.name}>
                {profile.model}
              </Text>
              <Text numberOfLines={1} style={styles.provider}>
                {profile.name}
              </Text>
            </View>
            {selected ? <Check color={theme.colors.text} size={20} /> : null}
          </Pressable>
        );
      })}
      <View style={styles.manage}>
        <SheetAction
          icon={<Settings2 color={theme.colors.text} size={20} />}
          label="管理模型服务"
          onPress={() => finish(onManage)}
        />
      </View>
    </MiraSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    search: {
      minHeight: 48,
      borderRadius: theme.radius.medium,
      backgroundColor: theme.colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },
    row: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      borderRadius: theme.radius.medium,
    },
    selected: { backgroundColor: theme.colors.surface },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
    provider: { fontSize: 12, color: theme.colors.mutedText },
    empty: { padding: 16, color: theme.colors.mutedText, textAlign: "center" },
    manage: {
      marginTop: 8,
      paddingTop: 4,
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
