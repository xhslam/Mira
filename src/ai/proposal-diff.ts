import { diffLines } from "diff";

export type ProposalDiffPiece =
  | Readonly<{ kind: "unchanged"; text: string }>
  | Readonly<{ kind: "change"; id: number; before: string; after: string }>;

export function createProposalDiffPlan(
  before: string,
  after: string,
): readonly ProposalDiffPiece[] {
  const changes = diffLines(before, after);
  const pieces: ProposalDiffPiece[] = [];
  let index = 0;
  let id = 0;
  while (index < changes.length) {
    const change = changes[index];
    if (!change) break;
    if (!change.added && !change.removed) {
      pieces.push(Object.freeze({ kind: "unchanged", text: change.value }));
      index += 1;
      continue;
    }
    let beforeText = "";
    let afterText = "";
    while (index < changes.length) {
      const candidate = changes[index];
      if (!candidate || (!candidate.added && !candidate.removed)) break;
      if (candidate.removed) beforeText += candidate.value;
      if (candidate.added) afterText += candidate.value;
      index += 1;
    }
    pieces.push(Object.freeze({ kind: "change", id, before: beforeText, after: afterText }));
    id += 1;
  }
  return Object.freeze(pieces);
}

export function renderProposalDiffPlan(
  plan: readonly ProposalDiffPiece[],
  accepted: ReadonlySet<number>,
): string {
  return plan
    .map((piece) =>
      piece.kind === "unchanged" ? piece.text : accepted.has(piece.id) ? piece.after : piece.before,
    )
    .join("");
}
