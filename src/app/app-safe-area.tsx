import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

const ALL_EDGES: readonly Edge[] = Object.freeze(["top", "right", "bottom", "left"]);

export function AppSafeArea({
  children,
  contentStyle,
  opticalTopSpacing = 8,
  style,
}: Readonly<{
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  opticalTopSpacing?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <SafeAreaView edges={ALL_EDGES} style={[styles.safeArea, style]}>
      <View style={[styles.content, { paddingTop: opticalTopSpacing }, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
});
