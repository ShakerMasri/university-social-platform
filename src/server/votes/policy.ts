export const voteRequestBytes = 1024;
export type VoteSummary = { count: number; active: boolean; canVote: boolean };

export function voteInput(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => key !== "active") || typeof value.active !== "boolean") throw new Error("Invalid vote state");
  return { active: value.active };
}

export function voteSummary(value: unknown): VoteSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid vote response");
  const row = value as Record<string, unknown>;
  if (typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0 ||
      typeof row.active !== "boolean" || typeof row.canVote !== "boolean" || (row.active && row.count === 0)) throw new Error("Invalid vote response");
  return { count: row.count, active: row.active, canVote: row.canVote };
}
