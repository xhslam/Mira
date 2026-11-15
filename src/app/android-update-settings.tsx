import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import {
  androidBuildNumber,
  installAndroidUpdate,
  openAndroidInstallPermission,
} from "inkstone-workspace-access";

import { checkAndroidRelease, type AndroidRelease } from "../updates/android-release";
import { useTheme } from "./theme";

let installation: Promise<boolean> | undefined;
let downloadedDigest: string | undefined;

function downloadAndInstall(release: AndroidRelease): Promise<boolean> {
  installation ??= (async () => {
    const apk = new File(Paths.cache, "mira-update.apk");
    try {
      if (downloadedDigest !== release.sha256 || !apk.exists) {
        await File.downloadFileAsync(release.url, apk, { idempotent: true });
        downloadedDigest = release.sha256;
      }
      return await installAndroidUpdate(release.sha256, release.build);
    } catch (error) {
      downloadedDigest = undefined;
      if (apk.exists) apk.delete();
      throw error;
    }
  })().finally(() => {
    installation = undefined;
  });
  return installation;
}

export function AndroidUpdateSettings() {
  const { colors } = useTheme();
  const build = androidBuildNumber();
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(build !== undefined);
  const [check, setCheck] = useState(0);
  const installing = useRef(false);

  useEffect(() => {
    if (build === undefined) return;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 15000);
    let active = true;
    void checkAndroidRelease(build, request.signal)
      .then((result) => {
        if (!active) return;
        setRelease(result);
        setStatus(result ? `发现新版 · 构建 ${result.build}` : "当前已是最新版本。");
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(
            request.signal.aborted
              ? "检查超时，请重试。"
              : error instanceof Error
                ? error.message
                : "暂时无法检查更新。",
          );
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      request.abort();
    };
  }, [build, check]);

  function recheck() {
    setBusy(true);
    setRelease(null);
    setStatus("正在检查 GitHub 上的新版…");
    setCheck((value) => value + 1);
  }

  async function install(next: AndroidRelease) {
    if (installing.current) return;
    installing.current = true;
    setBusy(true);
    setStatus("正在下载并校验安装包…");
    try {
      if (await downloadAndInstall(next)) {
        setStatus("请在 Android 安装界面确认更新。");
      } else {
        setStatus("授权后请回到此页，再点一次安装。");
        Alert.alert("允许安装更新", "请在系统设置中允许 mira 安装应用。", [
          { text: "取消", style: "cancel" },
          { text: "打开系统设置", onPress: openAndroidInstallPermission },
        ]);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "安装失败，请重试。");
    } finally {
      installing.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.content}>
      <Text style={{ color: colors.text }}>当前构建 {build ?? "不可用"}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedText }}>
        {status || (build === undefined ? "此安装包不支持应用内更新。" : "正在检查更新…")}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy || build === undefined}
        onPress={() => (release ? void install(release) : recheck())}
        style={[styles.button, { backgroundColor: colors.canvas, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={{ color: colors.accent }}>{release ? "下载并安装更新" : "重新检查更新"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingVertical: 8 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 8 },
});
