import { PanelLeftClose, PanelLeftOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

export function SidebarTitleButton({
  expanded,
  onPress,
}: Readonly<{
  expanded: boolean;
  onPress: () => void;
}>) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={expanded ? "关闭笔记侧边栏" : "打开笔记侧边栏"}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        Mira
      </Text>
      <SidebarToggleIcon color={colors.mutedText} expanded={expanded} size={18} />
    </Pressable>
  );
}

export function SidebarToggleIcon({
  color,
  expanded,
  size = 24,
}: Readonly<{
  color: string;
  expanded: boolean;
  size?: number;
}>) {
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(expanded ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }
    const animation = Animated.spring(progress, {
      toValue: expanded ? 1 : 0,
      damping: 20,
      stiffness: 190,
      mass: 0.86,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, progress, reduceMotion]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
        ]}
      >
        <PanelLeftOpen color={color} size={size} strokeWidth={1.8} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <PanelLeftClose color={color} size={size} strokeWidth={1.8} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleButton: {
    minHeight: 48,
    minWidth: 48,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  title: { flexShrink: 1, fontSize: 21, fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
