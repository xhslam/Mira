import type { WorkspaceId } from "../domain/identifiers";
import type { AiProviderProfileId } from "./provider-profile";

export type AiAutomationId = string & Readonly<{ __brand: "AiAutomationId" }>;
export type AiExecutionId = string & Readonly<{ __brand: "AiExecutionId" }>;

export type AiAutomationSchedule =
  | Readonly<{ kind: "app-open"; debounceMinutes: number }>
  | Readonly<{ kind: "daily"; hour: number; minute: number }>
  | Readonly<{ kind: "weekly"; weekday: number; hour: number; minute: number }>;

export type AiAutomation = Readonly<{
  id: AiAutomationId;
  workspaceId: WorkspaceId;
  scheduleVersion: string;
  name: string;
  prompt: string;
  schedule: AiAutomationSchedule;
  timezone: string;
  providerProfileId: AiProviderProfileId | null;
  contextPaths: readonly string[];
  requiresWebSearch: boolean;
  requiresWholeWorkspaceSearch: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type AiExecution = Readonly<{
  id: AiExecutionId;
  automationId: AiAutomationId;
  occurrenceKey: string;
  state: "running" | "succeeded" | "retryable" | "terminal" | "paused";
  attempt: number;
  proposalIds: readonly string[];
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}>;

function zonedParts(
  now: Date,
  timezone: string,
): Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  return Object.freeze({
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName),
  });
}

function dateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function shiftCalendarDate(
  parts: Readonly<{ year: number; month: number; day: number }>,
  days: number,
) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return Object.freeze({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function latestAutomationOccurrence(
  task: AiAutomation,
  now: Date,
): Readonly<{ key: string }> {
  if (task.schedule.kind === "app-open") {
    const windowMs = Math.max(1, task.schedule.debounceMinutes) * 60_000;
    return Object.freeze({ key: `open:${Math.floor(now.getTime() / windowMs)}` });
  }
  const local = zonedParts(now, task.timezone);
  if (task.schedule.kind === "daily") {
    const passed =
      local.hour > task.schedule.hour ||
      (local.hour === task.schedule.hour && local.minute >= task.schedule.minute);
    const date = passed ? local : shiftCalendarDate(local, -1);
    return Object.freeze({ key: `daily:${dateKey(date.year, date.month, date.day)}` });
  }
  const daysBack = (local.weekday - task.schedule.weekday + 7) % 7;
  const passedToday =
    daysBack > 0 ||
    local.hour > task.schedule.hour ||
    (local.hour === task.schedule.hour && local.minute >= task.schedule.minute);
  const date = shiftCalendarDate(local, -(passedToday ? daysBack : 7));
  return Object.freeze({ key: `weekly:${dateKey(date.year, date.month, date.day)}` });
}
