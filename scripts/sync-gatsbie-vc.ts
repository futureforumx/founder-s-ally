import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { augmentFirmRecordsPatchWithSupabase } from "./lib/firmRecordsCanonicalHqPolicy";
import { canonicalizeStages, STAGE_DISPLAY } from "../src/backfill/parsers/stage-parser";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const e = (name: string, fallback = "") => (process.env[name] || "").trim() || fallback;
const eInt = (name: string, fallback: number) => {
  const value = Number.parseInt(e(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const eBool = (name: string, fallback = false) => {
  const value = e(name);
  if (!value) return fallback;
  return ["1", "true", "yes"].includes(value.toLowerCase());
};

const SUPABASE_URL = e("SUPABASE_URL", e("VITE_SUPABASE_URL")).replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN = eBool("GATSBIE_DRY_RUN", eBool("DRY_RUN", true));
const PAGE_SIZE = eInt("GATSBIE_PAGE_SIZE", 1000);
const MAX_FIRMS = eInt("GATSBIE_MAX_FIRMS", 999_999);
const GATSBIE_SUPABASE_URL = e("GATSBIE_SUPABASE_URL", "https://azhhmpaojxflliyxiquz.supabase.co");
const GATSBIE_ANON_KEY = e(
  "GATSBIE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6aGhtcGFvanhmbGxpeXhpcXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUxNDM4MzEsImV4cCI6MjA2MDcxOTgzMX0.XvZPj8j9rUF3uTVF4omjxTb3XfpyOoIhI6SKwFNueV4",
);

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const localDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const gatsbieHeaders = {
  apikey: GATSBIE_ANON_KEY,
  Authorization: `Bearer ${GATSBIE_ANON_KEY}`,
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

type GatsbieFirm = {
  id: string;
  name: string;
  description: string | null;
  investment_thesis: string | null;
  preferred_stages: string[] | null;
  investment_sectors: string[] | null;
  portfolio_companies: string[] | null;
  corporate_linkedin: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  is_active: boolean | null;
  investment_active: boolean | null;
  ticket_size: string | null;
  normalized_sectors: string[] | null;
  investment_focus: string | null;
  normalized_stages: string[] | null;
  target_locations: string[] | null;
  logo_url: string | null;
  investment_approach: string[] | null;
  investment_activity_notes: string | null;
  target_business_focus: string[] | null;
  firm_types: string[] | null;
};

type GatsbieContact = {
  id: string;
  vc_firm_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  work_history: Json | null;
  education_history: Json | null;
};

type LocalFirm = {
  id: string;
  firm_name: string;
  aliases: string[] | null;
  alternate_names: string[] | null;
  website_url: string | null;
  linkedin_url: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  description: string | null;
  investment_philosophy: string | null;
  thesis_verticals: string[] | null;
  geo_focus: string[] | null;
  logo_url: string | null;
  avg_check_size: string | null;
  min_check_size: number | null;
  max_check_size: number | null;
  is_actively_deploying: boolean | null;
  total_investors: number | null;
  total_partners: number | null;
  firm_type: string | null;
  recent_focus: string | null;
  lead_or_follow: string | null;
  stage_focus: string[] | null;
  stage_min: string | null;
  stage_max: string | null;
};

type LocalInvestor = {
  id: string;
  firm_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
};

type MatchResult =
  | { kind: "matched"; firm: LocalFirm; reason: string }
  | { kind: "unmatched"; reason: string };

const MANUAL_MATCHES: Record<string, { firmName: string; websiteDomain?: string | null }> = {
  dcvc: {
    firmName: "DCVC",
    websiteDomain: "dcvc.com",
  },
  "s32 section 32": {
    firmName: "S32 (Section 32)",
  },
  "sapphire sport (sapphire ventures)": {
    firmName: "Sapphire Sport",
    websiteDomain: "sapphireventures.com",
  },
  inovo: {
    firmName: "Inovo VC",
    websiteDomain: "inovo.vc",
  },
};

function isMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeText(input: string | null | undefined): string {
  return (input || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedVariants(input: string | null | undefined): string[] {
  const raw = (input || "").trim();
  const base = normalizeText(raw);
  if (!base) return [];
  const variants = new Set<string>([base]);
  variants.add(normalizeText(raw.replace(/\([^)]*\)/g, " ")));
  variants.add(base.replace(/sports and humans first fund/g, "").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\b7 7 6\b/g, "776").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\b776\b/g, "seven seven six").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bventures\b/g, "venture").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bventure\b/g, "ventures").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bpartners\b/g, "partner").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bpartner\b/g, "partners").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bcapital\b/g, "cap").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bcap\b/g, "capital").replace(/\s+/g, " ").trim());
  return [...variants].filter(Boolean);
}

