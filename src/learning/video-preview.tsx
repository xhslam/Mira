import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export function VideoPreview({
  uri,
  positionMs,
  playing,
  playbackRate,
  onPositionMsChange,
}: Readonly<{
  uri: string;
  positionMs: number | null;
  playing: boolean;
  playbackRate: number;
  onPositionMsChange: (positionMs: number) => void;
}>) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- expo-video exposes playbackRate as its documented setter.
    player.playbackRate = playbackRate;
  }, [player, playbackRate]);

  useEffect(() => {
    if (positionMs !== null) {
      // eslint-disable-next-line react-hooks/immutability -- expo-video exposes currentTime as its documented seek setter.
      player.currentTime = Math.max(0, positionMs / 1000);
    }
  }, [player, positionMs]);
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  useEffect(() => {
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => {
      onPositionMsChange(Math.round(currentTime * 1000));
    });
    return () => subscription.remove();
  }, [onPositionMsChange, player]);
  return (
    <View style={styles.wrap}>
      <VideoView player={player} style={styles.video} nativeControls={false} contentFit="contain" />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { backgroundColor: "#111111", borderRadius: 10, overflow: "hidden" },
  video: { height: 210, width: "100%" },
});
