import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";

import { AppShellScreen } from "./src/app/app-shell-screen";
import { AppStartupBoundary } from "./src/app/app-startup-boundary";

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppStartupBoundary>
        <AppShellScreen />
      </AppStartupBoundary>
    </SafeAreaProvider>
  );
}
