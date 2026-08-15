import type { AudioSource } from "expo-audio";

import type { UiSoundCue } from "./ui-sound";

export const UI_SOUND_ASSETS: Readonly<Record<UiSoundCue, AudioSource>> = Object.freeze({
  select: require("../../assets/ui-sfx/zen/select.mp3") as number,
  open: require("../../assets/ui-sfx/zen/open.mp3") as number,
  close: require("../../assets/ui-sfx/zen/close.mp3") as number,
  success: require("../../assets/ui-sfx/zen/success.mp3") as number,
  error: require("../../assets/ui-sfx/zen/error.mp3") as number,
  blocked: require("../../assets/ui-sfx/zen/blocked.mp3") as number,
  delete: require("../../assets/ui-sfx/zen/delete.mp3") as number,
  undo: require("../../assets/ui-sfx/zen/undo.mp3") as number,
  redo: require("../../assets/ui-sfx/zen/redo.mp3") as number,
  send: require("../../assets/ui-sfx/zen/send.mp3") as number,
  complete: require("../../assets/ui-sfx/zen/complete.mp3") as number,
  play: require("../../assets/ui-sfx/zen/play.mp3") as number,
  pause: require("../../assets/ui-sfx/zen/pause.mp3") as number,
  start: require("../../assets/ui-sfx/zen/start.mp3") as number,
  stop: require("../../assets/ui-sfx/zen/stop.mp3") as number,
});
