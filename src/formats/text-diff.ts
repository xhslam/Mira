import { diffLines } from "diff";

export type TextDiffKind = "unchanged" | "added" | "removed";

export type TextDiffSegment = Readonly<{
  kind: TextDiffKind;
  lines: readonly string[];
}>;

export function createTextDiff(before: string, after: string): readonly TextDiffSegment[] {
  return Object.freeze(
    diffLines(before, after).map((change) =>
      Object.freeze({
        kind: change.added ? "added" : change.removed ? "removed" : "unchanged",
        lines: Object.freeze(change.value.replace(/\n$/, "").split("\n")),
      }),
    ),
  );
}
