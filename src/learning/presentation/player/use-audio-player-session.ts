import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioPlayer } from "expo-audio";
import {
  PlayerSessionController,
  type PlayerSessionProgressStore,
} from "../../application/player-session/media-engine";
import {
  initialPlayerSessionState,
  type PlayerCue,
  type PlayerSessionState,
} from "../../domain/playback/player-session";
import { ExpoAudioMediaEngine } from "../../data/providers/expo-audio-media-engine";

export type AudioSessionSource = Readonly<{
  mediaId: string;
  uri: string;
  cues: readonly PlayerCue[];
  restoredPositionMs: number;
}>;

type Props = Readonly<{
  player: AudioPlayer;
  source: AudioSessionSource | null;
  onProgress: PlayerSessionProgressStore["save"];
}>;

/**
 * Bridges the React-owned native player to one durable playback session.
 * Commands are resolved through a ref rather than a render-time controller so
 * delayed press handlers and timers become harmless after unmount.
 */
export function useAudioPlayerSession({ player, source, onProgress }: Props) {
  const progressRef = useRef(onProgress);
  const controllerRef = useRef<PlayerSessionController | null>(null);
  const isReleasedRef = useRef(false);
  const [controller, setController] = useState<PlayerSessionController | null>(null);
  const sourceRef = useRef<AudioSessionSource | null>(source);
  const [state, setState] = useState<PlayerSessionState>(initialPlayerSessionState);

  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    isReleasedRef.current = false;
    const nextController = new PlayerSessionController(new ExpoAudioMediaEngine(player), {
      save: (input) => progressRef.current(input),
    });
    controllerRef.current = nextController;
    setController(nextController);
    const unsubscribe = nextController.subscribe(setState);

    return () => {
      // Mark first: useAudioPlayer may release its native shared object in the
      // same unmount cycle, while screen timers can still hold old callbacks.
      isReleasedRef.current = true;
      if (controllerRef.current === nextController) controllerRef.current = null;
      unsubscribe();
      setController((current) => (current === nextController ? null : current));
      void nextController.dispose();
    };
  }, [player]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const currentSource = sourceRef.current;
    if (!controller || !currentSource || isReleasedRef.current) return;
    void controller.load(currentSource);
  }, [controller, source?.mediaId, source?.uri]);

  const run = useCallback(
    async (
      command: (activeController: PlayerSessionController) => Promise<void>,
    ): Promise<void> => {
      if (isReleasedRef.current) return;
      const activeController = controllerRef.current;
      if (!activeController) return;
      try {
        await command(activeController);
      } catch {
        // Native release and teardown are lifecycle events, not user-visible errors.
      }
    },
    [],
  );

  const play = useCallback(() => run((activeController) => activeController.play()), [run]);
  const pause = useCallback(() => run((activeController) => activeController.pause()), [run]);
  const seekTo = useCallback(
    (positionMs: number) => run((activeController) => activeController.seekTo(positionMs)),
    [run],
  );
  const selectCue = useCallback(
    (cue: PlayerCue) => run((activeController) => activeController.selectCue(cue)),
    [run],
  );
  const setPlaybackRate = useCallback(
    (rate: PlayerSessionState["playbackRate"]) =>
      run((activeController) => activeController.setPlaybackRate(rate)),
    [run],
  );
  const setVolume = useCallback(
    (volume: number) => run((activeController) => activeController.setVolume(volume)),
    [run],
  );
  const setFollowTranscript = useCallback((follow: boolean) => {
    if (!isReleasedRef.current) controllerRef.current?.setFollowTranscript(follow);
  }, []);
  const flush = useCallback(() => run((activeController) => activeController.flush()), [run]);

  return {
    state,
    play,
    pause,
    seekTo,
    selectCue,
    setPlaybackRate,
    setVolume,
    setFollowTranscript,
    flush,
  };
}
