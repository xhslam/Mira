export type WorkspaceFileRevisionInput = Readonly<{
  providerIdentifier: string;
  modifiedAt: number | null;
  size: number;
  contentHash: string;
}>;

export function createWorkspaceFileRevision(_input: WorkspaceFileRevisionInput): string {
  const validModifiedAt = _input.modifiedAt === null || Number.isFinite(_input.modifiedAt);
  if (
    _input.providerIdentifier.length === 0 ||
    _input.providerIdentifier.length > 16_384 ||
    !validModifiedAt ||
    !Number.isInteger(_input.size) ||
    _input.size < 0 ||
    _input.contentHash.length === 0 ||
    _input.contentHash.length > 1_024
  ) {
    throw new Error("Invalid workspace file revision metadata");
  }
  return JSON.stringify([
    _input.providerIdentifier,
    _input.modifiedAt,
    _input.size,
    _input.contentHash,
  ]);
}
