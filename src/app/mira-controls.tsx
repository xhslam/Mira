import type { ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Ellipse, Path } from "react-native-svg";

import { useTheme } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

const agentAvatarColors = [
  "#F56B13",
  "#11A89D",
  "#2183E6",
  "#10AB68",
  "#171717",
  "#D85416",
] as const;
const avatarShapes = [
  "M23 2.5C32 1.7 40 7 43.4 14.6c3.1 7.1 1.6 16.8-3.8 22.2C34.1 42.5 25 46.8 17.4 44 9.3 41.1 3 33.3 3 24.3 3 13 11.6 3.5 23 2.5Z",
  "M11 7C18 3 29 0 35 4c6 4 10 14 10 21 1 10-8 15-18 18-9 3-15 2-19-6C3 29 0 15 11 7Z",
  "M9 13C12 3 21 0 29 6c7 5 18 12 17 21-1 7-16 13-24 16-8 3-17 2-18-7-1-8 2-18 5-23Z",
  "M6 13C10 6 19 1 26 4c6 2 11 9 15 16 3 5 6 13 1 17-5 5-13 5-22 7-8 1-10-2-13-10-3-8-5-14-1-21Z",
] as const;

export function agentAvatarLook(id: string | null) {
  const hash = id
    ? [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0)
    : 0;
  return {
    color: agentAvatarColors[hash % agentAvatarColors.length] ?? agentAvatarColors[0],
    shape:
      avatarShapes[Math.floor(hash / agentAvatarColors.length) % avatarShapes.length] ??
      avatarShapes[0],
  };
}

export function MiraAvatar({
  size = 48,
  color,
  shape = avatarShapes[0],
}: Readonly<{ size?: number; color?: string; shape?: string }>) {
  const { colors } = useTheme();
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 48 48">
      <Path fill={color ?? colors.text} d={shape} />
      <Ellipse
        cx="20"
        cy="20"
        rx="2.7"
        ry="5.7"
        rotation="-27"
        origin="20,20"
        fill={colors.canvas}
      />
      <Ellipse
        cx="30"
        cy="16"
        rx="2.7"
        ry="5.7"
        rotation="-27"
        origin="30,16"
        fill={colors.canvas}
      />
    </Svg>
  );
}

export function CircleAction({
  children,
  label,
  onPress,
  selected,
  muted = false,
}: Readonly<{
  children: ReactNode;
  label: string;
  onPress: () => void;
  selected?: boolean;
  muted?: boolean;
}>) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        {
          backgroundColor:
            selected || pressed ? colors.surfaceMuted : muted ? colors.surface : colors.canvas,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function MiraSheet({
  children,
  onClose,
  title,
  visible,
}: Readonly<{
  children: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}>) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      transparent
      onRequestClose={onClose}
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheetRoot}
      >
        <Pressable
          accessible={false}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />
        <SafeAreaView
          accessibilityViewIsModal
          edges={["bottom", "left", "right"]}
          style={[styles.sheet, { backgroundColor: colors.canvas }]}
        >
          <View style={styles.sheetHeader}>
            <CircleAction label={`关闭${title}`} onPress={onClose} muted>
              <ChevronDown color={colors.text} size={20} />
            </CircleAction>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
              {title}
            </Text>
          </View>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetAction({
  disabled,
  icon,
  label,
  onPress,
}: Readonly<{
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}>) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled ?? false }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetAction,
        pressed && { backgroundColor: colors.surface },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
      <ChevronRight color={colors.mutedText} size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: "600" },
  sheetBody: { flexGrow: 0, paddingHorizontal: 16, paddingBottom: 16 },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionIcon: { width: 24, alignItems: "center" },
  actionLabel: { flex: 1, fontSize: 16 },
  disabled: { opacity: 0.45 },
});
