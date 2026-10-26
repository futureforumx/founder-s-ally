import type { RelationshipClaim } from "./mappers";
import { normalizeCompanyName } from "./normalize";
import type { DealUpsert } from "./store";

/**
 * Relationship handling. Existing structures are reused rather than duplicated:
 *   Investor WORKS_AT Firm        firm_investors.firm_id               (already a FK; never re-pointed here)
 *   Founder FOUNDED Company       startup_founders.startup_id          (already a FK; never re-pointed here)
 *   Firm INVESTED_IN Company      firm_recent_deals (unique firm_id + normalized_company_name)
 *   Firm CO_INVESTED_WITH Firm    firm_records.co_investor_patterns    (text[] field, merged by the field pipeline)
 *   Investor BOARD_MEMBER_OF      firm_investors.board_seats           (review-only field)
 *   Operator WORKS_AT Company     no join table exists; employer is kept in prior_companies/title only
 *
 * A firm-level deal is never attributed to an individual investor, and association is never treated
 * as a warm-intro path.
 */

export interface DealPlan {
  upserts: DealUpsert[];
  /** Claims whose response shape is not yet trusted, or that lack a usable company name. */
  heldForReview: RelationshipClaim[];
}

export function planDeals(firmId: string, claims: RelationshipClaim[], opts: { identityHigh: boolean; maxDeals?: number }): DealPlan {
  const upserts: DealUpsert[] = [];
  const held: RelationshipClaim[] = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const key = normalizeCompanyName(c.companyName);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!opts.identityHigh || !c.shapeDocumented) {
      held.push(c);
      continue;
    }
    upserts.push({
      firmId,
      companyName: c.companyName,
      normalizedCompanyName: key,
      amountText: c.amountUsd !== null ? String(Math.round(c.amountUsd)) : null,
      stage: c.roundType,
      dateAnnounced: c.announcedOn,
      website: c.companyDomain ? `https://${c.companyDomain}` : null,
      sourceUrl: null,
      confidence: 0.85,
      provider: c.provider,
    });
    if (upserts.length >= (opts.maxDeals ?? 25)) break;
  }
  return { upserts, heldForReview: held };
}
