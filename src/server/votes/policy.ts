export const voteRequestBytes = 1024;
export type VoteValue = -1 | 0 | 1;
export type VoteSummary = { score: number; upvotes: number; downvotes: number; value: VoteValue; canVote: boolean };

export function voteInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => key !== "value") || ![-1, 0, 1].includes(value.value as number)) throw new Error("Invalid vote state");
  return { value: value.value as VoteValue };
}

export function voteSummary(value: unknown): VoteSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid vote response");
  const row = value as Record<string, unknown>;
  if (typeof row.score !== "number" || !Number.isSafeInteger(row.score) || ![-1, 0, 1].includes(row.value as number) ||
      typeof row.upvotes !== "number" || !Number.isSafeInteger(row.upvotes) || row.upvotes < 0 ||
      typeof row.downvotes !== "number" || !Number.isSafeInteger(row.downvotes) || row.downvotes < 0 || row.score !== row.upvotes - row.downvotes ||
      typeof row.canVote !== "boolean") throw new Error("Invalid vote response");
  return { score: row.score, upvotes: row.upvotes, downvotes: row.downvotes, value: row.value as VoteValue, canVote: row.canVote };
}
