import type { ExpoConfig } from "expo/config";

// Development identity only. Public naming is a release decision, not an environment fallback.
const config: ExpoConfig = {
  name: "Markdown Notes Dev",
  slug: "vmark-mobile",
  scheme: "vmark-mobile-dev",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
  },
  android: {
    package: "dev.local.vmarkmobile",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
};

export default config;
