import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { useReducedMotion } from "./use-reduced-motion";
import { useTranslate } from "./locale";
import { useTheme } from "./theme";

/**
 * Non-modal side sheet overlay.
 *
 * Renders as an absolutely-positioned layer inside the current window instead
 * of a React Native <Modal>. This is deliberate: on Android a Modal is a
 * separate Dialog window, and showing/dismissing it switches window focus
 * away from and back to the editor WebView, which breaks the WebView's IME
 * association (the keyboard then flashes open and closes on the next tap).
 * Keeping the sheet in-window leaves the editor's focus association intact.
 *
 * The layer stays mounted permanently and rests off-screen to the left when
 * hidden (`pointerEvents="none"` + accessibility-hidden), so the sheet's
 * scroll/search/tab state survives across open/close cycles and no state is
 * torn down. It closes on scrim tap and on a left-swipe gesture.
 */
export function OverlaySideSheet({
  children,
  onClose,
  visible,
  widthFraction = 0.6,
  maxWidth = 320,
}: Readonly<{
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
  widthFraction?: number;
  maxWidth?: number;
}>) {
  const theme = useTheme();
  const t = useTranslate();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(maxWidth, screenWidth * widthFraction);
  const [translateX] = useState(() => new Animated.Value(-width));
  const [dragX] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) dragX.setValue(0);
    if (reduceMotion) {
      translateX.setValue(visible ? 0 : -width);
      return;
    }
    // Keep the sheet and the menu-to-close glyph on the same physical rhythm.
    // A lightly damped spring gives the large surface a soft settle without
    // inserting a fixed delay or blocking an immediate reversal.
    const animation = Animated.spring(translateX, {
      toValue: visible ? 0 : -width,
      damping: 20,
      stiffness: 190,
      mass: 0.86,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // `width` is a dependency so rotation re-runs the resting/open position.
  }, [dragX, reduceMotion, translateX, visible, width]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dx < 0) dragX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -width * 0.28 || gesture.vx < -0.4) {
            onClose();
          } else {
            Animated.spring(dragX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
              speed: 14,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [dragX, onClose, width],
  );

  const scrimOpacity = translateX.interpolate({
    inputRange: [-width, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const sheetTranslateX = Animated.add(translateX, dragX);

  return (
    <View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, styles.overlayLayer]}
    >
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.overlay, opacity: scrimOpacity },
        ]}
      >
        <Pressable
          accessibilityLabel={t("drawer.close")}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sheet,
          theme.shadows.xl,
          {
            backgroundColor: theme.colors.canvas,
            borderTopRightRadius: theme.radius.modal,
            borderBottomRightRadius: theme.radius.modal,
            width,
            transform: [{ translateX: sheetTranslateX }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayLayer: { zIndex: 30, elevation: 30 },
  sheet: {
    height: "100%",
    overflow: "hidden",
  },
});
