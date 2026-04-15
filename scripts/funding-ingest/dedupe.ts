import type { PrismaClient } from "@prisma/client";
import { addDays, subDays } from "date-fns";

/**
 * Cross-article duplicate: same normalized company within ±windowDays on announced_date,
 * and overlapping round label (if both present).
 */
export async function findCrossArticleDuplicateDeal(
  prisma: PrismaClient,
  args: {
    company_name_normalized: string;
    announced_date: Date | null;
    round_type_normalized: string | null;
    exclude_source_article_id: string;
    windowDays?: number;
  },
): Promise<{ id: string } | null> {
  const windowDays = args.windowDays ?? 5;
  if (!args.announced_date) return null;
  const from = subDays(args.announced_date, windowDays);
  const to = addDays(args.announced_date, windowDays);

  const candidates = await prisma.fundingDeal.findMany({
    where: {
      company_name_normalized: args.company_name_normalized,
      announced_date: { gte: from, lte: to },
      duplicate_of_deal_id: null,
      NOT: { source_article_id: args.exclude_source_article_id },
    },
    select: { id: true, round_type_normalized: true },
    take: 8,
  });
  if (!candidates.length) return null;
  if (!args.round_type_normalized) return candidates[0] ?? null;
  const rn = args.round_type_normalized.toLowerCase();
  const hit =
    candidates.find((c) => (c.round_type_normalized ?? "").toLowerCase() === rn) ??
    candidates.find((c) => (c.round_type_normalized ?? "").toLowerCase().includes(rn) || rn.includes((c.round_type_normalized ?? "").toLowerCase()));
  return hit ?? candidates[0] ?? null;
}
