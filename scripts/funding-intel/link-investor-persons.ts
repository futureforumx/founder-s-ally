/**
 * Populate `funding_deal_investor_links.vc_person_id` when the parsed investor name
 * matches a single `vc_people` row at the linked firm (high confidence).
 *
 *   npx tsx scripts/funding-intel/link-investor-persons.ts
 *   INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/link-investor-persons.ts
 */
import { PrismaClient } from "@prisma/client";
import { tokenJaccard } from "./lib/similarity.js";

const prisma = new PrismaClient();
const DRY = process.env.INTEL_DRY_RUN === "1";
const BATCH = Math.max(100, parseInt(process.env.INTEL_PERSON_LINK_BATCH || "600", 10));
/** Default 0.88 — raise via INTEL_PERSON_LINK_MIN_J if you see false positives. */
const MIN_J = Math.min(0.98, Math.max(0.75, parseFloat(process.env.INTEL_PERSON_LINK_MIN_J || "0.88")));
const MIN_FIRM_CONF = 0.85;

function log(m: string) {
  console.log(`[intel:link-persons] ${new Date().toISOString()} ${m}`);
}

function displayName(p: { first_name: string; last_name: string; preferred_name: string | null }): string {
  const pref = p.preferred_name?.trim();
  if (pref) return pref;
  return `${p.first_name} ${p.last_name}`.trim();
}

/** Strip trailing firm context, e.g. "Jane Doe (Acme Ventures)" or "Jane — Partner". */
function normalizeInvestorNameRaw(raw: string): string {
  let s = raw.trim();
  const paren = s.match(/^(.+?)\s*\([^)]{2,120}\)\s*$/);
  if (paren) s = paren[1]!.trim();
  s = s.split(/\s*[—–-]\s*(?:Partner|GP|Principal|Investor|MD|Director)\b/i)[0]!.trim();
  return s;
}

function bestPersonMatch(
  nameRaw: string,
  people: { id: string; first_name: string; last_name: string; preferred_name: string | null }[],
): { id: string; j: number } | null {
  const cleaned = normalizeInvestorNameRaw(nameRaw);
  const minJ = people.length > 8 ? Math.max(MIN_J, 0.9) : MIN_J;

  const scored = people
    .map((p) => {
      const d = displayName(p);
      const fl = `${p.first_name} ${p.last_name}`.trim();
      const j = Math.max(
        tokenJaccard(cleaned, d),
        tokenJaccard(cleaned, fl),
        tokenJaccard(cleaned, p.first_name),
        tokenJaccard(cleaned, p.last_name),
        tokenJaccard(nameRaw, d),
        tokenJaccard(nameRaw, fl),
      );
      return { id: p.id, j };
    })
    .filter((x) => x.j >= minJ)
    .sort((a, b) => b.j - a.j);
  if (!scored.length) return null;
  const top = scored[0]!;
  const ambiguous = scored.filter((s) => s.j >= top.j - 0.03 && s.id !== top.id);
  if (ambiguous.length > 0) return null;
  return top;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  log(`start DRY=${DRY} MIN_J(base)=${MIN_J} (raised when firm has many partners)`);

  let linked = 0;
  let skipped = 0;
  let cursor: { id: string } | undefined;

  for (;;) {
    const links = await prisma.fundingDealInvestorLink.findMany({
      where: {
        vc_person_id: null,
        vc_firm_id: { not: null },
        match_confidence: { gte: MIN_FIRM_CONF },
      },
      take: BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: {
        id: true,
        vc_firm_id: true,
        match_confidence: true,
        funding_deal_investor: { select: { name_raw: true } },
      },
    });
    if (!links.length) break;
    cursor = { id: links[links.length - 1]!.id };

    const firmIds = [...new Set(links.map((l) => l.vc_firm_id).filter(Boolean))] as string[];
    const people = await prisma.vCPerson.findMany({
      where: { firm_id: { in: firmIds }, deleted_at: null },
      select: { id: true, firm_id: true, first_name: true, last_name: true, preferred_name: true },
    });
    const byFirm = new Map<string, typeof people>();
    for (const p of people) {
      const arr = byFirm.get(p.firm_id) ?? [];
      arr.push(p);
      byFirm.set(p.firm_id, arr);
    }

    for (const link of links) {
      const firmId = link.vc_firm_id;
      if (!firmId) {
        skipped += 1;
        continue;
      }
      const raw = link.funding_deal_investor.name_raw?.trim() || "";
      if (!raw) {
        skipped += 1;
        continue;
      }
      const candidates = byFirm.get(firmId) ?? [];
      const best = bestPersonMatch(raw, candidates);
      if (!best) {
        skipped += 1;
        continue;
      }
      if (!DRY) {
        const prev = await prisma.fundingDealInvestorLink.findUnique({
          where: { id: link.id },
          select: { match_evidence_json: true },
        });
        const ev = (prev?.match_evidence_json as Record<string, unknown> | null) ?? {};
        await prisma.fundingDealInvestorLink.update({
          where: { id: link.id },
          data: {
            vc_person_id: best.id,
            match_evidence_json: {
              ...ev,
              person_match: {
                jaccard: best.j,
                name_raw: raw,
                linked_at: new Date().toISOString(),
              },
            } as object,
          },
        });
      }
      linked += 1;
    }
  }

  log(`done linked=${linked} skipped_or_ambiguous=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
