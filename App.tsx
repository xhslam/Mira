import { StatusBar, StyleSheet } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";

import { AppSafeArea } from "./src/app/app-safe-area";
import { AppShellScreen } from "./src/app/app-shell-screen";
import { AppStartupBoundary } from "./src/app/app-startup-boundary";
import { LIGHT_THEME } from "./src/app/theme";

export default function App() {
  const theme = LIGHT_THEME;
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppSafeArea style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <StatusBar
          animated
          backgroundColor={theme.colors.background}
          barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
          translucent={false}
        />
        <AppStartupBoundary>
          <AppShellScreen />
        </AppStartupBoundary>
      </AppSafeArea>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
