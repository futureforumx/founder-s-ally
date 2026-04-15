/**
 * Backfill public.organizations "fundingStatus", "vcBacked", "investmentStage".
 *
 * Sources (in order of evidence merged with existing row — strongest funding signal wins):
 * 1. firm_recent_deals — normalized company name + portfolio_company_website host;
 *    investment_status (acquired / ipo), stage, amount.
 * 2. portfolio_companies view — unnested investormatch_vc_firms.portfolio (name, website, stage, investment_status).
 * 3. operator_companies — same website host as organization → stage, funding_status (optional; skipped if table/columns missing).
 * 4. YC — if isYcBacked or ycBatch is set and funding is still unknown after 1–3, set vc_backed.
 *
 * investmentStage is only persisted when mapped to a non-unknown enum value; otherwise NULL
 * (UI then falls back to sector/YC-derived stage line).
 *
 * Env:
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DRY_RUN=1 — compute patches but do not write
 *   BACKFILL_ORGS_SCOPE=live|all  (default live = ready_for_live true only)
 *
 * Recommended migration order:
 *   20260418120000_organizations_funding_vc_stage.sql
 *   → run this script
 *   → 20260418140000_organizations_funding_enum_normalize.sql
 *
 *   If CHECK constraints are already applied, this script only writes enum-safe values.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import {
  normalizeFundingStatus,
  normalizeInvestmentStage,
  pickLaterInvestmentStage,
  fundingStatusFromPortfolioInvestmentStatus,
  displayFundingStatus,
  displayInvestmentStage,
  type FundingStatus,
  type InvestmentStage,
} from "../src/lib/organizationFundingEnums";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());
const SCOPE = (process.env.BACKFILL_ORGS_SCOPE || "live").toLowerCase() === "all" ? "all" : "live";

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

const FUNDING_RANK: Record<FundingStatus, number> = {
  unknown: 0,
  bootstrapped: 2,
  vc_backed: 3,
  acquired: 4,
  public: 5,
};

function maxFunding(a: FundingStatus, b: FundingStatus): FundingStatus {
  return FUNDING_RANK[a] >= FUNDING_RANK[b] ? a : b;
}

function normalizeCompanyName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function fundingFromPortfolioRow(
  investmentStatus: string | null | undefined,
  stage: string | null | undefined,
  amount: string | null | undefined,
): FundingStatus {
  const fs = fundingStatusFromPortfolioInvestmentStatus(investmentStatus ?? undefined);
  if (fs === "public" || fs === "acquired") return fs;
  const inv = (investmentStatus ?? "").trim().toLowerCase();
  const st = (stage ?? "").trim();
  const am = (amount ?? "").trim();
  if (st || am) return "vc_backed";
  if (inv === "active") return "vc_backed";
  return "unknown";
}

type RowContrib = { funding: FundingStatus; stage: InvestmentStage };

function contribFromSource(
  investmentStatus: string | null | undefined,
  stage: string | null | undefined,
  amount: string | null | undefined,
): RowContrib {
  let funding = fundingFromPortfolioRow(investmentStatus, stage, amount);
  const stageN = normalizeInvestmentStage(stage);
  if (funding === "unknown" && stageN !== "unknown") funding = "vc_backed";
  return { funding, stage: stageN };
}

function operatorStageToFunding(stageRaw: string | null | undefined): FundingStatus | null {
  const u = (stageRaw ?? "").trim().toUpperCase().replace(/-/g, "_");
  if (u === "PUBLIC") return "public";
  if (u === "ACQUIRED") return "acquired";
  if (u === "BOOTSTRAPPED") return "bootstrapped";
  if (!u || u === "UNKNOWN" || u === "SHUTDOWN") return null;
  return "vc_backed";
}

function operatorStageToRound(stageRaw: string | null | undefined): InvestmentStage {
  const u = (stageRaw ?? "").trim().toUpperCase();
  if (!u || ["PUBLIC", "ACQUIRED", "BOOTSTRAPPED", "SHUTDOWN", "UNKNOWN"].includes(u)) return "unknown";
  return normalizeInvestmentStage(stageRaw!.replace(/_/g, " "));
}

function mergeContribs(rows: RowContrib[]): { funding: FundingStatus; stage: InvestmentStage } {
  let funding: FundingStatus = "unknown";
  let stage: InvestmentStage = "unknown";
  for (const r of rows) {
    funding = maxFunding(funding, r.funding);
    stage = pickLaterInvestmentStage(stage, r.stage);
  }
  return { funding, stage };
}

function vcBackedFor(funding: FundingStatus): boolean | null {
  if (funding === "bootstrapped") return false;
  if (funding === "vc_backed" || funding === "acquired" || funding === "public") return true;
  return null;
}

type OrgRow = {
  id: string;
  canonicalName: string | null;
  website: string | null;
  fundingStatus: string | null;
  vcBacked: boolean | null;
  investmentStage: string | null;
  isYcBacked: boolean | null;
  ycBatch: string | null;
  ready_for_live: boolean | null;
};

async function fetchPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  const page = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(from, from + page - 1);
    if (error) throw new Error(error.message || String(error));
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

function coverage(orgs: OrgRow[]) {
  const byFs = new Map<string, number>();
  let vcTrue = 0;
  let vcFalse = 0;
  let vcNull = 0;
  const bySt = new Map<string, number>();
  let stageEmpty = 0;
  let fundingUnknown = 0;

  for (const o of orgs) {
    const fs = (o.fundingStatus && String(o.fundingStatus).trim()) || "null";
    byFs.set(fs, (byFs.get(fs) ?? 0) + 1);
    if (o.vcBacked === true) vcTrue++;
    else if (o.vcBacked === false) vcFalse++;
    else vcNull++;

    const st = (o.investmentStage && String(o.investmentStage).trim()) || "";
    if (!st) {
      stageEmpty++;
    } else {
      bySt.set(st, (bySt.get(st) ?? 0) + 1);
    }

    const nf = normalizeFundingStatus(o.fundingStatus);
    if (nf === "unknown") fundingUnknown++;
  }

  return {
    total: orgs.length,
    byFundingStatus: Object.fromEntries([...byFs.entries()].sort((a, b) => b[1] - a[1])),
    vcBacked: { true: vcTrue, false: vcFalse, null: vcNull },
    byInvestmentStage: Object.fromEntries([...bySt.entries()].sort((a, b) => b[1] - a[1])),
    stageNullOrEmpty: stageEmpty,
    fundingStatusUnknown: fundingUnknown,
  };
}

type Patch = { id: string; fundingStatus: string; vcBacked: boolean | null; investmentStage: string | null };

function derivePatch(org: OrgRow, byName: Map<string, RowContrib[]>, byHost: Map<string, RowContrib[]>): Patch | null {
  const normName = normalizeCompanyName(org.canonicalName);
  const host = hostFromUrl(org.website);

  const contribs: RowContrib[] = [];
  if (normName) {
    const a = byName.get(normName);
    if (a) contribs.push(...a);
  }
  if (host) {
    const b = byHost.get(host);
    if (b) contribs.push(...b);
  }

  let funding = normalizeFundingStatus(org.fundingStatus);
  let stage = normalizeInvestmentStage(org.investmentStage ?? "");

  if (contribs.length) {
    const m = mergeContribs(contribs);
    funding = maxFunding(funding, m.funding);
    stage = pickLaterInvestmentStage(stage, m.stage);
  }

  if (funding === "unknown" && (org.isYcBacked === true || !!(org.ycBatch && org.ycBatch.trim()))) {
    funding = "vc_backed";
  }

  const outStage = stage === "unknown" ? null : stage;
  const outVc = vcBackedFor(funding);

  const curFs = normalizeFundingStatus(org.fundingStatus);
  const curSt = normalizeInvestmentStage(org.investmentStage ?? "");
  const curStOut = curSt === "unknown" ? null : curSt;
  const curVc = org.vcBacked === true ? true : org.vcBacked === false ? false : null;

  const sameFs = curFs === funding;
  const sameSt = curStOut === outStage;
  const sameVc = curVc === outVc;

  if (sameFs && sameSt && sameVc) return null;

  return {
    id: org.id,
    fundingStatus: funding,
    vcBacked: outVc,
    investmentStage: outStage,
  };
}

function typeLineForSample(fs: string | null, vc: boolean | null, ycBatch: string | null, isYc: boolean | null): string {
  const base = displayFundingStatus(fs, vc);
  if (base !== "Unknown") return base;
  if (isYc === true || !!(ycBatch && ycBatch.trim())) return "VC-backed";
  return "Unknown";
}

async function main() {
  console.log(`[backfill-organization-funding] DRY_RUN=${DRY} SCOPE=${SCOPE}`);

  const orgs = await fetchPaged<OrgRow>(async (from, to) => {
    let q = sb
      .from("organizations")
      .select(
        "id, canonicalName, website, fundingStatus, vcBacked, investmentStage, isYcBacked, ycBatch, ready_for_live",
      )
      .range(from, to);
    if (SCOPE === "live") q = q.eq("ready_for_live", true);
    return await q;
  });

  const deals = await fetchPaged<Record<string, string | null>>(async (from, to) => {
    return await sb
      .from("firm_recent_deals")
      .select("company_name, normalized_company_name, stage, amount, investment_status, portfolio_company_website")
      .range(from, to);
  });

  let portfolioRows: Record<string, string | null>[] = [];
  const pcRes = await sb.from("portfolio_companies").select("company_name, company_website, stage, investment_status").limit(1);
  if (pcRes.error) {
    console.warn("[backfill] portfolio_companies:", pcRes.error.message);
  } else {
    portfolioRows = await fetchPaged(async (from, to) => {
      return await sb
        .from("portfolio_companies")
        .select("company_name, company_website, stage, investment_status")
        .range(from, to);
    });
  }

  const byName = new Map<string, RowContrib[]>();
  const byHost = new Map<string, RowContrib[]>();

  function addContrib(nameKey: string | null, website: string | null, c: RowContrib) {
    if (nameKey) {
      const arr = byName.get(nameKey) ?? [];
      arr.push(c);
      byName.set(nameKey, arr);
    }
    const h = hostFromUrl(website);
    if (h) {
      const arr2 = byHost.get(h) ?? [];
      arr2.push(c);
      byHost.set(h, arr2);
    }
  }

  const opProbe = await sb.from("operator_companies").select("domain, stage").limit(1);
  if (opProbe.error) {
    console.warn("[backfill] operator_companies:", opProbe.error.message);
  } else {
    const opRows = await fetchPaged<{ domain: string | null; stage: string | null }>(async (from, to) => {
      return await sb.from("operator_companies").select("domain, stage").not("domain", "is", null).range(from, to);
    });
    for (const r of opRows) {
      const d = (r.domain ?? "").trim().toLowerCase();
      if (!d) continue;
      const opSt = operatorStageToRound(r.stage);
      const opFsFromStage = operatorStageToFunding(r.stage);
      let funding: FundingStatus = "unknown";
      if (opFsFromStage) funding = maxFunding(funding, opFsFromStage);
      const row: RowContrib = { funding, stage: opSt };
      addContrib(null, `https://${d}`, row);
    }
  }

  for (const d of deals) {
    const nk = normalizeCompanyName((d.normalized_company_name as string) || (d.company_name as string));
    const c = contribFromSource(
      d.investment_status as string,
      d.stage as string,
      d.amount as string,
    );
    addContrib(nk || null, d.portfolio_company_website as string, c);
  }

  for (const p of portfolioRows) {
    const nk = normalizeCompanyName(p.company_name as string);
    const c = contribFromSource(p.investment_status as string, p.stage as string, null);
    addContrib(nk || null, p.company_website as string, c);
  }

  const before = coverage(orgs);

  const patches: Patch[] = [];
  for (const o of orgs) {
    const p = derivePatch(o, byName, byHost);
    if (p) patches.push(p);
  }

  const patchById = new Map(patches.map((p) => [p.id, p]));
  const simulated: OrgRow[] = orgs.map((o) => {
    const p = patchById.get(o.id);
    if (!p) return o;
    return {
      ...o,
      fundingStatus: p.fundingStatus,
      vcBacked: p.vcBacked,
      investmentStage: p.investmentStage,
    };
  });
  const after = coverage(simulated);

  const samples = patches.slice(0, 8).map((p) => {
    const prev = orgs.find((x) => x.id === p.id)!;
    return {
      id: p.id,
      name: prev.canonicalName,
      website: prev.website,
      before: {
        fundingStatus: prev.fundingStatus,
        vcBacked: prev.vcBacked,
        investmentStage: prev.investmentStage,
        typeLine: typeLineForSample(prev.fundingStatus, prev.vcBacked, prev.ycBatch, prev.isYcBacked),
        stageLine: prev.investmentStage?.trim()
          ? displayInvestmentStage(prev.investmentStage)
          : `(fallback) ${prev.ycBatch || "—"}`,
      },
      after: {
        fundingStatus: p.fundingStatus,
        vcBacked: p.vcBacked,
        investmentStage: p.investmentStage,
        typeLine: typeLineForSample(p.fundingStatus, p.vcBacked, prev.ycBatch, prev.isYcBacked),
        stageLine: p.investmentStage?.trim()
          ? displayInvestmentStage(p.investmentStage)
          : `(fallback) ${prev.ycBatch || "—"}`,
      },
    };
  });

  console.log(
    JSON.stringify(
      {
        organizationsScope: SCOPE,
        evidence: {
          firm_recent_deals: deals.length,
          portfolio_companies: portfolioRows.length,
        },
        coverageBefore: before,
        coverageAfterSimulated: after,
        patchCount: patches.length,
        sampleFooterRows: samples,
      },
      null,
      2,
    ),
  );

  if (DRY) {
    console.log("[backfill] DRY_RUN: no database writes.");
    return;
  }

  let ok = 0;
  let err = 0;
  for (const p of patches) {
    const { error } = await sb
      .from("organizations")
      .update({
        fundingStatus: p.fundingStatus,
        vcBacked: p.vcBacked,
        investmentStage: p.investmentStage,
      })
      .eq("id", p.id);
    if (error) {
      err++;
      console.warn(`[backfill] update ${p.id}:`, error.message);
    } else ok++;
  }
  console.log(JSON.stringify({ updated: ok, errors: err }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
