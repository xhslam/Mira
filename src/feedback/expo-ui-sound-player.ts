import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import { UI_SOUND_ASSETS } from "./ui-sound-assets";
import {
  createUiSoundPlayer,
  type UiSoundCue,
  type UiSoundPlayer,
  type UiSoundVoice,
} from "./ui-sound";

class ExpoUiSoundVoice implements UiSoundVoice {
  private released = false;
  private readonly player: AudioPlayer = createAudioPlayer(null, {
    keepAudioSessionActive: true,
    updateInterval: 1_000,
  });

  public async play(cue: UiSoundCue, volume: number): Promise<void> {
    await this.invoke(() => {
      this.player.replace(UI_SOUND_ASSETS[cue]);
      this.player.loop = false;
      this.player.volume = Math.max(0, Math.min(1, volume));
      this.player.play();
    });
  }

  public async stop(): Promise<void> {
    await this.invoke(() => this.player.pause());
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    try {
      this.player.release();
    } catch {
      // Native teardown may have already released the shared object.
    }
  }

  private async invoke(command: () => unknown): Promise<void> {
    if (this.released) return;
    try {
      await command();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already released|shared object|AudioPlayer/iu.test(message)) this.released = true;
    }
  }
}

export function createExpoUiSoundPlayer(): UiSoundPlayer {
  return createUiSoundPlayer({ createVoice: () => new ExpoUiSoundVoice(), voiceCount: 4 });
}
