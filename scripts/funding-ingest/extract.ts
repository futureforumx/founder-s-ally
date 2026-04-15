import { normalizeCompanyName, normalizeInvestorName, normalizeRound, parseMoneyToUsdMinorUnits } from "./normalize.js";
import type { ExtractedDeal } from "./types.js";

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrls(text: string): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^\s"'<>)\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    try {
      const u = new URL(m[0]);
      if (!/(twitter|linkedin|facebook|instagram|youtube|google|goo\.gl|t\.co|mailto)/i.test(u.hostname)) {
        out.push(u.toString());
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function pickCompanyWebsite(urls: string[], companyNorm: string | null): string | null {
  if (!companyNorm) return urls[0] ?? null;
  const short = companyNorm.replace(/\s+/g, "");
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      const hnorm = host.replace(/[^a-z0-9]/g, "");
      if (hnorm.includes(short) || short.includes(hnorm.split(".")[0] ?? "")) return u;
    } catch {
      /* skip */
    }
  }
  return urls.find((u) => !/techcrunch|geekwire|alleywatch|startups\.gallery|finsmes|prnewswire|businesswire/i.test(u)) ?? urls[0] ?? null;
}

/** Heuristic extraction from title + HTML/plain body. */
export function extractDeterministic(title: string, bodyHtml: string): ExtractedDeal {
  const body = stripHtml(bodyHtml);
  const blob = `${title}\n${body}`;

  let company_name: string | null = null;
  const t1 = title.match(/^(.+?)\s+(raises|secured|secures|closes|closed|lands|announces|raises:)\s+/i);
  if (t1) company_name = t1[1]!.replace(/\s*[-–—]\s*.*$/, "").trim();
  if (!company_name) {
    const t2 = title.match(/^(.+?)\s+raises\s+\$/i);
    if (t2) company_name = t2[1]!.trim();
  }
  if (!company_name) {
    const t3 = title.match(/^(.+?)\s+lands\s+\$/i);
    if (t3) company_name = t3[1]!.trim();
  }

  const moneyMatch =
    blob.match(/\$\s*[\d,.]+(?:\s*[KMBkmb]|million|billion)?/i) ||
    blob.match(/€\s*[\d,.]+(?:\s*[KMBkmb]|million|billion)?/i) ||
    blob.match(/£\s*[\d,.]+(?:\s*[KMBkmb]|million|billion)?/i);
  const amount_raw = moneyMatch ? moneyMatch[0]!.trim() : null;
  const { amount_minor_units, currency } = parseMoneyToUsdMinorUnits(amount_raw);

  const roundMatch =
    blob.match(/\bSeries\s+[A-Z]\b/i) ||
    blob.match(/\bSeries\s+[A-Z][a-z]+\b/) ||
    blob.match(/\b(Pre[-\s]?Seed|Seed|Series\s+[A-E]|Bridge|Venture)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0]!.trim() : null;
  const round_type_normalized = normalizeRound(round_type_raw);

  const led = body.match(/\bled\s+by\s+([^.\n]+)/i) || body.match(/\bled\s+([^.\n]+)/i);
  const participation =
    body.match(/participation\s+from\s+([^.\n]+)/i) ||
    body.match(/(?:also\s+)?participating(?:\s+investors?)?[:\s]+([^.\n]+)/i) ||
    body.match(/investors?\s+include\s+([^.\n]+)/i);

  const splitInvestors = (s: string) =>
    s
      .split(/,| and |&/i)
      .map((x) => x.replace(/^[\s"'“]+|[\s"'”]+$/g, "").trim())
      .filter(Boolean);

  const lead_investors = led ? splitInvestors(led[1]!) : [];
  const participating_investors = participation ? splitInvestors(participation[1]!) : [];

  const hq =
    body.match(/(?:based|headquartered)\s+in\s+([^.\n]+)/i)?.[1]?.trim() ||
    body.match(/HQ(?:\s+is)?\s+([^.\n]+)/i)?.[1]?.trim() ||
    null;

  const founders: string[] = [];
  const fm = body.match(/\b(?:CEO|CTO|COO|founder|co-founder)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g);
  if (fm) {
    for (const x of fm) {
      const n = x.replace(/^.*?\s+/, "").trim();
      if (n.length > 3 && n.length < 80) founders.push(n);
    }
  }

  const existing = body.match(/existing\s+investors?[:\s]+([^.\n]+)/i)?.[1];
  const existing_investors_mentioned = existing ? splitInvestors(existing) : [];

  const urls = extractUrls(blob);
  const companyNorm = company_name ? normalizeCompanyName(company_name) : null;
  const company_website = pickCompanyWebsite(urls, companyNorm);

  const sector_raw =
    body.match(/\b(fintech|AI|healthtech|enterprise SaaS|consumer|climate|cybersecurity|devtools|biotech)\b/i)?.[1] ?? null;

  let confidence = 0.35;
  if (company_name) confidence += 0.2;
  if (amount_raw) confidence += 0.15;
  if (round_type_raw) confidence += 0.1;
  if (lead_investors.length || participating_investors.length) confidence += 0.15;
  if (company_website) confidence += 0.05;
  confidence = Math.min(0.95, confidence);

  const deal_summary = body.slice(0, 600) || null;

  return {
    company_name,
    company_website,
    company_hq: hq,
    round_type_raw,
    round_type_normalized,
    amount_raw,
    amount_minor_units,
    currency,
    announced_date: null,
    sector_raw,
    sector_normalized: sector_raw,
    founders_mentioned: [...new Set(founders)],
    existing_investors_mentioned,
    deal_summary,
    lead_investors,
    participating_investors,
    extraction_confidence: confidence,
    extraction_method: "regex",
  };
}

export function investorRowsFromExtracted(
  x: ExtractedDeal,
): { role: "LEAD" | "PARTICIPANT" | "EXISTING"; name_raw: string; name_normalized: string; sort_order: number }[] {
  const rows: { role: "LEAD" | "PARTICIPANT" | "EXISTING"; name_raw: string; name_normalized: string; sort_order: number }[] = [];
  let i = 0;
  for (const n of x.lead_investors) {
    rows.push({ role: "LEAD", name_raw: n, name_normalized: normalizeInvestorName(n), sort_order: i++ });
  }
  for (const n of x.participating_investors) {
    rows.push({ role: "PARTICIPANT", name_raw: n, name_normalized: normalizeInvestorName(n), sort_order: i++ });
  }
  for (const n of x.existing_investors_mentioned) {
    rows.push({ role: "EXISTING", name_raw: n, name_normalized: normalizeInvestorName(n), sort_order: i++ });
  }
  return rows;
}
