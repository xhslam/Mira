import type { ExpoConfig } from "expo/config";

const androidBuild = Number(process.env.MIRA_ANDROID_BUILD ?? "1");

const config: ExpoConfig = {
  name: "mira",
  slug: "inkstone-markdown",
  scheme: "inkstone",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  plugins: [
    "expo-video",
    "expo-secure-store",
    [
      "expo-audio",
      {
        microphonePermission: "Allow Mira to access your microphone for speaking practice.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Mira to choose videos from your photo library for sentence-by-sentence learning.",
      },
    ],
  ],
  ios: {
    bundleIdentifier: "app.inkstone.markdown",
    buildNumber: "1",
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        "Mira uses your microphone only when you start a speaking practice recording.",
      UIFileSharingEnabled: false,
      LSSupportsOpeningDocumentsInPlace: true,
    },
  },
  android: {
    package: "app.inkstone.markdown",
    versionCode: androidBuild,
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: "#F2EDE1",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    blockedPermissions: [
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    permissions: [
      "android.permission.INTERNET",
      "android.permission.RECORD_AUDIO",
      "android.permission.REQUEST_INSTALL_PACKAGES",
    ],
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
};

export default config;
