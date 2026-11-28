import { memo, useEffect, useState } from "react";
import { Animated, AppState, Easing, StyleSheet, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { SCENE_PALETTES, type SceneId } from "./scene-palettes";
import { useReducedMotion } from "./use-reduced-motion";

// Grid motifs redrawn for mobile from the local reference: starburst, clouds,
// sea turtles, koi and lily pads, and drifting jellyfish. No runtime assets.
const STAR = "M6 0h2v5h2V3h2v2h-2v1h5v2h-5v1h2v2h-2V9H8v5H6V9H4v2H2V9h2V8H0V6h4V5H2V3h2v2h2z";
const CLOUD = "M8 0h7v2h4v2h4v2h3v3h-3v2H4V9H0V6h4V4h4z";
const TURTLE = "M9 0h6v2h1v3h4v2h-4v4h2v4h-2v-3h-3v2H7v-2H4v3H2v-4h2V8H0V5h4V3h5z";
const KOI = "M7 0h5v2h3v3h1v5h-2v3h-2v4H9v-2H7v1H2v-2h3v-2h2V9H5V4h2z";
const LILY = "M4 0h6v1h3v2h2v3H8v2h5v2h-2v2H5V11H2V9H0V4h2V2h2z";
const JELLY =
  "M5 0h8v2h3v2h2v6H0V5h2V2h3z M2 11h2v7H2z M5 16h2v6H5z M8 11h2v10H8z M11 15h2v10h-2z M14 12h2v7h-2z";
const GRASS = "M1 1h2v5h2v4h2V3h2v8h1V5h2v8h-1v4H7v-2H4v-3H1z";

type Motif = Readonly<
  [x: number, y: number, size: number, path: string, detail?: boolean, tilt?: number]
>;
const MOTIFS: Readonly<Record<SceneId, readonly Motif[]>> = {
  "claude-code": [
    [137, 112, 5.3, STAR],
    [28, 254, 2.3, STAR],
    [185, 286, 1.25, STAR, true],
    [43, 83, 0.9, STAR, true],
  ],
  "cloud-drift": [
    [24, 65, 2.5, CLOUD],
    [125, 127, 3.1, CLOUD],
    [27, 185, 4.1, CLOUD],
    [142, 260, 2.85, CLOUD],
    [16, 308, 1.8, CLOUD],
  ],
  "honu-lagoon": [
    [51, 158, 4, TURTLE, false, -27],
    [148, 99, 2.8, TURTLE, false, 24],
    [8, 280, 4.4, GRASS, true, -7],
    [173, 249, 2.8, GRASS, true, 14],
  ],
  "koi-pond": [
    [64, 142, 4.5, KOI, false, -34],
    [165, 208, 3.6, KOI, false, 25],
    [28, 94, 2.7, LILY, true],
    [165, 129, 3.5, LILY, true],
    [48, 269, 3.25, LILY, true],
  ],
  jellyfish: [
    [63, 129, 4.2, JELLY],
    [161, 162, 3.1, JELLY, true, 7],
    [24, 243, 2.2, JELLY, true, -10],
    [158, 83, 1.7, JELLY],
  ],
};
const speckles = Array.from(
  { length: 85 },
  (_, i) => [(i * 83 + 17) % 240, (i * 127 + 11) % 360] as const,
);

export const SceneArtwork = memo(function SceneArtwork({
  scene,
  layer = "all",
}: Readonly<{ scene: SceneId; layer?: "all" | "base" | "motifs" }>) {
  const palette = SCENE_PALETTES[scene];
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 240 360"
      preserveAspectRatio="xMidYMid slice"
      accessible={false}
    >
      {layer !== "motifs" ? (
        <>
          <Defs>
            <LinearGradient id="sceneDepth" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" stopColor={palette.glow} />
              <Stop offset="0.46" stopColor={palette.background} />
              <Stop offset="1" stopColor={palette.canvas} />
            </LinearGradient>
            <RadialGradient id="sceneLight" cx="88%" cy="32%" rx="85%" ry="82%">
              <Stop offset="0" stopColor={palette.glow} stopOpacity={0.68} />
              <Stop offset="1" stopColor={palette.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="240" height="360" fill="url(#sceneDepth)" />
          <Rect width="240" height="360" fill="url(#sceneLight)" />
          {speckles.map(([x, y], i) => (
            <Rect
              key={i}
              x={x}
              y={y}
              width={i % 7 === 0 ? 2 : 1}
              height={i % 7 === 0 ? 2 : 1}
              fill={palette.accent}
              opacity={i % 7 === 0 ? 0.32 : 0.12}
            />
          ))}
        </>
      ) : null}
      {layer !== "base"
        ? MOTIFS[scene].map(([x, y, size, path, detail, tilt = 0], i) => (
            <G key={i} transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`}>
              <Path
                d={path}
                fill={detail ? palette.detail : palette.sprite}
                opacity={layer === "all" ? 0.96 : 0.58}
              />
            </G>
          ))
        : null}
    </Svg>
  );
});

export function SceneWallpaper({ scene, active }: Readonly<{ scene: SceneId; active: boolean }>) {
  const reduceMotion = useReducedMotion();
  const [foreground, setForeground] = useState(() => AppState.currentState === "active");
  const [offset] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground || reduceMotion) return;
    const drift = (toValue: number) =>
      Animated.timing(offset, {
        toValue,
        duration: 6200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      });
    const loop = Animated.loop(Animated.sequence([drift(-9), drift(0)]));
    loop.start();
    return () => {
      loop.stop();
      offset.setValue(0);
    };
  }, [active, foreground, offset, reduceMotion]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <SceneArtwork scene={scene} layer="base" />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: offset }] }]}>
        <SceneArtwork scene={scene} layer="motifs" />
      </Animated.View>
    </View>
  );
}