function isNonCanonicalWebsiteDomain(domain: string | null): boolean {
  return !!domain && new Set(["linkedin.com", "www.linkedin.com"]).has(domain);
}

function toUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function domainFromUrl(raw: string | null | undefined): string | null {
  const url = toUrl(raw);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function uniq(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function mapStageFocus(preferred: string[] | null, normalized: string[] | null): string[] {
  const raw = [...(preferred || []), ...(normalized || [])];
  const mapped: string[] = [];
  for (const item of raw) {
    const lower = item.toLowerCase();
    if (lower.includes("friends")) mapped.push("Friends and Family");
    else if (lower.includes("idea") || lower.includes("prototype") || lower.includes("pre-seed")) mapped.push("Pre-Seed");
    else if (lower.includes("early revenue") || lower === "seed") mapped.push("Seed");
    else if (lower.includes("series a")) mapped.push("Series A");
    else if (lower.includes("series b") || lower.includes("series c")) mapped.push("Series B+");
    else if (lower.includes("growth")) mapped.push("Growth");
  }

  if (mapped.length) return uniq(mapped);

  const canonical = canonicalizeStages(raw);
  return uniq(canonical.map((value) => STAGE_DISPLAY[value]));
}

function parseCheckSize(raw: string | null): { min: number | null; max: number | null } {
  if (!raw) return { min: null, max: null };
  if (/[;]|transaction range|m&a|aum|assets under management/i.test(raw)) {
    return { min: null, max: null };
  }
  const nums: number[] = [];
  const regex = /\$?\s*([\d,.]+)\s*([kKmMbB])?/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(raw))) {
    const base = Number.parseFloat(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const suffix = (match[2] || "").toLowerCase();
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    nums.push(Math.round(base * multiplier));
  }

  if (!nums.length) return { min: null, max: null };
  if (nums.length > 2) return { min: null, max: null };
  if (/\+/.test(raw)) return { min: nums[0], max: null };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max };
}

function inferLeadFollow(approach: string[] | null): string | null {
  const lower = (approach || []).map((value) => value.toLowerCase());
  const hasLead = lower.some((value) => value.includes("lead"));
  const hasCo = lower.some((value) => value.includes("co"));
  if (hasLead && hasCo) return "lead_and_follow";
  if (hasLead) return "lead";
  if (hasCo) return "follow";
  return null;
}

async function fetchPaged<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;

  while (out.length < MAX_FIRMS) {
    const url = `${GATSBIE_SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=id.asc&offset=${offset}&limit=${Math.min(PAGE_SIZE, 500)}`;
    const res = await fetch(url, { headers: gatsbieHeaders });
    if (!res.ok) throw new Error(`Gatsbie ${table} fetch failed: ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as T[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return out.slice(0, MAX_FIRMS);
}

async function fetchAllLocalFirms(): Promise<LocalFirm[]> {
  const rows: LocalFirm[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await localDb
      .from("firm_records")
      .select(
        "id,firm_name,aliases,alternate_names,website_url,linkedin_url,hq_city,hq_state,hq_country,description,investment_philosophy,thesis_verticals,geo_focus,logo_url,avg_check_size,min_check_size,max_check_size,is_actively_deploying,total_investors,total_partners,firm_type,recent_focus,lead_or_follow,stage_focus,stage_min,stage_max",
      )
      .is("deleted_at", null)
      .order("firm_name")
      .range(offset, offset + 999);
    if (error) throw new Error(`Failed to load firm_records: ${error.message}`);
    const batch = (data || []) as LocalFirm[];
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function fetchInvestorsByFirmIds(firmIds: string[]): Promise<LocalInvestor[]> {
  const rows: LocalInvestor[] = [];
  for (let i = 0; i < firmIds.length; i += 100) {
    const chunk = firmIds.slice(i, i + 100);
    const { data, error } = await localDb
      .from("firm_investors")
      .select("id,firm_id,full_name,first_name,last_name,title,email,phone,linkedin_url")
      .in("firm_id", chunk)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load firm_investors: ${error.message}`);
    rows.push(...((data || []) as LocalInvestor[]));
  }
  return rows;
}

