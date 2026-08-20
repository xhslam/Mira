import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { bilibiliEmbedUrl } from "./bilibili-learning";

type Props = Readonly<{
  sourceUrl: string;
  positionMs: number | null;
  playing: boolean;
  playbackRate: number;
  onPositionMsChange: (positionMs: number) => void;
}>;

export function BilibiliPreview({ sourceUrl }: Props) {
  const embedUrl = useMemo(() => bilibiliEmbedUrl(sourceUrl), [sourceUrl]);
  if (embedUrl === null) return null;
  return (
    <View style={styles.wrap}>
      <WebView
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction
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
