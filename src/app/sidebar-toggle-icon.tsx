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
  const lineWidth = size * 0.68;
  const lineHeight = Math.max(1.75, size * 0.078);
  const travel = size * 0.2;

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

  const topTransform = [
    {
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-travel, 0],
      }),
    },
    {
      rotate: progress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "40deg"],
      }),
    },
    {
      scaleX: progress.interpolate({
        inputRange: [0, 0.62, 1],
        outputRange: [1, 0.9, 0.82],
      }),
    },
  ];
  const bottomTransform = [
    {
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [travel, 0],
      }),
    },
    {
      rotate: progress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "-40deg"],
      }),
    },
    {
      scaleX: progress.interpolate({
        inputRange: [0, 0.62, 1],
        outputRange: [1, 0.9, 0.82],
      }),
    },
  ];

  return (
    <View accessibilityElementsHidden style={[styles.icon, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: color, width: lineWidth, height: lineHeight },
          { transform: topTransform },
        ]}
      />
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: color, width: lineWidth, height: lineHeight },
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.58, 0.9],
              outputRange: [1, 0, 0],
            }),
            transform: [
              {
                scaleX: progress.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [1, 0.58, 0.42],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.line,
          { backgroundColor: color, width: lineWidth, height: lineHeight },
          { transform: bottomTransform },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", justifyContent: "center" },
  line: { position: "absolute", borderRadius: 999 },
});