function buildMatchIndexes(firms: LocalFirm[]) {
  const byDomain = new Map<string, LocalFirm[]>();
  const byName = new Map<string, LocalFirm[]>();
  const byFirmName = new Map<string, LocalFirm[]>();

  for (const firm of firms) {
    const domain = domainFromUrl(firm.website_url);
    if (domain) byDomain.set(domain, [...(byDomain.get(domain) || []), firm]);

    for (const key of normalizedVariants(firm.firm_name)) {
      byFirmName.set(key, [...(byFirmName.get(key) || []), firm]);
    }

    const names = uniq([firm.firm_name, ...(firm.aliases || []), ...(firm.alternate_names || [])]);
    for (const name of names) {
      const key = normalizeText(name);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) || []), firm]);
    }
  }

  return { byDomain, byName, byFirmName };
}

function firmNameKeys(firm: LocalFirm): string[] {
  return uniq([firm.firm_name, ...(firm.aliases || []), ...(firm.alternate_names || [])]).flatMap((name) => normalizedVariants(name));
}

function chooseBestCandidate(candidates: LocalFirm[], gatsbieName: string): LocalFirm | null {
  const targetKeys = new Set(normalizedVariants(gatsbieName));
  if (!targetKeys.size) return null;

  const exact = candidates.filter((candidate) => firmNameKeys(candidate).some((key) => targetKeys.has(key)));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const targetTokens = new Set(normalizeText(gatsbieName).split(" ").filter(Boolean));
  let best: { score: number; firm: LocalFirm } | null = null;
  let tied = false;
  for (const candidate of candidates) {
    const candidateTokens = new Set(firmNameKeys(candidate).flatMap((key) => key.split(" ").filter(Boolean)));
    let overlap = 0;
    for (const token of targetTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }
    if (overlap === 0) continue;
    if (!best || overlap > best.score) {
      best = { score: overlap, firm: candidate };
      tied = false;
    } else if (best && overlap === best.score) {
      tied = true;
    }
  }

  if (!best || tied) return null;
  return best.firm;
}

function matchFirm(firm: GatsbieFirm, indexes: ReturnType<typeof buildMatchIndexes>): MatchResult {
  const websiteDomainRaw = domainFromUrl(firm.website);
  const websiteDomain = isNonCanonicalWebsiteDomain(websiteDomainRaw) ? null : websiteDomainRaw;
  const nameKey = normalizeText(firm.name);
  const manualMatch = MANUAL_MATCHES[nameKey];
  if (manualMatch && (!manualMatch.websiteDomain || manualMatch.websiteDomain === websiteDomain)) {
    const manualFirmNameKey = normalizeText(manualMatch.firmName);
    const manualCandidates = (indexes.byFirmName.get(manualFirmNameKey) || []).filter(
      (candidate) => normalizeText(candidate.firm_name) === manualFirmNameKey,
    );
    if (manualCandidates.length === 1) {
      return { kind: "matched", firm: manualCandidates[0], reason: `manual:${nameKey}` };
    }
  }
  const exactFirmNameMatches = uniq(normalizedVariants(firm.name))
    .flatMap((key) => indexes.byFirmName.get(key) || [])
    .filter((candidate, index, arr) => arr.findIndex((item) => item.id === candidate.id) === index);

  if (exactFirmNameMatches.length === 1) {
    return { kind: "matched", firm: exactFirmNameMatches[0], reason: `firm_name:${nameKey}` };
  }

  const domainMatches = websiteDomain ? indexes.byDomain.get(websiteDomain) || [] : [];
  if (domainMatches.length === 1) {
    return { kind: "matched", firm: domainMatches[0], reason: `domain:${websiteDomain}` };
  }
  if (domainMatches.length > 1) {
    const chosen = chooseBestCandidate(domainMatches, firm.name);
    if (chosen) return { kind: "matched", firm: chosen, reason: `domain_name_tiebreak:${websiteDomain}` };
    return { kind: "unmatched", reason: `ambiguous_domain:${websiteDomain}` };
  }

  const nameMatches = uniq(normalizedVariants(firm.name))
    .flatMap((key) => indexes.byName.get(key) || [])
    .filter((candidate, index, arr) => arr.findIndex((item) => item.id === candidate.id) === index);
  if (nameMatches.length === 1) {
    return { kind: "matched", firm: nameMatches[0], reason: `name:${nameKey}` };
  }
  if (nameMatches.length > 1) {
    const chosen = chooseBestCandidate(nameMatches, firm.name);
    if (chosen) return { kind: "matched", firm: chosen, reason: `name_tiebreak:${nameKey}` };
    return { kind: "unmatched", reason: `ambiguous_name:${nameKey}` };
  }

  return { kind: "unmatched", reason: "no_match" };
}

