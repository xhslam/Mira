/**
 * Native audio instances can be released by the hook before a component's
 * cleanup executes. Native bridge rejections must therefore be contained at
 * the lifecycle boundary rather than surfaced to the application error screen.
 */
export function pauseAudioSafely(pause: () => void): boolean {
  try {
    pause();
    return true;
  } catch {
    return false;
  }
}
