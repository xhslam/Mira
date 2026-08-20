import type { LargeFilePolicy, ViewKind } from "./format-registry";

export const FILE_SIZE_LIMITS = Object.freeze({
  oneMegabyte: 1 * 1024 * 1024,
  fiveMegabytes: 5 * 1024 * 1024,
  twentyMegabytes: 20 * 1024 * 1024,
} as const);

export type FileSizeBand = "under-1mb" | "1mb-to-5mb" | "5mb-to-20mb" | "over-20mb";

export type LargeFileOpenDecision = Readonly<{
  band: FileSizeBand;
  initialView: ViewKind;
  editable: boolean;
  requiresConfirmation: boolean;
  rejected: boolean;
  reason: string;
}>;

export function classifyFileSize(sizeBytes: number): FileSizeBand {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error("File size must be a non-negative safe integer");
  }
  if (sizeBytes < FILE_SIZE_LIMITS.oneMegabyte) return "under-1mb";
  if (sizeBytes < FILE_SIZE_LIMITS.fiveMegabytes) return "1mb-to-5mb";
  if (sizeBytes < FILE_SIZE_LIMITS.twentyMegabytes) return "5mb-to-20mb";
  return "over-20mb";
}

export function decideLargeFileOpen(
  sizeBytes: number,
  policy: LargeFilePolicy,
  defaultView: ViewKind,
): LargeFileOpenDecision {
  const band = classifyFileSize(sizeBytes);

  if (band === "under-1mb") {
    return Object.freeze({
      band,
      initialView: defaultView,
      editable: true,
      requiresConfirmation: false,
      rejected: false,
      reason: "Small file opens with its normal view.",
    });
  }

  if (band === "1mb-to-5mb") {
    return Object.freeze({
      band,
      // Markdown remains a rich-text document after save/reopen. The editor
      // already has bounded DOM rendering and the user explicitly expects the
      // presentation view to be the default.
      initialView: defaultView,
      editable: true,
      requiresConfirmation: false,
      rejected: false,
      reason: "File opens with its normal view.",
    });
  }

  if (band === "5mb-to-20mb") {
    const streamOnly = policy === "stream";
    return Object.freeze({
      band,
      initialView: "source",
      editable: !streamOnly,
      requiresConfirmation: true,
      rejected: false,
      reason: streamOnly
        ? "Large file opens read-only in streaming view after confirmation."
        : "Large file opens in source mode after confirmation.",
    });
  }

  return Object.freeze({
    band,
    initialView: "source",
    editable: false,
    requiresConfirmation: false,
    rejected: true,
    reason: "File exceeds the mobile editing limit; open read-only or use an external app.",
  });
}
