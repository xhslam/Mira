export const UI_SOUND_CUES = [
  "select",
  "open",
  "close",
  "success",
  "error",
  "blocked",
  "delete",
  "undo",
  "redo",
  "send",
  "complete",
  "play",
  "pause",
  "start",
  "stop",
] as const;

/**
 * Deliberately excludes high-frequency feedback such as typing, press, hover,
 * focus, seeking, volume changes, loading ticks, and progress steps.
 */
export type UiSoundCue = (typeof UI_SOUND_CUES)[number];

export const DEFAULT_UI_SOUND_VOLUME = 0.35;

export const UI_SOUND_CUE_VOLUMES: Readonly<Record<UiSoundCue, number>> = Object.freeze({
  select: 0.2,
  open: 0.18,
  close: 0.17,
  success: 0.23,
  error: 0.22,
  blocked: 0.2,
  delete: 0.22,
  undo: 0.18,
  redo: 0.18,
  send: 0.2,
  complete: 0.24,
  play: 0.18,
  pause: 0.17,
  start: 0.19,
  stop: 0.18,
});

export const UI_SOUND_COOLDOWNS_MS: Readonly<Record<UiSoundCue, number>> = Object.freeze({
  select: 300,
  open: 400,
  close: 400,
  success: 600,
  error: 800,
  blocked: 800,
  delete: 1_000,
  undo: 500,
  redo: 500,
  send: 800,
  complete: 1_000,
  play: 400,
  pause: 400,
  start: 800,
  stop: 800,
});

export interface UiSoundVoice {
  play(cue: UiSoundCue, volume: number): Promise<void>;
  stop(): Promise<void>;
  release(): void;
}

export type UiSoundPlayer = Readonly<{
  play(cue: UiSoundCue): boolean;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  setSuppressed(suppressed: boolean): void;
  stopAll(): void;
  destroy(): void;
}>;

export type UiSoundPlayerOptions = Readonly<{
  createVoice: () => UiSoundVoice;
  now?: () => number;
  voiceCount?: number;
}>;

type ManagedVoice = {
  readonly voice: UiSoundVoice;
  task: Promise<void>;
};

function clampUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function createUiSoundPlayer(options: UiSoundPlayerOptions): UiSoundPlayer {
  const now = options.now ?? Date.now;
  const voiceCount = Math.max(1, Math.min(4, Math.round(options.voiceCount ?? 4)));
  const voices: ManagedVoice[] = Array.from({ length: voiceCount }, () => ({
    voice: options.createVoice(),
    task: Promise.resolve(),
  }));
  const lastStartedAt = new Map<UiSoundCue, number>();
  let enabled = false;
  let suppressed = false;
  let volume = DEFAULT_UI_SOUND_VOLUME;
  let cursor = 0;
  let destroyed = false;

  function stopManagedVoice(managed: ManagedVoice): void {
    managed.task = managed.task.then(() => managed.voice.stop()).catch(() => undefined);
  }

  return Object.freeze({
    play(cue) {
      if (destroyed || !enabled || suppressed) return false;
      const currentTime = now();
      const previous = lastStartedAt.get(cue);
      if (previous !== undefined && currentTime - previous < UI_SOUND_COOLDOWNS_MS[cue]) {
        return false;
      }
      const managed = voices[cursor];
      if (!managed) return false;
      cursor = (cursor + 1) % voices.length;
      lastStartedAt.set(cue, currentTime);
      const cueVolume = volume * UI_SOUND_CUE_VOLUMES[cue];
      managed.task = managed.task
        .then(async () => {
          if (destroyed || !enabled || suppressed) return;
          await managed.voice.stop();
          if (destroyed || !enabled || suppressed) return;
          await managed.voice.play(cue, cueVolume);
        })
        .catch(() => undefined);
      return true;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) voices.forEach(stopManagedVoice);
    },
    setVolume(nextVolume) {
      volume = clampUnit(nextVolume, volume);
    },
    setSuppressed(nextSuppressed) {
      suppressed = nextSuppressed;
      if (suppressed) voices.forEach(stopManagedVoice);
    },
    stopAll() {
      voices.forEach(stopManagedVoice);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      voices.forEach((managed) => {
        stopManagedVoice(managed);
        managed.task = managed.task.then(() => managed.voice.release()).catch(() => undefined);
      });
      lastStartedAt.clear();
    },
  });
}
