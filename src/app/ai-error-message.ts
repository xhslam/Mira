/**
 * Internal failure messages are precise but meaningless to a reader. Translate
 * the ones a user can actually act on and keep everything else verbatim so real
 * provider errors (bad key, unknown model, quota) still reach the screen.
 */
export function describeAiSendFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Editor flush timed out" || message === "The editor workspace is unavailable") {
    return "The editor could not confirm the current note in time. Try again in a moment.";
  }
  if (message === "AI provider API key is missing") {
    return "This provider has no API key on this device. Add it in AI provider settings.";
  }
  if (message === "AI provider profile not found") {
    return "This AI provider is no longer configured. Choose or re-add a provider.";
  }
  if (message === "AI context exceeds the local request limit") {
    return "The selected notes are too large to send. Remove some context and try again.";
  }
  if (message === "The AI tool-round limit was reached") {
    return "The model kept calling tools without answering. Try a narrower question.";
  }
  return message || "The AI request failed.";
}
