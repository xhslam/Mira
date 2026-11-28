import type { ReactNode } from "react";
import { StatusBar } from "react-native";
import { AppSafeArea } from "./app-safe-area";
import { ThemeContext, type Theme } from "./theme";

export function AppChrome({
  appearance,
  children,
}: Readonly<{ appearance: Theme; children: ReactNode }>) {
  return (
    <ThemeContext.Provider value={appearance}>
      <AppSafeArea style={{ backgroundColor: appearance.colors.background }}>
        <StatusBar
          animated
          backgroundColor={appearance.colors.background}
          barStyle={appearance.mode === "dark" ? "light-content" : "dark-content"}
          translucent={false}
        />
        {children}
      </AppSafeArea>
    </ThemeContext.Provider>
  );
}
