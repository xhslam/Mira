export const AI_LIMITS = Object.freeze({
  maxToolRounds: 8,
  maxSearchResults: 12,
  maxSearchExcerptBytes: 2 * 1_024,
  maxNoteReadBytes: 128 * 1_024,
  maxRequestContextBytes: 512 * 1_024,
  maxProposalBytes: 2 * 1_024 * 1_024,
  networkIdleTimeoutMs: 60_000,
  maxAutomationAttempts: 3,
  maxPromptHistory: 100,
});
