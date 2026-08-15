import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LIGHT_THEME } from "./theme";

type AppStartupBoundaryProps = Readonly<{
  children: ReactNode;
}>;

type AppStartupBoundaryState = Readonly<{
  error: Error | null;
}>;

export class AppStartupBoundary extends Component<
  AppStartupBoundaryProps,
  AppStartupBoundaryState
> {
  override state: AppStartupBoundaryState = Object.freeze({ error: null });

  static getDerivedStateFromError(error: unknown): AppStartupBoundaryState {
    return Object.freeze({
      error: error instanceof Error ? error : new Error("The application could not start"),
    });
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Inkstone startup failed", error, errorInfo.componentStack);
  }

  private readonly retry = (): void => {
    this.setState(Object.freeze({ error: null }));
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <View accessibilityRole="alert" style={styles.container}>
        <Text style={styles.title}>Inkstone couldn’t start</Text>
        <Text style={styles.message}>
          Your files are safe. Retry startup; if the problem continues, restart the app and keep
          this screen available for diagnostics.
        </Text>
        <Text selectable style={styles.diagnostic}>
          {this.state.error.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.retry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Retry startup</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
    backgroundColor: LIGHT_THEME.colors.background,
  },
  title: {
    color: LIGHT_THEME.colors.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    maxWidth: 480,
    color: LIGHT_THEME.colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  diagnostic: {
    maxWidth: 520,
    color: LIGHT_THEME.colors.warningText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 20,
    backgroundColor: LIGHT_THEME.colors.accent,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
