import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { youtubeEmbedUrl } from "./youtube-learning";

type Props = Readonly<{
  sourceUrl: string;
  positionMs: number | null;
  playing: boolean;
  playbackRate: number;
  onPositionMsChange: (positionMs: number) => void;
}>;

const BRIDGE_BOOTSTRAP = `
  (function () {
    if (window.__miraPlaybackBridge) return true;
    window.__miraPlaybackBridge = true;
    function video() { return document.querySelector('video'); }
    setInterval(function () {
      var element = video();
      if (element && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'time', positionMs: Math.round(element.currentTime * 1000) }));
      }
    }, 250);
    return true;
  })();
`;

function commandScript(command: string): string {
  return `(function () { var video = document.querySelector('video'); if (video) { ${command} } return true; })();`;
}

export function YoutubePreview({
  sourceUrl,
  positionMs,
  playing,
  playbackRate,
  onPositionMsChange,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const embedUrl = useMemo(() => youtubeEmbedUrl(sourceUrl), [sourceUrl]);

  useEffect(() => {
    if (positionMs === null) return;
    const seconds = Math.max(0, positionMs / 1_000);
    webViewRef.current?.injectJavaScript(commandScript(`video.currentTime = ${seconds};`));
  }, [positionMs]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      commandScript(playing ? "video.play();" : "video.pause();"),
    );
  }, [playing]);

  useEffect(() => {
    const rate = Math.max(0.25, Math.min(2, playbackRate));
    webViewRef.current?.injectJavaScript(commandScript(`video.playbackRate = ${rate};`));
  }, [playbackRate]);

  if (embedUrl === null) return null;
  return (
    <View style={styles.wrap}>
      <WebView
        ref={webViewRef}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        injectedJavaScript={BRIDGE_BOOTSTRAP}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as unknown;
            const record =
              payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
            const positionMs = record?.positionMs;
            if (record?.type === "time" && typeof positionMs === "number")
              onPositionMsChange(Math.round(positionMs));
          } catch {
            // Ignore malformed third-party page messages; only our bridge changes playback state.
          }
        }}
        originWhitelist={["https://*"]}
        source={{ uri: embedUrl }}
        style={styles.video}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#111111", borderRadius: 10, height: 210, overflow: "hidden" },
  video: { backgroundColor: "#111111", flex: 1 },
});
