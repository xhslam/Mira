import { PanelLeftClose, PanelLeftOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useReducedMotion } from "./use-reduced-motion";

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
