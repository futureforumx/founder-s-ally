import type { EntityRow } from "./types.ts";
import { normalizeText } from "./normalize.ts";

export function findMatchingEntities(
  text: string,
  entities: EntityRow[],
): { id: string; name: string; type: string }[] {
  const n = normalizeText(text);
  const hits: { id: string; name: string; type: string; len: number }[] = [];
  for (const e of entities) {
    const names = [e.name, ...(e.aliases || [])].filter(Boolean);
    for (const name of names) {
      const nn = normalizeText(name);
      if (nn.length < 3) continue;
      if (n.includes(nn)) {
        hits.push({ id: e.id, name: e.name, type: e.type, len: nn.length });
      }
    }
  }
  hits.sort((a, b) => b.len - a.len);
  const seen = new Set<string>();
  const out: { id: string; name: string; type: string }[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push({ id: h.id, name: h.name, type: h.type });
    if (out.length >= 6) break;
  }
  return out;
}

export function suggestWhyItMatters(eventType: string, title: string): string {
  const t = title.slice(0, 120);
  switch (eventType) {
    case "new_investment_made":
    case "funding_round_announced":
      return `Capital flow around "${t}" shapes comps, valuation bands, and investor urgency in your space.`;
    case "new_fund_closed":
      return `New deployable capital may reopen outreach windows for relevant stage and sector.`;
    case "partner_joined_firm":
      return `New partner coverage can shift thesis and intro paths — worth mapping against your raise.`;
    case "pricing_changed":
      return `Competitive pricing moves influence win rates and enterprise negotiation anchors.`;
    case "product_launched":
    case "open_source_release":
      return `Ship velocity and tooling in your category set buyer expectations and technical bar.`;
    case "regulatory_update":
      return `Policy shifts can change GTM risk, sales cycles, and required product assurances.`;
    case "executive_departed":
    case "executive_hired":
      return `Leadership changes often precede strategy shifts, hiring waves, or M&A chatter.`;
    default:
      return `Structured signal worth monitoring for second-order effects on your market and cap table.`;
  }
}
