/**
 * Sync AngelList *Relay* portfolio into Prisma (VCFirm + VCFund + VCInvestment).
 *
 * There is no official `@angel-list/api` npm package and no free “10K+ investors” API.
 * Relay is for *your* portfolio on AngelList Relay: companies + fund names you’re associated with.
 * @see https://docs.angellist.com/docs/endpoints
 *
 * Env:
 *   ANGELLIST_RELAY_API_KEY — from Relay dashboard → API key (header: Authorization: <key>)
 *   DATABASE_URL — same as Prisma
 *
 * Optional:
 *   RELAY_PORTFOLIO_FIRM_SLUG=angellist-relay  (default)
 *   RELAY_FETCH_INVESTMENT_DETAILS=true        — extra request per company for amounts/dates (slower)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const RELAY_BASE = "https://api.relay.angellist.com/v1/external";

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^DATABASE_URL=(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

type RelayFund = { id: string; name: string };
type RelayCompany = {
  id: string;
  legalName: string;
  createdAt?: string;
  funds?: RelayFund[];
};

type CompaniesResponse = {
  data: RelayCompany[];
  total?: number;
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type InvestmentRow = {
  date?: string | null;
  amountCents?: string | null;
  amountCurrency?: string | null;
  round?: string | null;
};

type InvestmentsResponse = {
  data: InvestmentRow[];
};

async function relayFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${RELAY_BASE}${path}`, {
    headers: { Authorization: apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Relay API ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

async function fetchAllCompanies(apiKey: string): Promise<RelayCompany[]> {
  const out: RelayCompany[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page = await relayFetch<CompaniesResponse>(apiKey, `/companies${q}`);
    out.push(...(page.data ?? []));
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

async function fetchCompanyInvestments(apiKey: string, companyId: string): Promise<InvestmentRow[]> {
  const rows: InvestmentRow[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page = await relayFetch<InvestmentsResponse>(apiKey, `/company/${companyId}/investments${q}`);
    rows.push(...(page.data ?? []));
    const next = (page as { hasNextPage?: boolean; nextCursor?: string | null }).nextCursor;
    const hasNext = (page as { hasNextPage?: boolean }).hasNextPage;
    if (!hasNext || !next) break;
    cursor = next;
  } while (cursor);
  return rows;
}

function centsToUsd(cents: string | undefined): number | undefined {
  if (cents == null || cents === "") return undefined;
  const n = Number(cents);
  if (!Number.isFinite(n)) return undefined;
  return n / 100;
}

async function main() {
  loadDatabaseUrl();
  const apiKey = process.env.ANGELLIST_RELAY_API_KEY?.trim();
  if (!apiKey) {
    console.error("Missing ANGELLIST_RELAY_API_KEY. Generate a key in AngelList Relay → API (see https://docs.angellist.com/docs/endpoints).");
    process.exit(1);
  }

  const slug = (process.env.RELAY_PORTFOLIO_FIRM_SLUG ?? "angellist-relay").trim() || "angellist-relay";
  const withDetails = process.env.RELAY_FETCH_INVESTMENT_DETAILS === "true";

  const prisma = new PrismaClient();
  const companies = await fetchAllCompanies(apiKey);
  console.log(`Relay: fetched ${companies.length} portfolio compan(y/ies).`);

  let firm = await prisma.vCFirm.findFirst({ where: { slug, deleted_at: null } });
  if (!firm) {
    firm = await prisma.vCFirm.create({
      data: {
        firm_name: "AngelList Relay (imported)",
        slug,
        description: "Synthetic firm row grouping Relay portfolio imports. Not a single GP — safe holder for synced funds/investments.",
        firm_type: "ANGEL_NETWORK",
        angellist_url: "https://angellist.com/",
      },
    });
    console.log(`Created VCFirm ${firm.id} slug=${slug}`);
  }

  const fundIdByRelayId = new Map<string, string>();

  async function ensureFund(relayFund: RelayFund): Promise<string> {
    const cached = fundIdByRelayId.get(relayFund.id);
    if (cached) return cached;
    const existing = await prisma.vCFund.findFirst({
      where: {
        firm_id: firm!.id,
        fund_name: relayFund.name,
        deleted_at: null,
      },
    });
    if (existing) {
      fundIdByRelayId.set(relayFund.id, existing.id);
      return existing.id;
    }
    const created = await prisma.vCFund.create({
      data: {
        firm_id: firm!.id,
        fund_name: relayFund.name,
        fund_status: "ACTIVE",
        fund_type: "SYNDICATE",
        focus_summary: `Imported from AngelList Relay (fund id ${relayFund.id})`,
      },
    });
    fundIdByRelayId.set(relayFund.id, created.id);
    return created.id;
  }

  let investmentsUpserted = 0;

  for (const c of companies) {
    const funds = c.funds?.length ? c.funds : [{ id: "default", name: "Unspecified fund" }];
    let detail: InvestmentRow | undefined;
    if (withDetails) {
      try {
        const inv = await fetchCompanyInvestments(apiKey, c.id);
        detail = inv[0];
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        console.warn(`  skip investments for ${c.legalName}:`, (e as Error).message);
      }
    }

    for (const rf of funds) {
      const fundId = await ensureFund(rf);
      const companyName = c.legalName?.trim() || "Unknown company";
      const existing = await prisma.vCInvestment.findFirst({
        where: {
          firm_id: firm!.id,
          fund_id: fundId,
          company_name: companyName,
          deleted_at: null,
        },
      });

      const checkUsd = detail ? centsToUsd(detail.amountCents) : undefined;
      const invDate = detail?.date ? new Date(detail.date) : undefined;

      if (existing) {
        await prisma.vCInvestment.update({
          where: { id: existing.id },
          data: {
            check_size_usd: checkUsd ?? existing.check_size_usd,
            investment_date: invDate ?? existing.investment_date,
            round_type: detail?.round ?? existing.round_type,
            current_status: "ACTIVE",
          },
        });
      } else {
        await prisma.vCInvestment.create({
          data: {
            firm_id: firm!.id,
            fund_id: fundId,
            company_name: companyName,
            check_size_usd: checkUsd,
            investment_date: invDate,
            round_type: detail?.round ?? null,
            current_status: "ACTIVE",
          },
        });
      }
      investmentsUpserted += 1;
    }
  }

  console.log(`Done. Funds in map: ${fundIdByRelayId.size}, investment rows touched: ${investmentsUpserted}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
