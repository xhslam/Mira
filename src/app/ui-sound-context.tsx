import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { createExpoUiSoundPlayer } from "../feedback/expo-ui-sound-player";
import type { UiSoundPlayer } from "../feedback/ui-sound";

const NOOP_UI_SOUND_PLAYER: UiSoundPlayer = Object.freeze({
  play: () => false,
  setEnabled: () => undefined,
  setVolume: () => undefined,
  setSuppressed: () => undefined,
  stopAll: () => undefined,
  destroy: () => undefined,
});

const UiSoundContext = createContext<UiSoundPlayer>(NOOP_UI_SOUND_PLAYER);

export function UiSoundProvider({
  children,
  enabled,
  volume,
}: Readonly<{ children: ReactNode; enabled: boolean; volume: number }>) {
  const [player] = useState(createExpoUiSoundPlayer);

  useEffect(() => player.setEnabled(enabled), [enabled, player]);
  useEffect(() => player.setVolume(volume), [player, volume]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") player.stopAll();
    });
    return () => subscription.remove();
  }, [player]);
  useEffect(() => () => player.destroy(), [player]);

  const value = useMemo(() => player, [player]);
  return <UiSoundContext.Provider value={value}>{children}</UiSoundContext.Provider>;
}

export function useUiSound(): UiSoundPlayer {
  return useContext(UiSoundContext);
}
