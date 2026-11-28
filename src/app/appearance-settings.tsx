import { Check } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslate } from "./locale";
import { SCENE_IDS, SCENE_PALETTES } from "./scene-palettes";
import { SceneArtwork } from "./scene-wallpaper";
import type { ThemePreference } from "./settings-store";
import { useTheme } from "./theme";

export function AppearanceSettings({
  preference,
  saving,
  error,
  onChange,
}: Readonly<{
  preference: ThemePreference | undefined;
  saving: boolean;
  error: string;
  onChange: (preference: ThemePreference) => void;
}>) {
  const { colors } = useTheme();
  const t = useTranslate();
  const disabled = saving || preference === undefined;
  const activeStyle = { borderColor: colors.accent, backgroundColor: colors.accentSoft };
  return (
    <View style={styles.root}>
      <View accessibilityRole="radiogroup" style={styles.modes}>
        {(["system", "light", "dark"] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: preference === id, disabled }}
            disabled={disabled}
            onPress={() => {
              if (preference !== id) onChange(id);
            }}
            style={[styles.mode, { borderColor: colors.divider }, preference === id && activeStyle]}
          >
            <Text style={[styles.modeText, { color: colors.text }]}>{t(`settings.${id}`)}</Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        场景主题
      </Text>
      <View accessibilityRole="radiogroup" style={styles.cards}>
        {SCENE_IDS.map((id) => {
          const scene = SCENE_PALETTES[id];
          const selected = preference === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityLabel={scene.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected) onChange(id);
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: selected ? colors.accent : colors.divider,
                  backgroundColor: colors.canvas,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.preview, { backgroundColor: scene.background }]}
                pointerEvents="none"
              >
                <SceneArtwork scene={id} />
                {selected ? (
                  <View style={[styles.badge, { backgroundColor: scene.fill }]}>
                    <Check color="#FFFFFF" size={14} strokeWidth={2.6} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color: colors.text }]}>{scene.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {saving ? (
        <ActivityIndicator color={colors.accent} accessibilityLabel="正在保存主题" />
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.dangerText }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, paddingBottom: 4 },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mode: {
    flex: 1,
    minWidth: 70,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    borderWidth: 1,
    borderRadius: 14,
  },
  modeText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  heading: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "48%", overflow: "hidden", borderWidth: 1, borderRadius: 14 },
  preview: { aspectRatio: 1.9, overflow: "hidden" },
  badge: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.72 },
});