function baseFirmPatch(gatsbieFirm: GatsbieFirm, contactCount: number): Record<string, unknown> {
  const stageFocus = mapStageFocus(gatsbieFirm.preferred_stages, gatsbieFirm.normalized_stages);
  const sectorFocus = uniq([...(gatsbieFirm.normalized_sectors || []), ...(gatsbieFirm.investment_sectors || [])]).slice(0, 24);
  const geoFocus = uniq(gatsbieFirm.target_locations || []).slice(0, 24);
  const websiteUrl = toUrl(gatsbieFirm.website);
  const patch: Record<string, unknown> = {
    firm_name: gatsbieFirm.name,
    website_url: websiteUrl,
    linkedin_url: gatsbieFirm.corporate_linkedin,
    hq_city: gatsbieFirm.city,
    hq_state: gatsbieFirm.state,
    hq_country: gatsbieFirm.country,
    description: gatsbieFirm.description,
    investment_philosophy: gatsbieFirm.investment_thesis,
    thesis_verticals: sectorFocus,
    geo_focus: geoFocus,
    logo_url: gatsbieFirm.logo_url,
    avg_check_size: gatsbieFirm.ticket_size,
    is_actively_deploying: gatsbieFirm.investment_active,
    total_investors: contactCount || null,
    total_partners: null,
    firm_type: (gatsbieFirm.firm_types || []).join(", ") || null,
    recent_focus: gatsbieFirm.investment_focus,
    lead_or_follow: inferLeadFollow(gatsbieFirm.investment_approach),
    stage_focus: stageFocus,
    stage_min: stageFocus[0] || null,
    stage_max: stageFocus[stageFocus.length - 1] || null,
    aliases: [] as string[],
  };

  const normalizedTypes = (gatsbieFirm.firm_types || []).map((value) => value.toLowerCase());
  if (normalizedTypes.some((value) => value.includes("family office"))) patch.entity_type = "Family Office";
  else if (normalizedTypes.some((value) => value.includes("corporate"))) patch.entity_type = "Corporate (CVC)";
  else if (normalizedTypes.some((value) => value.includes("angel"))) patch.entity_type = "Angel";
  else patch.entity_type = "Institutional";

  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

async function main() {
  console.log(`Gatsbie VC sync ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);

  const [gatsbieFirms, gatsbieContacts, localFirms] = await Promise.all([
    fetchPaged<GatsbieFirm>(
      "vc_firms",
      "id,name,description,investment_thesis,preferred_stages,investment_sectors,portfolio_companies,corporate_linkedin,city,state,country,phone,website,is_active,investment_active,ticket_size,normalized_sectors,investment_focus,normalized_stages,target_locations,logo_url,investment_approach,investment_activity_notes,target_business_focus,firm_types",
    ),
    fetchPaged<GatsbieContact>(
      "vc_firm_contacts",
      "id,vc_firm_id,first_name,last_name,full_name,title,email,phone,linkedin_url,work_history,education_history",
    ),
    fetchAllLocalFirms(),
  ]);

  console.log(`Loaded ${gatsbieFirms.length} Gatsbie firms, ${gatsbieContacts.length} contacts, ${localFirms.length} local firms`);

  const contactsByFirmId = new Map<string, GatsbieContact[]>();
  for (const contact of gatsbieContacts) {
    contactsByFirmId.set(contact.vc_firm_id, [...(contactsByFirmId.get(contact.vc_firm_id) || []), contact]);
  }

  const indexes = buildMatchIndexes(localFirms);
  const matches = gatsbieFirms.map((firm) => ({ gatsbieFirm: firm, match: matchFirm(firm, indexes) }));
  const matched = matches.filter((row): row is { gatsbieFirm: GatsbieFirm; match: { kind: "matched"; firm: LocalFirm; reason: string } } => row.match.kind === "matched");
  const unmatched = matches.filter((row) => row.match.kind === "unmatched");

  console.log(`Matched ${matched.length} firms, unmatched ${unmatched.length}`);

  const investorRows = await fetchInvestorsByFirmIds(uniq(matched.map((row) => row.match.firm.id)));
  const investorsByFirmId = new Map<string, LocalInvestor[]>();
  for (const investor of investorRows) {
    investorsByFirmId.set(investor.firm_id, [...(investorsByFirmId.get(investor.firm_id) || []), investor]);
  }

  let firmUpdates = 0;
  let firmCreates = 0;
  let investorUpdates = 0;
  let investorInserts = 0;

  const allTargets: Array<{
    gatsbieFirm: GatsbieFirm;
    localFirm: LocalFirm;
    reason: string;
    created: boolean;
  }> = [];

  for (const { gatsbieFirm, match } of matched) {
    allTargets.push({ gatsbieFirm, localFirm: match.firm, reason: match.reason, created: false });
  }

  for (const row of unmatched) {
    if (row.match.reason !== "no_match") continue;
    const relatedContacts = contactsByFirmId.get(row.gatsbieFirm.id) || [];
    const insertPayload = baseFirmPatch(row.gatsbieFirm, relatedContacts.length);
    let localFirm: LocalFirm;
    if (DRY_RUN) {
      const syntheticId = `dry-${randomUUID()}`;
      console.log(`[firm][dry:create] ${row.gatsbieFirm.name}`);
      localFirm = {
        id: syntheticId,
        firm_name: row.gatsbieFirm.name,
        aliases: [],
        alternate_names: null,
        website_url: (insertPayload.website_url as string | null) ?? null,
        linkedin_url: (insertPayload.linkedin_url as string | null) ?? null,
        hq_city: (insertPayload.hq_city as string | null) ?? null,
        hq_state: (insertPayload.hq_state as string | null) ?? null,
        hq_country: (insertPayload.hq_country as string | null) ?? null,
        description: (insertPayload.description as string | null) ?? null,
        investment_philosophy: (insertPayload.investment_philosophy as string | null) ?? null,
        thesis_verticals: (insertPayload.thesis_verticals as string[] | null) ?? null,
        geo_focus: (insertPayload.geo_focus as string[] | null) ?? null,
        logo_url: (insertPayload.logo_url as string | null) ?? null,
        avg_check_size: (insertPayload.avg_check_size as string | null) ?? null,
        min_check_size: (insertPayload.min_check_size as number | null) ?? null,
        max_check_size: (insertPayload.max_check_size as number | null) ?? null,
        is_actively_deploying: (insertPayload.is_actively_deploying as boolean | null) ?? null,
        total_investors: (insertPayload.total_investors as number | null) ?? null,
        total_partners: (insertPayload.total_partners as number | null) ?? null,
        firm_type: (insertPayload.firm_type as string | null) ?? null,
        recent_focus: (insertPayload.recent_focus as string | null) ?? null,
        lead_or_follow: (insertPayload.lead_or_follow as string | null) ?? null,
        stage_focus: (insertPayload.stage_focus as string[] | null) ?? null,
        stage_min: (insertPayload.stage_min as string | null) ?? null,
        stage_max: (insertPayload.stage_max as string | null) ?? null,
      };
    } else {
      const { data, error } = await localDb.from("firm_records").insert(insertPayload).select(
        "id,firm_name,aliases,alternate_names,website_url,linkedin_url,hq_city,hq_state,hq_country,description,investment_philosophy,thesis_verticals,geo_focus,logo_url,avg_check_size,min_check_size,max_check_size,is_actively_deploying,total_investors,total_partners,firm_type,recent_focus,lead_or_follow,stage_focus,stage_min,stage_max",
      ).single();
      if (error) throw new Error(`Failed to create firm_records ${row.gatsbieFirm.name}: ${error.message}`);
      localFirm = data as LocalFirm;
    }
    firmCreates += 1;
    allTargets.push({ gatsbieFirm: row.gatsbieFirm, localFirm, reason: "created:no_match", created: true });
  }

  for (const { gatsbieFirm, localFirm, reason, created } of allTargets) {
    const relatedContacts = contactsByFirmId.get(gatsbieFirm.id) || [];
    const patch: Record<string, unknown> = {};
    const stageFocus = mapStageFocus(gatsbieFirm.preferred_stages, gatsbieFirm.normalized_stages);
    const sectorFocus = uniq([...(gatsbieFirm.normalized_sectors || []), ...(gatsbieFirm.investment_sectors || [])]).slice(0, 24);
    const geoFocus = uniq(gatsbieFirm.target_locations || []).slice(0, 24);
    const leadOrFollow = inferLeadFollow(gatsbieFirm.investment_approach);
    const totalPartners = relatedContacts.filter((contact) => /partner/i.test(contact.title || "")).length || null;

    if (isMissing(localFirm.description) && !isMissing(gatsbieFirm.description)) patch.description = gatsbieFirm.description;
    if (isMissing(localFirm.investment_philosophy) && !isMissing(gatsbieFirm.investment_thesis)) patch.investment_philosophy = gatsbieFirm.investment_thesis;
    const websiteUrl = toUrl(gatsbieFirm.website);
    if (isMissing(localFirm.website_url) && websiteUrl) patch.website_url = websiteUrl;
    if (isMissing(localFirm.linkedin_url) && !isMissing(gatsbieFirm.corporate_linkedin)) patch.linkedin_url = gatsbieFirm.corporate_linkedin;
    if (isMissing(localFirm.hq_city) && !isMissing(gatsbieFirm.city)) patch.hq_city = gatsbieFirm.city;
    if (isMissing(localFirm.hq_state) && !isMissing(gatsbieFirm.state)) patch.hq_state = gatsbieFirm.state;
    if (isMissing(localFirm.hq_country) && !isMissing(gatsbieFirm.country)) patch.hq_country = gatsbieFirm.country;
    if (isMissing(localFirm.logo_url) && !isMissing(gatsbieFirm.logo_url)) patch.logo_url = gatsbieFirm.logo_url;
    if (isMissing(localFirm.thesis_verticals) && sectorFocus.length) patch.thesis_verticals = sectorFocus;
    if (isMissing(localFirm.geo_focus) && geoFocus.length) patch.geo_focus = geoFocus;
    if (isMissing(localFirm.avg_check_size) && !isMissing(gatsbieFirm.ticket_size)) patch.avg_check_size = gatsbieFirm.ticket_size;
    if (localFirm.is_actively_deploying == null && typeof gatsbieFirm.investment_active === "boolean") {
      patch.is_actively_deploying = gatsbieFirm.investment_active;
    }
    if (localFirm.total_investors == null && relatedContacts.length) patch.total_investors = relatedContacts.length;
    if (localFirm.total_partners == null && totalPartners != null) patch.total_partners = totalPartners;
    if (isMissing(localFirm.firm_type) && (gatsbieFirm.firm_types || []).length) patch.firm_type = gatsbieFirm.firm_types!.join(", ");
    if (isMissing(localFirm.recent_focus) && !isMissing(gatsbieFirm.investment_focus)) patch.recent_focus = gatsbieFirm.investment_focus;
    if (isMissing(localFirm.lead_or_follow) && leadOrFollow) patch.lead_or_follow = leadOrFollow;
    if (isMissing(localFirm.stage_focus) && stageFocus.length) patch.stage_focus = stageFocus;
    if (localFirm.stage_min == null && stageFocus.length) patch.stage_min = stageFocus[0];
    if (localFirm.stage_max == null && stageFocus.length) patch.stage_max = stageFocus[stageFocus.length - 1];

    const writeKeys = Object.keys(patch);
    if (writeKeys.length) {
      const merged = await augmentFirmRecordsPatchWithSupabase(localDb, localFirm.id, patch, "gatsbie_vc_sync");
      if (Object.keys(merged).length) {
        if (DRY_RUN) {
          console.log(`[firm][dry] ${localFirm.firm_name} <- ${gatsbieFirm.name} via ${reason}: ${Object.keys(merged).join(", ")}`);
        } else {
          const { error } = await localDb.from("firm_records").update(merged).eq("id", localFirm.id);
          if (error) throw new Error(`Failed to update firm_records ${localFirm.firm_name}: ${error.message}`);
        }
        firmUpdates += 1;
      }
    }

    const localInvestors = created ? [] : investorsByFirmId.get(localFirm.id) || [];
    const investorByName = new Map(localInvestors.map((investor) => [normalizeText(investor.full_name), investor]));

    for (const contact of relatedContacts) {
      const existing = investorByName.get(normalizeText(contact.full_name));
      if (existing) {
        const investorPatch: Record<string, unknown> = {};
        if (isMissing(existing.first_name) && !isMissing(contact.first_name)) investorPatch.first_name = contact.first_name;
        if (isMissing(existing.last_name) && !isMissing(contact.last_name)) investorPatch.last_name = contact.last_name;
        if (isMissing(existing.title) && !isMissing(contact.title)) investorPatch.title = contact.title;
        if (isMissing(existing.email) && !isMissing(contact.email)) investorPatch.email = contact.email;
        if (isMissing(existing.phone) && !isMissing(contact.phone)) investorPatch.phone = contact.phone;
        if (isMissing(existing.linkedin_url) && !isMissing(contact.linkedin_url)) investorPatch.linkedin_url = contact.linkedin_url;

        if (Object.keys(investorPatch).length) {
          if (DRY_RUN) {
            console.log(`[investor][dry:update] ${localFirm.firm_name} / ${contact.full_name}: ${Object.keys(investorPatch).join(", ")}`);
          } else {
            const { error } = await localDb.from("firm_investors").update(investorPatch).eq("id", existing.id);
            if (error) throw new Error(`Failed to update firm_investors ${contact.full_name}: ${error.message}`);
          }
          investorUpdates += 1;
        }
        continue;
      }

      const insertRow = {
        id: randomUUID(),
        firm_id: localFirm.id,
        full_name: contact.full_name,
        first_name: contact.first_name,
        last_name: contact.last_name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        linkedin_url: contact.linkedin_url,
      };

      if (DRY_RUN) {
        console.log(`[investor][dry:insert] ${localFirm.firm_name} / ${contact.full_name}`);
      } else {
        const { error } = await localDb.from("firm_investors").insert(insertRow);
        if (error) throw new Error(`Failed to insert firm_investors ${contact.full_name}: ${error.message}`);
      }
      investorInserts += 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    gatsbie_firm_count: gatsbieFirms.length,
    gatsbie_contact_count: gatsbieContacts.length,
    local_firm_count: localFirms.length,
    matched_firms: matched.length,
    unmatched_firms: unmatched.length,
    firm_creates: firmCreates,
    firm_updates: firmUpdates,
    investor_updates: investorUpdates,
    investor_inserts: investorInserts,
    unmatched_examples: unmatched.slice(0, 50).map((row) => ({
      gatsbie_name: row.gatsbieFirm.name,
      website: row.gatsbieFirm.website,
      reason: row.match.reason,
    })),
  };

  mkdirSync(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `gatsbie-vc-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Firm updates: ${firmUpdates}`);
  console.log(`Investor updates: ${investorUpdates}`);
  console.log(`Investor inserts: ${investorInserts}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
