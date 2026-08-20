import { performClickHaptic } from "inkstone-workspace-access";

/** Uses Android View feedback, which is safe without the VIBRATE permission. */
export function triggerClickFeedback(enabled: boolean): void {
  if (!enabled) return;
  performClickHaptic();
}
