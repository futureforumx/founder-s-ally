/** Whole-USD sum of funding rounds that have an amount. Rounds with no amount are ignored. */

export function totalRaisedFromFundingRounds(
  rounds: readonly { amount_usd: number | null }[] | null | undefined,
): number | null {
  if (!rounds?.length) return null;
  let sum = 0;
  let counted = 0;
  for (const round of rounds) {
    const amount = round.amount_usd;
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    sum += amount;
    counted += 1;
  }
  return counted > 0 ? sum : null;
}
