import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const KNOWN_ROUNDS = new Set([
  "pre-seed",
  "preseed",
  "seed",
  "series a",
  "series b",
  "series c",
  "series c+",
  "series d",
  "series e",
  "growth",
  "bridge",
  "angel",
  "accelerator",
  "pre seed",
]);

export type CompanyInvestorRow = {
  id: string | null;
  firm_id: string;
  firm_name: string | null;
  firm_investor_id: string | null;
  investor_name: string | null;
  investor_title: string | null;
  round_name: string | null;
  amount_usd: number | null;
  amount_label: string | null;
  portfolio_note: string | null;
  led_round: boolean;
};

type StartupSnap = {
  id: string;
  company_name: string;
  company_url: string | null;
  linkedin_url: string | null;
  sector: string | null;
  investor_names: string[] | null;
  deleted_at: string | null;
};

function normalizePortfolioName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function roundKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function asUsd(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isKnownRound(value: string | null | undefined): boolean {
  const key = roundKey(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return KNOWN_ROUNDS.has(key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatInvestmentAmount(amountUsd: number): string {
  const abs = Math.abs(amountUsd);
  const sign = amountUsd < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${trimNum(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}$${trimNum(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trimNum(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function hostFromUrl(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

function relationshipKey(row: Pick<CompanyInvestorRow, "firm_id" | "round_name" | "firm_investor_id">): string {
  return `${row.firm_id}|${roundKey(row.round_name)}|${row.firm_investor_id ?? ""}`;
}

async function firmNameMap(db: SupabaseClient, firmIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = [...new Set(firmIds.filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await db.from("firm_records").select("id, firm_name").in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const rec = row as { id?: string; firm_name?: string | null };
    if (rec.id) map.set(rec.id, rec.firm_name ?? null);
  }
  return map;
}

export async function listCompanyInvestors(
  db: SupabaseClient,
  startupId: string,
): Promise<{ rows: CompanyInvestorRow[] } | { error: string; status: number }> {
  const { data: startup, error: startupErr } = await db
    .from("startups")
    .select("id, company_name, deleted_at")
    .eq("id", startupId)
    .maybeSingle();
  if (startupErr) return { error: startupErr.message, status: 500 };
  if (!startup || (startup as { deleted_at?: string | null }).deleted_at) {
    return { error: "Company not found", status: 404 };
  }

  const companyName = String((startup as { company_name?: string }).company_name ?? "").trim();
  const norm = normalizePortfolioName(companyName);

  const [linksRes, dealsByName, dealsByStartup, portfolioCompany] = await Promise.all([
    db.from("startup_investment_links")
      .select("id, firm_id, firm_investor_id, round_name, amount_usd, led_round")
      .eq("startup_id", startupId),
    norm
      ? db.from("firm_recent_deals")
        .select("id, firm_id, stage, amount, raw_payload, led_rounds")
        .eq("normalized_company_name", norm)
      : Promise.resolve({ data: [], error: null }),
    db.from("firm_recent_deals")
      .select("id, firm_id, stage, amount, raw_payload, led_rounds")
      .contains("raw_payload", { startup_id: startupId }),
    norm
      ? db.from("portfolio_companies").select("id").eq("normalized_name", norm).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (linksRes.error) return { error: linksRes.error.message, status: 500 };
  if (dealsByName.error) return { error: dealsByName.error.message, status: 500 };
  if (dealsByStartup.error) return { error: dealsByStartup.error.message, status: 500 };
  if (portfolioCompany.error) return { error: portfolioCompany.error.message, status: 500 };

  const portfolioCompanyId = (portfolioCompany.data as { id?: string } | null)?.id ?? null;
  const investmentsRes = portfolioCompanyId
    ? await db.from("portfolio_investments")
      .select("id, firm_id, round_type, check_size_usd, led_round")
      .eq("portfolio_company_id", portfolioCompanyId)
    : { data: [], error: null };
  if (investmentsRes.error) return { error: investmentsRes.error.message, status: 500 };

  const safeName = companyName && !/[,{}]/.test(companyName) ? companyName : "";
  const peopleRes = safeName
    ? await db.from("firm_investors")
      .select("id, full_name, title, firm_id")
      .contains("portfolio_companies", [companyName])
      .is("deleted_at", null)
      .limit(40)
    : { data: [], error: null };
  if (peopleRes.error) return { error: peopleRes.error.message, status: 500 };

  const links = (linksRes.data ?? []) as Array<{
    id: string;
    firm_id: string;
    firm_investor_id: string | null;
    round_name: string | null;
    amount_usd: number | null;
    led_round: boolean | null;
  }>;
  const investorIds = links.map((row) => row.firm_investor_id).filter((id): id is string => Boolean(id));
  const investorNames = new Map<string, { name: string; title: string | null }>();
  if (investorIds.length) {
    const { data: investors, error } = await db
      .from("firm_investors")
      .select("id, full_name, title")
      .in("id", investorIds);
    if (error) return { error: error.message, status: 500 };
    for (const row of investors ?? []) {
      const rec = row as { id?: string; full_name?: string; title?: string | null };
      if (rec.id) investorNames.set(rec.id, { name: rec.full_name ?? "", title: rec.title ?? null });
    }
  }

  const dealRows = new Map<string, { id: string; firm_id: string; stage: string | null; amount: string | null; led_rounds: string[] }>();
  for (const row of [...(dealsByName.data ?? []), ...(dealsByStartup.data ?? [])]) {
    const rec = row as { id?: string; firm_id?: string; stage?: string | null; amount?: string | null; led_rounds?: unknown };
    if (rec.id && rec.firm_id) dealRows.set(rec.id, {
      id: rec.id,
      firm_id: rec.firm_id,
      stage: rec.stage ?? null,
      amount: rec.amount ?? null,
      led_rounds: Array.isArray(rec.led_rounds) ? rec.led_rounds.filter((item): item is string => typeof item === "string") : [],
    });
  }

  const investmentRows = (investmentsRes.data ?? []) as Array<{
    firm_id?: string;
    round_type?: string | null;
    check_size_usd?: number | null;
    led_round?: boolean | null;
  }>;
  const portfolioLed = new Set(
    investmentRows
      .filter((row) => row.firm_id && row.led_round)
      .map((row) => `${row.firm_id}|${roundKey(row.round_type)}`),
  );
  const dealLed = new Set<string>();
  for (const deal of dealRows.values()) {
    for (const name of deal.led_rounds) dealLed.add(`${deal.firm_id}|${roundKey(name)}`);
  }

  const firmIds = [
    ...links.map((row) => row.firm_id),
    ...[...dealRows.values()].map((row) => row.firm_id),
    ...((investmentsRes.data ?? []) as Array<{ firm_id?: string }>).map((row) => row.firm_id ?? ""),
    ...((peopleRes.data ?? []) as Array<{ firm_id?: string }>).map((row) => row.firm_id ?? ""),
  ];
  let names: Map<string, string | null>;
  try {
    names = await firmNameMap(db, firmIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 500 };
  }

  const rows: CompanyInvestorRow[] = [];
  const keys = new Set<string>();
  const firmsSeen = new Set<string>();

  const add = (row: CompanyInvestorRow) => {
    const key = relationshipKey(row);
    if (keys.has(key)) return;
    keys.add(key);
    firmsSeen.add(row.firm_id);
    rows.push(row);
  };

  const roundIsLed = (firmId: string, roundName: string | null, linkFlag: boolean | null) => {
    const key = `${firmId}|${roundKey(roundName)}`;
    return Boolean(linkFlag) || portfolioLed.has(key) || dealLed.has(key);
  };

  for (const link of links) {
    const person = link.firm_investor_id ? investorNames.get(link.firm_investor_id) : undefined;
    add({
      id: link.id,
      firm_id: link.firm_id,
      firm_name: names.get(link.firm_id) ?? null,
      firm_investor_id: link.firm_investor_id,
      investor_name: person?.name ?? null,
      investor_title: person?.title ?? null,
      round_name: link.round_name,
      amount_usd: asUsd(link.amount_usd),
      amount_label: asUsd(link.amount_usd) != null ? formatInvestmentAmount(asUsd(link.amount_usd)!) : null,
      portfolio_note: null,
      led_round: roundIsLed(link.firm_id, link.round_name, link.led_round),
    });
  }

  for (const investment of investmentRows) {
    if (!investment.firm_id) continue;
    const amount = asUsd(investment.check_size_usd);
    add({
      id: null,
      firm_id: investment.firm_id,
      firm_name: names.get(investment.firm_id) ?? null,
      firm_investor_id: null,
      investor_name: null,
      investor_title: null,
      round_name: investment.round_type ?? null,
      amount_usd: amount,
      amount_label: amount != null ? formatInvestmentAmount(amount) : null,
      portfolio_note: null,
      led_round: roundIsLed(investment.firm_id, investment.round_type ?? null, investment.led_round),
    });
  }

  for (const deal of dealRows.values()) {
    if (firmsSeen.has(deal.firm_id)) continue;
    const stage = deal.stage?.trim() || null;
    const round = stage && isKnownRound(stage) ? stage : null;
    add({
      id: null,
      firm_id: deal.firm_id,
      firm_name: names.get(deal.firm_id) ?? null,
      firm_investor_id: null,
      investor_name: null,
      investor_title: null,
      round_name: round,
      amount_usd: null,
      amount_label: deal.amount?.trim() || null,
      portfolio_note: stage && !round ? stage : null,
      led_round: round ? roundIsLed(deal.firm_id, round, false) : false,
    });
  }

  for (const person of (peopleRes.data ?? []) as Array<{ id?: string; full_name?: string; title?: string | null; firm_id?: string }>) {
    if (!person.id || !person.firm_id) continue;
    const already = rows.some((row) => row.firm_id === person.firm_id && row.firm_investor_id === person.id);
    if (already) continue;
    add({
      id: null,
      firm_id: person.firm_id,
      firm_name: names.get(person.firm_id) ?? null,
      firm_investor_id: person.id,
      investor_name: person.full_name ?? null,
      investor_title: person.title ?? null,
      round_name: null,
      amount_usd: null,
      amount_label: null,
      portfolio_note: null,
      led_round: false,
    });
  }

  rows.sort((a, b) => (a.firm_name ?? "").localeCompare(b.firm_name ?? "") || (a.investor_name ?? "").localeCompare(b.investor_name ?? ""));
  return { rows };
}

async function upsertPortfolioDeal(
  db: SupabaseClient,
  args: {
    firmId: string;
    startupId: string;
    companyName: string;
    website: string | null;
    linkedin: string | null;
    sector: string | null;
    roundName: string | null;
    amountUsd: number | null;
    firmInvestorId: string | null;
    investorName: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const norm = normalizePortfolioName(args.companyName);
  const { data: existing, error } = await db
    .from("firm_recent_deals")
    .select("id, stage, amount, raw_payload, portfolio_company_website, portfolio_company_linkedin")
    .eq("firm_id", args.firmId)
    .eq("normalized_company_name", norm)
    .maybeSingle();
  if (error) return { error: error.message };

  const current = existing as {
    id?: string;
    stage?: string | null;
    portfolio_company_website?: string | null;
    portfolio_company_linkedin?: string | null;
    raw_payload?: unknown;
  } | null;
  const payload: Record<string, unknown> = {
    ...asRecord(current?.raw_payload),
    startup_id: args.startupId,
    round: args.roundName,
    firm_investor_id: args.firmInvestorId,
    investor_name: args.investorName,
    linked_via: "admin_company_investors",
  };
  if (args.amountUsd != null) payload.amount_usd = args.amountUsd;
  const now = new Date().toISOString();
  const amountLabel = args.amountUsd != null ? formatInvestmentAmount(args.amountUsd) : null;

  if (current?.id) {
    const patch: Record<string, unknown> = { updated_at: now, raw_payload: payload };
    if (amountLabel) patch.amount = amountLabel;
    if (args.roundName && (!current.stage?.trim() || isKnownRound(current.stage))) patch.stage = args.roundName;
    if (!current.portfolio_company_website && args.website) patch.portfolio_company_website = args.website;
    if (!current.portfolio_company_linkedin && args.linkedin) patch.portfolio_company_linkedin = args.linkedin;
    const { error: upErr } = await db.from("firm_recent_deals").update(patch).eq("id", current.id);
    if (upErr) return { error: upErr.message };
    return { id: current.id };
  }

  const { data: inserted, error: insErr } = await db
    .from("firm_recent_deals")
    .insert({
      firm_id: args.firmId,
      company_name: args.companyName,
      normalized_company_name: norm,
      stage: args.roundName || args.sector,
      amount: amountLabel,
      investment_status: "active",
      is_notable: false,
      source_name: "manual",
      source_confidence: 1,
      portfolio_company_website: args.website,
      portfolio_company_linkedin: args.linkedin,
      raw_payload: payload,
      updated_at: now,
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };
  return { id: (inserted as { id: string }).id };
}

async function upsertPortfolioInvestment(
  db: SupabaseClient,
  args: {
    firmId: string;
    companyName: string;
    website: string | null;
    linkedin: string | null;
    sector: string | null;
    roundName: string | null;
    amountUsd: number | null;
  },
): Promise<{ id: string } | { error: string }> {
  const norm = normalizePortfolioName(args.companyName);
  const { data: existingCompany, error: companyErr } = await db
    .from("portfolio_companies")
    .select("id")
    .eq("normalized_name", norm)
    .maybeSingle();
  if (companyErr) return { error: companyErr.message };

  let portfolioCompanyId = (existingCompany as { id?: string } | null)?.id ?? null;
  if (!portfolioCompanyId) {
    const { data: inserted, error } = await db
      .from("portfolio_companies")
      .insert({
        company_name: args.companyName,
        normalized_name: norm,
        company_url: args.website,
        domain: hostFromUrl(args.website),
        linkedin_url: args.linkedin,
        sector: args.sector,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    portfolioCompanyId = (inserted as { id: string }).id;
  }

  const { data: investments, error: listErr } = await db
    .from("portfolio_investments")
    .select("id, round_type, check_size_usd")
    .eq("firm_id", args.firmId)
    .eq("portfolio_company_id", portfolioCompanyId);
  if (listErr) return { error: listErr.message };

  const match = ((investments ?? []) as Array<{ id: string; round_type: string | null; check_size_usd: number | null }>)
    .find((row) => roundKey(row.round_type) === roundKey(args.roundName));
  const now = new Date().toISOString();
  if (match) {
    const patch: Record<string, unknown> = { updated_at: now, confidence: 0.95 };
    if (args.amountUsd != null) patch.check_size_usd = args.amountUsd;
    if (args.roundName) patch.round_type = args.roundName;
    const { error } = await db.from("portfolio_investments").update(patch).eq("id", match.id);
    if (error) return { error: error.message };
    return { id: match.id };
  }

  const { data: inserted, error } = await db
    .from("portfolio_investments")
    .insert({
      firm_id: args.firmId,
      portfolio_company_id: portfolioCompanyId,
      round_type: args.roundName,
      check_size_usd: args.amountUsd,
      confidence: 0.95,
      led_round: false,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (inserted as { id: string }).id };
}

async function attachCompanyToPerson(db: SupabaseClient, investorId: string, companyName: string): Promise<string | null> {
  const { data, error } = await db
    .from("firm_investors")
    .select("portfolio_companies")
    .eq("id", investorId)
    .maybeSingle();
  if (error) return error.message;
  const current = Array.isArray((data as { portfolio_companies?: unknown } | null)?.portfolio_companies)
    ? ((data as { portfolio_companies: unknown[] }).portfolio_companies.filter((item) => typeof item === "string") as string[])
    : [];
  const norm = normalizePortfolioName(companyName);
  if (current.some((item) => normalizePortfolioName(item) === norm)) return null;
  const { error: upErr } = await db
    .from("firm_investors")
    .update({ portfolio_companies: [...current, companyName], updated_at: new Date().toISOString() })
    .eq("id", investorId);
  return upErr?.message ?? null;
}

function parseAmount(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function ledRoundNames(current: unknown, roundName: string, led: boolean): string[] {
  const list = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  const without = list.filter((item) => roundKey(item) !== roundKey(roundName));
  return led ? [...without, roundName] : without;
}

async function loadCompanyDeals(
  db: SupabaseClient,
  companyName: string,
  startupId: string,
): Promise<{ rows: Array<{ id: string; firm_id: string; led_rounds: string[] }>; error?: string }> {
  const norm = normalizePortfolioName(companyName);
  const [byName, byStartup] = await Promise.all([
    norm
      ? db.from("firm_recent_deals").select("id, firm_id, led_rounds").eq("normalized_company_name", norm)
      : Promise.resolve({ data: [], error: null }),
    db.from("firm_recent_deals").select("id, firm_id, led_rounds").contains("raw_payload", { startup_id: startupId }),
  ]);
  if (byName.error) return { rows: [], error: byName.error.message };
  if (byStartup.error) return { rows: [], error: byStartup.error.message };
  const map = new Map<string, { id: string; firm_id: string; led_rounds: string[] }>();
  for (const row of [...(byName.data ?? []), ...(byStartup.data ?? [])]) {
    const rec = row as { id?: string; firm_id?: string; led_rounds?: unknown };
    if (!rec.id || !rec.firm_id) continue;
    map.set(rec.id, {
      id: rec.id,
      firm_id: rec.firm_id,
      led_rounds: Array.isArray(rec.led_rounds)
        ? rec.led_rounds.filter((item): item is string => typeof item === "string")
        : [],
    });
  }
  return { rows: [...map.values()] };
}

/** Sets whether this firm led one round. Does not delete links, rounds, or the portfolio company. */
async function syncRoundLead(
  db: SupabaseClient,
  args: {
    startupId: string;
    firmId: string;
    companyName: string;
    roundName: string;
    led: boolean;
  },
): Promise<string | null> {
  const round = roundKey(args.roundName);
  if (!round) return null;
  const now = new Date().toISOString();

  const { data: linkData, error: linkErr } = await db
    .from("startup_investment_links")
    .select("id, firm_id, round_name")
    .eq("startup_id", args.startupId);
  if (linkErr) return linkErr.message;
  const linkRows = (linkData ?? []) as Array<{ id: string; firm_id: string; round_name: string | null }>;
  const ours = linkRows
    .filter((row) => row.firm_id === args.firmId && roundKey(row.round_name) === round)
    .map((row) => row.id);
  const others = args.led
    ? linkRows
      .filter((row) => row.firm_id !== args.firmId && roundKey(row.round_name) === round)
      .map((row) => row.id)
    : [];
  if (ours.length) {
    const { error } = await db.from("startup_investment_links").update({ led_round: args.led, updated_at: now }).in("id", ours);
    if (error) return error.message;
  }
  if (others.length) {
    const { error } = await db.from("startup_investment_links").update({ led_round: false, updated_at: now }).in("id", others);
    if (error) return error.message;
  }

  const norm = normalizePortfolioName(args.companyName);
  const { data: portfolioCompany, error: companyErr } = await db
    .from("portfolio_companies")
    .select("id")
    .eq("normalized_name", norm)
    .maybeSingle();
  if (companyErr) return companyErr.message;
  const portfolioCompanyId = (portfolioCompany as { id?: string } | null)?.id ?? null;
  if (portfolioCompanyId) {
    const { data: investments, error: invErr } = await db
      .from("portfolio_investments")
      .select("id, firm_id, round_type")
      .eq("portfolio_company_id", portfolioCompanyId);
    if (invErr) return invErr.message;
    const invRows = (investments ?? []) as Array<{ id: string; firm_id: string; round_type: string | null }>;
    const ourInv = invRows
      .filter((row) => row.firm_id === args.firmId && roundKey(row.round_type) === round)
      .map((row) => row.id);
    const otherInv = args.led
      ? invRows
        .filter((row) => row.firm_id !== args.firmId && roundKey(row.round_type) === round)
        .map((row) => row.id)
      : [];
    if (ourInv.length) {
      const { error } = await db.from("portfolio_investments").update({ led_round: args.led, updated_at: now }).in("id", ourInv);
      if (error) return error.message;
    }
    if (otherInv.length) {
      const { error } = await db.from("portfolio_investments").update({ led_round: false, updated_at: now }).in("id", otherInv);
      if (error) return error.message;
    }
  }

  const deals = await loadCompanyDeals(db, args.companyName, args.startupId);
  if (deals.error) return deals.error;
  for (const deal of deals.rows) {
    const isOurs = deal.firm_id === args.firmId;
    if (!isOurs && !args.led) continue;
    const next = ledRoundNames(deal.led_rounds, args.roundName, isOurs ? args.led : false);
    const same = next.length === deal.led_rounds.length && next.every((item, index) => item === deal.led_rounds[index]);
    if (same) continue;
    const { error } = await db.from("firm_recent_deals").update({ led_rounds: next, updated_at: now }).eq("id", deal.id);
    if (error) return error.message;
  }
  return null;
}

export async function linkCompanyInvestor(
  db: SupabaseClient,
  body: Record<string, unknown>,
): Promise<{ row: CompanyInvestorRow; created: boolean } | { error: string; status: number }> {
  const startupId = typeof body.startup_id === "string" ? body.startup_id.trim() : "";
  const firmId = typeof body.firm_id === "string" ? body.firm_id.trim() : "";
  const investorRaw = typeof body.firm_investor_id === "string" ? body.firm_investor_id.trim() : "";
  const roundName = typeof body.round_name === "string" && body.round_name.trim() ? body.round_name.trim() : null;
  const ledRound = typeof body.led_round === "boolean" ? body.led_round : null;
  const amount = parseAmount(body.amount_usd);
  if (!startupId) return { error: "startup_id is required", status: 400 };
  if (!firmId) return { error: "Pick a firm", status: 400 };
  if (!amount.ok) return { error: "Investment amount must be a positive number", status: 400 };

  const { data: startup, error: startupErr } = await db
    .from("startups")
    .select("id, company_name, company_url, linkedin_url, sector, investor_names, deleted_at")
    .eq("id", startupId)
    .maybeSingle();
  if (startupErr) return { error: startupErr.message, status: 500 };
  const company = startup as StartupSnap | null;
  if (!company || company.deleted_at) return { error: "Company not found", status: 404 };
  if (!company.company_name?.trim()) return { error: "Company needs a name before it can be linked", status: 400 };

  const { data: firm, error: firmErr } = await db
    .from("firm_records")
    .select("id, firm_name, deleted_at")
    .eq("id", firmId)
    .maybeSingle();
  if (firmErr) return { error: firmErr.message, status: 500 };
  const firmRow = firm as { id: string; firm_name: string | null; deleted_at: string | null } | null;
  if (!firmRow || firmRow.deleted_at) return { error: "Firm not found", status: 404 };

  let investorName: string | null = null;
  let investorTitle: string | null = null;
  const firmInvestorId = investorRaw || null;
  if (firmInvestorId) {
    const { data: person, error: personErr } = await db
      .from("firm_investors")
      .select("id, full_name, title, firm_id, deleted_at")
      .eq("id", firmInvestorId)
      .maybeSingle();
    if (personErr) return { error: personErr.message, status: 500 };
    const personRow = person as { id: string; full_name: string | null; title: string | null; firm_id: string; deleted_at: string | null } | null;
    if (!personRow || personRow.deleted_at) return { error: "Investor not found", status: 404 };
    if (personRow.firm_id !== firmId) return { error: "That person belongs to a different firm", status: 400 };
    investorName = personRow.full_name;
    investorTitle = personRow.title;
  }

  const deal = await upsertPortfolioDeal(db, {
    firmId,
    startupId,
    companyName: company.company_name.trim(),
    website: company.company_url,
    linkedin: company.linkedin_url,
    sector: company.sector,
    roundName,
    amountUsd: amount.value,
    firmInvestorId,
    investorName,
  });
  if ("error" in deal) return { error: deal.error, status: 500 };

  const investment = await upsertPortfolioInvestment(db, {
    firmId,
    companyName: company.company_name.trim(),
    website: company.company_url,
    linkedin: company.linkedin_url,
    sector: company.sector,
    roundName,
    amountUsd: amount.value,
  });
  if ("error" in investment) return { error: investment.error, status: 500 };

  if (firmInvestorId) {
    const personErr = await attachCompanyToPerson(db, firmInvestorId, company.company_name.trim());
    if (personErr) return { error: personErr, status: 500 };
  }

  const { data: existingLinks, error: linksErr } = await db
    .from("startup_investment_links")
    .select("id, firm_investor_id, round_name, amount_usd, led_round")
    .eq("startup_id", startupId)
    .eq("firm_id", firmId);
  if (linksErr) return { error: linksErr.message, status: 500 };

  const candidates = (existingLinks ?? []) as Array<{
    id: string;
    firm_investor_id: string | null;
    round_name: string | null;
    amount_usd: number | null;
    led_round: boolean | null;
  }>;
  const prior = candidates.find((row) =>
    roundKey(row.round_name) === roundKey(roundName) && (row.firm_investor_id ?? "") === (firmInvestorId ?? "")
  );
  const now = new Date().toISOString();
  const storedAmount = amount.value ?? asUsd(prior?.amount_usd);

  let linkId = prior?.id ?? null;
  let created = false;
  const storedLead = ledRound ?? Boolean(prior?.led_round);
  if (prior) {
    const patch: Record<string, unknown> = {
      firm_investor_id: firmInvestorId,
      round_name: roundName,
      amount_usd: storedAmount,
      firm_recent_deal_id: deal.id,
      portfolio_investment_id: investment.id,
      updated_at: now,
    };
    if (ledRound != null) patch.led_round = ledRound;
    const { error } = await db.from("startup_investment_links").update(patch).eq("id", prior.id);
    if (error) return { error: error.message, status: 500 };
  } else {
    const { data: inserted, error } = await db.from("startup_investment_links").insert({
      startup_id: startupId,
      firm_id: firmId,
      firm_investor_id: firmInvestorId,
      round_name: roundName,
      amount_usd: storedAmount,
      firm_recent_deal_id: deal.id,
      portfolio_investment_id: investment.id,
      led_round: ledRound === true,
      updated_at: now,
    }).select("id").single();
    if (error) return { error: error.message, status: 500 };
    linkId = (inserted as { id: string }).id;
    created = true;
  }

  if (ledRound != null && roundName) {
    const leadErr = await syncRoundLead(db, {
      startupId,
      firmId,
      companyName: company.company_name.trim(),
      roundName,
      led: ledRound,
    });
    if (leadErr) return { error: leadErr, status: 500 };
  }

  const names = new Set(
    (company.investor_names ?? []).map((item) => item.trim()).filter(Boolean),
  );
  if (firmRow.firm_name?.trim()) names.add(firmRow.firm_name.trim());
  if (investorName?.trim()) names.add(investorName.trim());
  await db.from("startups").update({
    investor_names: [...names],
    updated_at: now,
  }).eq("id", startupId);

  return {
    created,
    row: {
      id: linkId,
      firm_id: firmId,
      firm_name: firmRow.firm_name,
      firm_investor_id: firmInvestorId,
      investor_name: investorName,
      investor_title: investorTitle,
      round_name: roundName,
      amount_usd: storedAmount,
      amount_label: storedAmount != null ? formatInvestmentAmount(storedAmount) : null,
      portfolio_note: null,
      led_round: ledRound ?? storedLead,
    },
  };
}

function withoutName(names: string[] | null, remove: string | null): string[] {
  const key = remove?.trim().toLowerCase() ?? "";
  return (names ?? [])
    .map((item) => item.trim())
    .filter((item) => item && (!key || item.toLowerCase() !== key));
}

async function detachCompanyFromPerson(
  db: SupabaseClient,
  investorId: string,
  companyName: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("firm_investors")
    .select("portfolio_companies")
    .eq("id", investorId)
    .maybeSingle();
  if (error) return error.message;
  const current = Array.isArray((data as { portfolio_companies?: unknown } | null)?.portfolio_companies)
    ? ((data as { portfolio_companies: unknown[] }).portfolio_companies.filter((item) => typeof item === "string") as string[])
    : [];
  const norm = normalizePortfolioName(companyName);
  const next = current.filter((item) => normalizePortfolioName(item) !== norm);
  if (next.length === current.length) return null;
  const { error: upErr } = await db
    .from("firm_investors")
    .update({ portfolio_companies: next, updated_at: new Date().toISOString() })
    .eq("id", investorId);
  return upErr?.message ?? null;
}

export async function unlinkCompanyInvestor(
  db: SupabaseClient,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { error: string; status: number }> {
  const startupId = typeof body.startup_id === "string" ? body.startup_id.trim() : "";
  const firmId = typeof body.firm_id === "string" ? body.firm_id.trim() : "";
  const linkId = typeof body.link_id === "string" ? body.link_id.trim() : "";
  const investorRaw = typeof body.firm_investor_id === "string" ? body.firm_investor_id.trim() : "";
  const roundName = typeof body.round_name === "string" && body.round_name.trim() ? body.round_name.trim() : null;
  if (!startupId) return { error: "startup_id is required", status: 400 };
  if (!firmId) return { error: "firm_id is required", status: 400 };

  const { data: startup, error: startupErr } = await db
    .from("startups")
    .select("id, company_name, investor_names, deleted_at")
    .eq("id", startupId)
    .maybeSingle();
  if (startupErr) return { error: startupErr.message, status: 500 };
  const company = startup as Pick<StartupSnap, "id" | "company_name" | "investor_names" | "deleted_at"> | null;
  if (!company || company.deleted_at) return { error: "Company not found", status: 404 };
  const companyName = company.company_name?.trim() ?? "";
  if (!companyName) return { error: "Company needs a name before it can be unlinked", status: 400 };

  const { data: firm, error: firmErr } = await db
    .from("firm_records")
    .select("id, firm_name")
    .eq("id", firmId)
    .maybeSingle();
  if (firmErr) return { error: firmErr.message, status: 500 };
  const firmRow = firm as { id: string; firm_name: string | null } | null;
  if (!firmRow) return { error: "Firm not found", status: 404 };

  let investorName: string | null = null;
  const firmInvestorId = investorRaw || null;
  if (firmInvestorId) {
    const { data: person, error: personErr } = await db
      .from("firm_investors")
      .select("id, full_name")
      .eq("id", firmInvestorId)
      .maybeSingle();
    if (personErr) return { error: personErr.message, status: 500 };
    investorName = (person as { full_name?: string | null } | null)?.full_name ?? null;
  }

  const { data: existingLinks, error: linksErr } = await db
    .from("startup_investment_links")
    .select("id, firm_investor_id, round_name")
    .eq("startup_id", startupId)
    .eq("firm_id", firmId);
  if (linksErr) return { error: linksErr.message, status: 500 };
  const linkRows = (existingLinks ?? []) as Array<{
    id: string;
    firm_investor_id: string | null;
    round_name: string | null;
  }>;
  const matches = linkId
    ? linkRows.filter((row) => row.id === linkId)
    : linkRows.filter((row) =>
      roundKey(row.round_name) === roundKey(roundName)
      && (row.firm_investor_id ?? "") === (firmInvestorId ?? "")
    );
  if (linkId && matches.length === 0) return { error: "Link not found", status: 404 };
  if (matches.length) {
    const { error } = await db.from("startup_investment_links").delete().in("id", matches.map((row) => row.id));
    if (error) return { error: error.message, status: 500 };
  }

  const norm = normalizePortfolioName(companyName);
  const { data: portfolioCompany, error: companyErr } = await db
    .from("portfolio_companies")
    .select("id")
    .eq("normalized_name", norm)
    .maybeSingle();
  if (companyErr) return { error: companyErr.message, status: 500 };
  const portfolioCompanyId = (portfolioCompany as { id?: string } | null)?.id ?? null;

  const removedRounds = [...new Set(matches.map((row) => row.round_name))];
  let stillLinked: Array<{ round_name: string | null; led_round: boolean | null }> = [];
  if (matches.length) {
    const { data: stillData, error: stillErr } = await db
      .from("startup_investment_links")
      .select("round_name, led_round")
      .eq("startup_id", startupId)
      .eq("firm_id", firmId);
    if (stillErr) return { error: stillErr.message, status: 500 };
    stillLinked = (stillData ?? []) as Array<{ round_name: string | null; led_round: boolean | null }>;
  }
  const stillRounds = new Set(stillLinked.map((row) => roundKey(row.round_name)));
  if (matches.length && portfolioCompanyId) {
    const { data: investments, error: investmentErr } = await db
      .from("portfolio_investments")
      .select("id, round_type")
      .eq("firm_id", firmId)
      .eq("portfolio_company_id", portfolioCompanyId);
    if (investmentErr) return { error: investmentErr.message, status: 500 };
    const dropIds = ((investments ?? []) as Array<{ id: string; round_type: string | null }>)
      .filter((row) => removedRounds.some((name) => roundKey(name) === roundKey(row.round_type)) && !stillRounds.has(roundKey(row.round_type)))
      .map((row) => row.id);
    if (dropIds.length) {
      const { error } = await db.from("portfolio_investments").delete().in("id", dropIds);
      if (error) return { error: error.message, status: 500 };
    }
  }
  if (matches.length) {
    for (const removedRound of removedRounds) {
      if (!removedRound) continue;
      const stillLeads = stillLinked.some((row) => roundKey(row.round_name) === roundKey(removedRound) && row.led_round);
      if (stillLeads) continue;
      const leadErr = await syncRoundLead(db, {
        startupId,
        firmId,
        companyName,
        roundName: removedRound,
        led: false,
      });
      if (leadErr) return { error: leadErr, status: 500 };
    }
  }

  const { count: linksLeft, error: leftErr } = await db
    .from("startup_investment_links")
    .select("id", { count: "exact", head: true })
    .eq("startup_id", startupId)
    .eq("firm_id", firmId);
  if (leftErr) return { error: leftErr.message, status: 500 };
  let investmentsLeft = 0;
  if (portfolioCompanyId) {
    const { count, error } = await db
      .from("portfolio_investments")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("portfolio_company_id", portfolioCompanyId);
    if (error) return { error: error.message, status: 500 };
    investmentsLeft = count ?? 0;
  }

  const firmGone = (linksLeft ?? 0) === 0 && investmentsLeft === 0;
  if (firmGone) {
    const { error: dealErr } = await db
      .from("firm_recent_deals")
      .delete()
      .eq("firm_id", firmId)
      .eq("normalized_company_name", norm);
    if (dealErr) return { error: dealErr.message, status: 500 };
    const { data: tagged, error: taggedErr } = await db
      .from("firm_recent_deals")
      .select("id")
      .eq("firm_id", firmId)
      .contains("raw_payload", { startup_id: startupId });
    if (taggedErr) return { error: taggedErr.message, status: 500 };
    const taggedIds = ((tagged ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (taggedIds.length) {
      const { error } = await db.from("firm_recent_deals").delete().in("id", taggedIds);
      if (error) return { error: error.message, status: 500 };
    }
    const { data: people, error: peopleErr } = await db
      .from("firm_investors")
      .select("id")
      .eq("firm_id", firmId)
      .contains("portfolio_companies", [companyName])
      .is("deleted_at", null)
      .limit(40);
    if (peopleErr) return { error: peopleErr.message, status: 500 };
    for (const person of (people ?? []) as Array<{ id: string }>) {
      const personErr = await detachCompanyFromPerson(db, person.id, companyName);
      if (personErr) return { error: personErr, status: 500 };
    }
  } else if (firmInvestorId) {
    const { count: personLinks, error: personCountErr } = await db
      .from("startup_investment_links")
      .select("id", { count: "exact", head: true })
      .eq("startup_id", startupId)
      .eq("firm_investor_id", firmInvestorId);
    if (personCountErr) return { error: personCountErr.message, status: 500 };
    if ((personLinks ?? 0) === 0) {
      const personErr = await detachCompanyFromPerson(db, firmInvestorId, companyName);
      if (personErr) return { error: personErr, status: 500 };
    }
  }

  let names = company.investor_names ?? [];
  if (firmGone) {
    names = withoutName(names, firmRow.firm_name);
    names = withoutName(names, investorName);
  } else if (firmInvestorId) {
    const { count: personLinks, error: personCountErr } = await db
      .from("startup_investment_links")
      .select("id", { count: "exact", head: true })
      .eq("startup_id", startupId)
      .eq("firm_investor_id", firmInvestorId);
    if (personCountErr) return { error: personCountErr.message, status: 500 };
    if ((personLinks ?? 0) === 0) names = withoutName(names, investorName);
  }
  const { error: nameErr } = await db.from("startups").update({
    investor_names: names,
    updated_at: new Date().toISOString(),
  }).eq("id", startupId);
  if (nameErr) return { error: nameErr.message, status: 500 };

  return { ok: true };
}
