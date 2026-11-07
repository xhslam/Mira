import type { AgentService } from "../agent-service";
import { delegationOccurrence } from "./review-reader";

/** Best-effort catch-up, never a mobile background or exact-time guarantee. */
export async function runForegroundAgent(service: AgentService, now = new Date()) {
  let snapshot = await service.load();
  for (const delegation of snapshot.delegations) {
    if (delegation.status !== "active" || !delegation.schedule || !delegation.timezone) continue;
    const date = delegationOccurrence(delegation.timezone, delegation.schedule.time, now);
    if (!date) continue;
    const occurrenceKey = `${delegation.version}:${date}`;
    if (
      snapshot.runs.some(
        (run) => run.delegationId === delegation.id && run.occurrenceKey === occurrenceKey,
      )
    )
      continue;
    snapshot = await service.review({
      reason: "scheduled",
      delegationId: delegation.id,
      occurrenceKey,
      notes: [],
    });
  }
  return snapshot;
}
