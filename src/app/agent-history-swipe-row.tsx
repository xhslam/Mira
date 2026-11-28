import { Brain, Pin, PinOff, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { shouldCaptureHistorySwipe, shouldOpenHistoryActions } from "./agent-history-swipe";
import { useTheme } from "./theme";

const ACTION_WIDTH = 224;

// The front row retains its existing layout; the actions occupy only the area it uncovers.
export function AgentHistorySwipeRow({
  children,
  title,
  open,
  pinned,
  reduceMotion,
  onOpenChange,
  onDelete,
  onPin,
  onMemory,
}: Readonly<{
  children: ReactNode;
  title: string;
  open: boolean;
  pinned: boolean;
  reduceMotion: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onPin: () => void;
  onMemory: () => void;
}>) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const revealWidth = Math.min(ACTION_WIDTH, Math.max(0, width - 30));
  const [translation] = useState(() => new Animated.Value(0));
  const responder = useMemo(() => {
    const start = open ? revealWidth : 0;
    const settle = () => {
      if (reduceMotion) translation.setValue(start);
      else
        Animated.timing(translation, {
          toValue: start,
          duration: 155,
          useNativeDriver: true,
        }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) =>
        revealWidth > 0 && numberActiveTouches === 1 && shouldCaptureHistorySwipe(open, dx, dy),
      onPanResponderGrant: () => translation.stopAnimation(),
      onPanResponderMove: (_, { dx }) =>
        translation.setValue(Math.max(0, Math.min(revealWidth, start + dx))),
      onPanResponderRelease: (_, { dx }) => {
        const next = shouldOpenHistoryActions(open, dx, revealWidth);
        if (next === open) settle();
        else onOpenChange(next);
      },
      onPanResponderTerminate: settle,
    });
  }, [onOpenChange, open, reduceMotion, revealWidth, translation]);

  useEffect(() => {
    const toValue = open ? revealWidth : 0;
    if (reduceMotion) {
      translation.setValue(toValue);
      return;
    }
    const animation = Animated.timing(translation, {
      toValue,
      duration: 155,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduceMotion, revealWidth, translation]);

  return (
    <View
      {...responder.panHandlers}
      style={styles.container}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={[styles.actions, { width: revealWidth, backgroundColor: colors.surfaceMuted }]}
        pointerEvents={open ? "auto" : "none"}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除：${title}`}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.dangerSoft },
            pressed && styles.pressed,
          ]}
        >
          <Trash2 size={17} color={colors.danger} />
          <Text style={[styles.label, { color: colors.dangerText }]}>删除</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pinned ? "取消置顶" : "置顶"}：${title}`}
          onPress={onPin}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {pinned ? (
            <PinOff size={17} color={colors.text} />
          ) : (
            <Pin size={17} color={colors.text} />
          )}
          <Text style={[styles.label, { color: colors.text }]}>{pinned ? "取消置顶" : "置顶"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`添加到记忆：${title}`}
          onPress={onMemory}
          style={({ pressed }) => [
            styles.action,
            styles.memory,
            { backgroundColor: colors.surface },
            pressed && styles.pressed,
          ]}
        >
          <Brain size={17} color={colors.text} />
          <Text style={[styles.label, { color: colors.text }]}>添加到记忆</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[
          { backgroundColor: colors.historyBackground, transform: [{ translateX: translation }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", borderRadius: 16 },
  actions: { position: "absolute", left: 0, top: 0, bottom: 0, flexDirection: "row" },
  action: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 4 },
  memory: { flex: 1.55 },
  label: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  pressed: { opacity: 0.72 },
});
