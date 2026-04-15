import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADAPTERS_BY_NAME } from "./adapters";
import { websiteAdapter } from "./adapters/website";
import { mediumAdapter } from "./adapters/medium";
import { substackAdapter } from "./adapters/substack";
import { BrowserManager } from "./browser/playwright";
import { RateLimiter } from "./browser/rate-limit";
import { resolveStoragePaths } from "./browser/sessions";
import { createLogger } from "./logger";
import { mergeAdapterResults } from "./merge";
import { normalizeProfile } from "./normalizers";
import { classifyFirm, toClassificationInput } from "./parsers/firm-classification";
import { formatCheckSize } from "./parsers/check-size-parser";
import { parseGeo } from "./parsers/geo-parser";
import { applyInvestmentIntelToProfile } from "./parsers/investment-intel";
import { classifyUrl, extractDomain, normalizeUrl } from "./parsers/url-parser";
import { baseConfidence } from "./scoring";
import type {
  AdapterContext,
  AdapterResult,
  FirmSeed,
  Logger,
  SourceAdapter,
  SourceName,
} from "./types";
import {
  upsertSupportQaFlags,
  upsertSupportUrlCandidates,
  type SupportQaFlagRow,
  type SupportUrlCandidateRow,
} from "./supabase/upsert-support-staging";

type CandidateSourceKey =
  | "signal_nfx"
  | "cb_insights"
  | "tracxn"
  | "wellfound"
  | "angellist"
  | "medium"
  | "substack"
  | "blog";

const CANDIDATE_SOURCE_FIELDS: Record<CandidateSourceKey, keyof SupportFirmRow> = {
  signal_nfx: "signal_nfx_url",
  cb_insights: "cb_insights_url",
  tracxn: "tracxn_url",
  wellfound: "wellfound_url",
  angellist: "angellist_url",
  medium: "medium_url",
  substack: "substack_url",
  blog: "blog_url",
};

const CANDIDATE_ADAPTERS: Record<
  Exclude<CandidateSourceKey, "blog" | "cb_insights">,
  { adapterName: SourceName; field: keyof SupportFirmRow }
> & {
  cb_insights: { adapterName: "cbinsights"; field: keyof SupportFirmRow };
} = {
  signal_nfx: { adapterName: "signal_nfx", field: "signal_nfx_url" },
  cb_insights: { adapterName: "cbinsights", field: "cb_insights_url" },
  tracxn: { adapterName: "tracxn", field: "tracxn_url" },
  wellfound: { adapterName: "wellfound", field: "wellfound_url" },
  angellist: { adapterName: "angellist", field: "angellist_url" },
  medium: { adapterName: "medium", field: "medium_url" },
  substack: { adapterName: "substack", field: "substack_url" },
};

const URL_QA_FIELDS: Array<{ field: keyof SupportFirmRow; expectedKind?: string | null }> = [
  { field: "website_url", expectedKind: null },
  { field: "signal_nfx_url", expectedKind: "signal_nfx" },
  { field: "cb_insights_url", expectedKind: "cbinsights" },
  { field: "tracxn_url", expectedKind: "tracxn" },
  { field: "wellfound_url", expectedKind: "wellfound" },
  { field: "angellist_url", expectedKind: "angellist" },
  { field: "medium_url", expectedKind: "medium" },
  { field: "substack_url", expectedKind: "substack" },
  { field: "blog_url", expectedKind: null },
];

export interface SupportFirmRow {
  id: string;
  firm_name: string;
  website_url?: string | null;
  cb_insights_url?: string | null;
  tracxn_url?: string | null;
  signal_nfx_url?: string | null;
  wellfound_url?: string | null;
  angellist_url?: string | null;
  medium_url?: string | null;
  substack_url?: string | null;
  blog_url?: string | null;
  linkedin_url?: string | null;
  description?: string | null;
  elevator_pitch?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  location?: string | null;
  founded_year?: number | null;
  min_check_size?: number | null;
  max_check_size?: number | null;
  thesis_verticals?: string[] | null;
  thesis_orientation?: string | null;
  sector_scope?: string | null;
  strategy_classifications?: string[] | null;
  canonical_hq_locked?: boolean | null;
  last_verified_at?: string | null;
}

export interface SupportEnrichmentConfig {
  limit: number;
  offset: number;
  commit: boolean;
  dry_run: boolean;
  concurrency: number;
  headless: boolean;
  storage_state_path?: string;
  firm_id?: string;
  freshness_days: number;
}

interface DuplicateDomainHit {
  domain: string;
  firmIds: string[];
  firmNames: string[];
}

interface FirmSupportOutcome {
  candidates: SupportUrlCandidateRow[];
  qaFlags: SupportQaFlagRow[];
}

function stableKey(parts: Array<string | null | undefined>): string {
  const data = parts.map((part) => (part ?? "").trim().toLowerCase()).join("::");
  return createHash("sha1").update(data).digest("hex");
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(0.999, Math.round(score * 1000) / 1000));
}

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  const text = String(value).trim();
  return text || null;
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function sameStringArray(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const left = [...new Set((a ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  const right = [...new Set((b ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function buildCandidateRow(input: {
  firmId: string;
  sourceName: CandidateSourceKey;
  candidateUrl: string;
  confidenceScore: number;
  discoveryMethod: string;
}): SupportUrlCandidateRow {
  const discoveredAt = new Date().toISOString();
  return {
    candidate_key: stableKey([input.firmId, input.sourceName, input.candidateUrl]),
    firm_id: input.firmId,
    source_name: input.sourceName,
    candidate_url: input.candidateUrl,
    confidence_score: clampScore(input.confidenceScore),
    discovery_method: input.discoveryMethod,
    discovered_at: discoveredAt,
  };
}

function buildQaFlagRow(input: {
  firmId: string;
  flagType: string;
  fieldName?: string | null;
  currentValue?: string | null;
  suggestedValue?: string | null;
  confidenceScore: number;
}): SupportQaFlagRow {
  const currentValue = normalizeString(input.currentValue);
  const suggestedValue = normalizeString(input.suggestedValue);
  return {
    flag_key: stableKey([
      input.firmId,
      input.flagType,
      input.fieldName ?? "",
      currentValue ?? "",
      suggestedValue ?? "",
    ]),
    firm_id: input.firmId,
    flag_type: input.flagType,
    field_name: input.fieldName ?? null,
    current_value: currentValue,
    suggested_value: suggestedValue,
    confidence_score: clampScore(input.confidenceScore),
    created_at: new Date().toISOString(),
  };
}

function needsCandidateDiscovery(row: SupportFirmRow): boolean {
  return (Object.values(CANDIDATE_SOURCE_FIELDS) as Array<keyof SupportFirmRow>).some((field) => {
    const value = row[field];
    return typeof value !== "string" || !value.trim();
  });
}

function hasQaNeed(row: SupportFirmRow): boolean {
  if (row.founded_year == null) return true;
  if (row.min_check_size == null && row.max_check_size == null) return true;
  if (row.location?.trim() && (!row.hq_city?.trim() || !row.hq_country?.trim())) return true;

  return URL_QA_FIELDS.some(({ field }) => {
    const value = row[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function buildFirmSeed(row: SupportFirmRow): FirmSeed {
  return {
    id: row.id,
    firm_name: row.firm_name,
    website_url: row.website_url ?? null,
    linkedin_url: row.linkedin_url ?? null,
    domain: extractDomain(row.website_url ?? null) ?? undefined,
    known_urls: {
      website: row.website_url ?? undefined,
      signal_nfx: row.signal_nfx_url ?? undefined,
      cbinsights: row.cb_insights_url ?? undefined,
      tracxn: row.tracxn_url ?? undefined,
      wellfound: row.wellfound_url ?? undefined,
      angellist: row.angellist_url ?? undefined,
      medium: row.medium_url ?? undefined,
      substack: row.substack_url ?? undefined,
      linkedin: row.linkedin_url ?? undefined,
    },
  };
}

async function selectSupportFirms(
  db: SupabaseClient,
  cfg: SupportEnrichmentConfig,
  logger: Logger,
): Promise<SupportFirmRow[]> {
  const selectCols = [
    "id",
    "firm_name",
    "website_url",
    "cb_insights_url",
    "tracxn_url",
    "signal_nfx_url",
    "wellfound_url",
    "angellist_url",
    "medium_url",
    "substack_url",
    "blog_url",
    "linkedin_url",
    "description",
    "elevator_pitch",
    "hq_city",
    "hq_state",
    "hq_country",
    "location",
    "founded_year",
    "min_check_size",
    "max_check_size",
    "thesis_verticals",
    "thesis_orientation",
    "sector_scope",
    "strategy_classifications",
    "canonical_hq_locked",
    "last_verified_at",
  ].join(",");

  let query = db
    .from("firm_records")
    .select(selectCols)
    .is("deleted_at", null)
    .order("firm_name");

  if (cfg.firm_id) {
    query = query.eq("id", cfg.firm_id);
  } else {
    const scan = Math.min(5000, Math.max(cfg.limit * 5, 500));
    query = query.range(cfg.offset, cfg.offset + scan - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`support firm selection failed: ${error.message}`);

  let rows = ((data ?? []) as unknown as SupportFirmRow[]).filter(
    (row) => needsCandidateDiscovery(row) || hasQaNeed(row),
  );

  if (cfg.freshness_days > 0) {
    const threshold = Date.now() - cfg.freshness_days * 86_400_000;
    rows = rows.filter((row) => !row.last_verified_at || new Date(row.last_verified_at).getTime() < threshold);
  }

  if (!cfg.firm_id) rows = rows.slice(0, cfg.limit);
  logger.info("support.selected", { count: rows.length });
  return rows;
}

async function buildDuplicateDomainMap(db: SupabaseClient): Promise<Map<string, DuplicateDomainHit>> {
  const duplicateMap = new Map<string, DuplicateDomainHit>();
  let from = 0;
  const pageSize = 2000;

  while (true) {
    const { data, error } = await db
      .from("firm_records")
      .select("id,firm_name,website_url")
      .is("deleted_at", null)
      .not("website_url", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`duplicate-domain scan failed: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: string; firm_name: string; website_url: string | null }>;
    if (!rows.length) break;

    for (const row of rows) {
      const domain = extractDomain(row.website_url ?? null);
      if (!domain) continue;
      const existing = duplicateMap.get(domain) ?? { domain, firmIds: [], firmNames: [] };
      existing.firmIds.push(row.id);
      existing.firmNames.push(row.firm_name);
      duplicateMap.set(domain, existing);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  for (const [domain, hit] of [...duplicateMap.entries()]) {
    const distinctIds = [...new Set(hit.firmIds)];
    if (distinctIds.length < 2) {
      duplicateMap.delete(domain);
      continue;
    }
    duplicateMap.set(domain, {
      domain,
      firmIds: distinctIds,
      firmNames: [...new Set(hit.firmNames)],
    });
  }

  return duplicateMap;
}

async function maybeDiscoverWithAdapter(
  adapter: SourceAdapter,
  seed: FirmSeed,
  ctx: AdapterContext,
  rateLimiter: RateLimiter,
): Promise<string | null> {
  const discovered = await rateLimiter.run(adapter.name, () => adapter.discoverFirmUrl(seed, ctx));
  return normalizeUrl(discovered);
}

async function maybeExtractWithAdapter(
  adapter: SourceAdapter,
  url: string,
  seed: FirmSeed,
  ctx: AdapterContext,
  rateLimiter: RateLimiter,
): Promise<AdapterResult | null> {
  const result = await rateLimiter.run(adapter.name, () => adapter.extractFirmProfile(url, seed, ctx));
  if (!result || result.match_confidence < 0.55) return null;
  result.profile = normalizeProfile(result.profile);
  return result;
}

function addCandidate(
  candidates: Map<string, SupportUrlCandidateRow>,
  row: SupportFirmRow,
  sourceName: CandidateSourceKey,
  candidateUrl: string | null | undefined,
  confidenceScore: number,
  discoveryMethod: string,
): void {
  const normalized = normalizeUrl(candidateUrl);
  if (!normalized) return;
  const field = CANDIDATE_SOURCE_FIELDS[sourceName];
  const currentValue = normalizeUrl(normalizeString(row[field]));
  if (currentValue) return;

  const key = `${sourceName}::${normalized}`;
  const next = buildCandidateRow({
    firmId: row.id,
    sourceName,
    candidateUrl: normalized,
    confidenceScore,
    discoveryMethod,
  });

  const existing = candidates.get(key);
  if (!existing || next.confidence_score > existing.confidence_score) {
    candidates.set(key, next);
  }
}

function flagInvalidUrls(row: SupportFirmRow, qaFlags: Map<string, SupportQaFlagRow>): void {
  for (const { field, expectedKind } of URL_QA_FIELDS) {
    const current = normalizeString(row[field]);
    if (!current) continue;

    const normalized = normalizeUrl(current);
    if (!normalized) {
      const flag = buildQaFlagRow({
        firmId: row.id,
        flagType: "invalid_or_malformed_url",
        fieldName: String(field),
        currentValue: current,
        suggestedValue: null,
        confidenceScore: 0.95,
      });
      qaFlags.set(flag.flag_key, flag);
      continue;
    }

    if (expectedKind) {
      const classified = classifyUrl(normalized);
      if (classified !== expectedKind) {
        const flag = buildQaFlagRow({
          firmId: row.id,
          flagType: "invalid_or_malformed_url",
          fieldName: String(field),
          currentValue: current,
          suggestedValue: normalized,
          confidenceScore: 0.9,
        });
        qaFlags.set(flag.flag_key, flag);
      }
    }
  }
}

function flagDuplicateWebsiteDomain(
  row: SupportFirmRow,
  duplicates: Map<string, DuplicateDomainHit>,
  qaFlags: Map<string, SupportQaFlagRow>,
): void {
  const domain = extractDomain(row.website_url ?? null);
  if (!domain) return;
  const hit = duplicates.get(domain);
  if (!hit || !hit.firmIds.includes(row.id)) return;

  const others = hit.firmNames.filter((name) => !sameText(name, row.firm_name)).slice(0, 5);
  if (!others.length) return;

  const flag = buildQaFlagRow({
    firmId: row.id,
    flagType: "duplicate_domain",
    fieldName: "website_url",
    currentValue: row.website_url ?? domain,
    suggestedValue: `Also used by: ${others.join(", ")}`,
    confidenceScore: 0.9,
  });
  qaFlags.set(flag.flag_key, flag);
}

function flagMissingFacts(
  row: SupportFirmRow,
  merged: AdapterResult[] | null,
  qaFlags: Map<string, SupportQaFlagRow>,
): void {
  let suggestedFoundedYear: string | null = null;
  let suggestedCheckSize: string | null = null;

  if (merged?.length) {
    const mergedProfile = mergeAdapterResults(merged).profile;
    if (mergedProfile.founded_year != null) suggestedFoundedYear = String(mergedProfile.founded_year);
    const checkSize = formatCheckSize({
      min: mergedProfile.min_check_size ?? undefined,
      max: mergedProfile.max_check_size ?? undefined,
    });
    if (checkSize) suggestedCheckSize = checkSize;
  }

  if (row.founded_year == null) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "missing_founded_year",
      fieldName: "founded_year",
      currentValue: null,
      suggestedValue: suggestedFoundedYear,
      confidenceScore: suggestedFoundedYear ? 0.8 : 0.45,
    });
    qaFlags.set(flag.flag_key, flag);
  }

  if (row.min_check_size == null && row.max_check_size == null) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "missing_check_size",
      fieldName: "check_size",
      currentValue: null,
      suggestedValue: suggestedCheckSize,
      confidenceScore: suggestedCheckSize ? 0.78 : 0.45,
    });
    qaFlags.set(flag.flag_key, flag);
  }
}

function buildHqLine(city?: string | null, state?: string | null, country?: string | null): string | null {
  const parts = [city, state, country].map((part) => (part ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function flagHqConflicts(
  row: SupportFirmRow,
  mergedResults: AdapterResult[] | null,
  qaFlags: Map<string, SupportQaFlagRow>,
): void {
  const currentLine = buildHqLine(row.hq_city, row.hq_state, row.hq_country) ?? normalizeString(row.location);
  const parsedLocation = parseGeo(row.location ?? null);
  const parsedLine = buildHqLine(parsedLocation?.city, parsedLocation?.state, parsedLocation?.country);

  if (parsedLine && currentLine && !sameText(parsedLine, currentLine)) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "suspicious_hq_conflict",
      fieldName: "location",
      currentValue: currentLine,
      suggestedValue: parsedLine,
      confidenceScore: 0.58,
    });
    qaFlags.set(flag.flag_key, flag);
  }

  if (!mergedResults?.length) return;
  const mergedProfile = mergeAdapterResults(mergedResults).profile;
  const suggestedLine = buildHqLine(mergedProfile.hq_city, mergedProfile.hq_state, mergedProfile.hq_country);
  if (!suggestedLine || !currentLine || sameText(suggestedLine, currentLine)) return;

  const flag = buildQaFlagRow({
    firmId: row.id,
    flagType: "suspicious_hq_conflict",
    fieldName: "hq_city",
    currentValue: currentLine,
    suggestedValue: suggestedLine,
    confidenceScore: row.canonical_hq_locked ? 0.72 : 0.67,
  });
  qaFlags.set(flag.flag_key, flag);
}

function flagClassificationConflicts(
  row: SupportFirmRow,
  mergedResults: AdapterResult[] | null,
  qaFlags: Map<string, SupportQaFlagRow>,
): void {
  if (!mergedResults?.length) return;

  const merged = mergeAdapterResults(mergedResults);
  const classification = classifyFirm(toClassificationInput(merged.profile, {
    source_tags: [
      ...(merged.profile.sectors ?? []),
      ...(merged.profile.themes ?? []),
    ],
  }));

  const classificationPatch: Record<string, unknown> = {};
  for (const [field, entry] of Object.entries(classification)) {
    if (entry) classificationPatch[field] = entry.value;
  }
  const enriched = applyInvestmentIntelToProfile({
    ...merged.profile,
    ...classificationPatch,
  });

  if (row.thesis_orientation && enriched.thesis_orientation && !sameText(row.thesis_orientation, enriched.thesis_orientation)) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "conflicting_classification",
      fieldName: "thesis_orientation",
      currentValue: row.thesis_orientation,
      suggestedValue: enriched.thesis_orientation,
      confidenceScore: 0.72,
    });
    qaFlags.set(flag.flag_key, flag);
  }

  if (row.sector_scope && enriched.sector_scope && !sameText(row.sector_scope, enriched.sector_scope)) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "conflicting_classification",
      fieldName: "sector_scope",
      currentValue: row.sector_scope,
      suggestedValue: enriched.sector_scope,
      confidenceScore: 0.72,
    });
    qaFlags.set(flag.flag_key, flag);
  }

  if (
    Array.isArray(row.strategy_classifications) &&
    row.strategy_classifications.length &&
    Array.isArray(enriched.strategy_classifications) &&
    enriched.strategy_classifications.length &&
    !sameStringArray(row.strategy_classifications, enriched.strategy_classifications)
  ) {
    const flag = buildQaFlagRow({
      firmId: row.id,
      flagType: "conflicting_classification",
      fieldName: "strategy_classifications",
      currentValue: row.strategy_classifications.join(", "),
      suggestedValue: enriched.strategy_classifications.join(", "),
      confidenceScore: 0.7,
    });
    qaFlags.set(flag.flag_key, flag);
  }
}

async function processSupportFirm(
  row: SupportFirmRow,
  ctx: AdapterContext,
  rateLimiter: RateLimiter,
  duplicateDomains: Map<string, DuplicateDomainHit>,
  logger: Logger,
): Promise<FirmSupportOutcome> {
  const firmLogger = logger.child({ firm: row.firm_name, firm_id: row.id });
  const seed = buildFirmSeed(row);
  const candidates = new Map<string, SupportUrlCandidateRow>();
  const qaFlags = new Map<string, SupportQaFlagRow>();
  const extractedResults: AdapterResult[] = [];

  flagInvalidUrls(row, qaFlags);
  flagDuplicateWebsiteDomain(row, duplicateDomains, qaFlags);

  const websiteUrl = normalizeUrl(await websiteAdapter.discoverFirmUrl(seed, ctx));
  let websiteResult: AdapterResult | null = null;
  if (websiteUrl) {
    websiteResult = await maybeExtractWithAdapter(websiteAdapter, websiteUrl, seed, ctx, rateLimiter);
    if (websiteResult) {
      extractedResults.push(websiteResult);
      addCandidate(
        candidates,
        row,
        "medium",
        websiteResult.profile.medium_url,
        baseConfidence("website") * websiteResult.match_confidence,
        "website_outbound_link",
      );
      addCandidate(
        candidates,
        row,
        "substack",
        websiteResult.profile.substack_url,
        baseConfidence("website") * websiteResult.match_confidence,
        "website_outbound_link",
      );
      addCandidate(
        candidates,
        row,
        "blog",
        websiteResult.profile.blog_url,
        baseConfidence("website") * websiteResult.match_confidence,
        "website_blog_link",
      );
    }
  }

  for (const sourceName of ["signal_nfx", "cb_insights", "tracxn", "wellfound", "angellist"] as CandidateSourceKey[]) {
    const { adapterName, field } = CANDIDATE_ADAPTERS[sourceName];
    const adapter = ADAPTERS_BY_NAME[adapterName];
    if (!adapter) continue;

    const existingUrl = normalizeString(row[field]);
    let sourceUrl = normalizeUrl(existingUrl);
    let discovered = false;

    if (!sourceUrl) {
      sourceUrl = await maybeDiscoverWithAdapter(adapter, seed, ctx, rateLimiter);
      discovered = Boolean(sourceUrl);
      if (sourceUrl) {
        addCandidate(
          candidates,
          row,
          sourceName,
          sourceUrl,
          baseConfidence(adapter.name) * 0.78,
          `${adapter.name}_discover`,
        );
      }
    }

    if (!sourceUrl) continue;
    const extracted = await maybeExtractWithAdapter(adapter, sourceUrl, seed, ctx, rateLimiter);
    if (!extracted) continue;
    extractedResults.push(extracted);

    if (discovered) {
      addCandidate(
        candidates,
        row,
        sourceName,
        sourceUrl,
        baseConfidence(adapter.name) * extracted.match_confidence,
        `${adapter.name}_discover+profile_match`,
      );
    }
  }

  const mediumUrl = normalizeUrl(row.medium_url ?? websiteResult?.profile.medium_url ?? null);
  if (mediumUrl) {
    const extracted = await maybeExtractWithAdapter(mediumAdapter, mediumUrl, seed, ctx, rateLimiter);
    if (extracted) extractedResults.push(extracted);
    if (!row.blog_url) {
      addCandidate(
        candidates,
        row,
        "blog",
        mediumUrl,
        baseConfidence("medium") * (extracted?.match_confidence ?? 0.75),
        row.medium_url ? "derived_from_existing_medium_url" : "derived_from_discovered_medium_url",
      );
    }
  }

  const substackUrl = normalizeUrl(row.substack_url ?? websiteResult?.profile.substack_url ?? null);
  if (substackUrl) {
    const extracted = await maybeExtractWithAdapter(substackAdapter, substackUrl, seed, ctx, rateLimiter);
    if (extracted) extractedResults.push(extracted);
    if (!row.blog_url) {
      addCandidate(
        candidates,
        row,
        "blog",
        substackUrl,
        baseConfidence("substack") * (extracted?.match_confidence ?? 0.75),
        row.substack_url ? "derived_from_existing_substack_url" : "derived_from_discovered_substack_url",
      );
    }
  }

  flagMissingFacts(row, extractedResults.length ? extractedResults : null, qaFlags);
  flagHqConflicts(row, extractedResults.length ? extractedResults : null, qaFlags);
  flagClassificationConflicts(row, extractedResults.length ? extractedResults : null, qaFlags);

  firmLogger.info("support.firm.done", {
    candidate_count: candidates.size,
    qa_flag_count: qaFlags.size,
    extracted_sources: extractedResults.length,
  });

  return {
    candidates: [...candidates.values()],
    qaFlags: [...qaFlags.values()],
  };
}

export async function runSupportEnrichment(
  db: SupabaseClient,
  cfg: SupportEnrichmentConfig,
  logger = createLogger({ pid: process.pid, job: "support_enrichment" }),
): Promise<{ processed: number; candidateRows: number; qaFlagRows: number; failed: number }> {
  const firms = await selectSupportFirms(db, cfg, logger);
  const duplicateDomains = await buildDuplicateDomainMap(db);

  const browser = new BrowserManager({
    headless: cfg.headless,
    storageStatePaths: resolveStoragePaths(cfg.storage_state_path ? { website: cfg.storage_state_path } : {}),
    defaultTimeoutMs: 30_000,
    logger,
  });
  await browser.start();

  const rateLimiter = new RateLimiter();
  const ctx: AdapterContext = {
    getPage: (source) => browser.getPage(source),
    releasePage: (source, page) => browser.releasePage(source, page),
    throttle: async (source) => {
      await rateLimiter.acquire(source);
      rateLimiter.release(source);
    },
    logger,
    dryRun: cfg.dry_run,
  };

  const allCandidates: SupportUrlCandidateRow[] = [];
  const allQaFlags: SupportQaFlagRow[] = [];
  let processed = 0;
  let failed = 0;
  const queue = [...firms];
  const concurrency = Math.max(1, cfg.concurrency);

  async function worker(): Promise<void> {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      try {
        const outcome = await processSupportFirm(next, ctx, rateLimiter, duplicateDomains, logger);
        allCandidates.push(...outcome.candidates);
        allQaFlags.push(...outcome.qaFlags);
      } catch (error) {
        failed += 1;
        logger.error("support.firm.failed", {
          firm_id: next.id,
          firm: next.firm_name,
          err: (error as Error).message,
        });
      } finally {
        processed += 1;
        if (processed % 10 === 0) {
          logger.info("support.progress", {
            processed,
            total: firms.length,
            candidate_rows: allCandidates.length,
            qa_flag_rows: allQaFlags.length,
            failed,
          });
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    await browser.stop();
  }

  await upsertSupportUrlCandidates(db, dedupeCandidates(allCandidates), { dryRun: cfg.dry_run, logger });
  await upsertSupportQaFlags(db, dedupeQaFlags(allQaFlags), { dryRun: cfg.dry_run, logger });

  logger.info("support.done", {
    processed,
    candidate_rows: allCandidates.length,
    qa_flag_rows: allQaFlags.length,
    failed,
  });

  return {
    processed,
    candidateRows: allCandidates.length,
    qaFlagRows: allQaFlags.length,
    failed,
  };
}

function dedupeCandidates(rows: SupportUrlCandidateRow[]): SupportUrlCandidateRow[] {
  const map = new Map<string, SupportUrlCandidateRow>();
  for (const row of rows) {
    const existing = map.get(row.candidate_key);
    if (!existing || row.confidence_score > existing.confidence_score) map.set(row.candidate_key, row);
  }
  return [...map.values()];
}

function dedupeQaFlags(rows: SupportQaFlagRow[]): SupportQaFlagRow[] {
  const map = new Map<string, SupportQaFlagRow>();
  for (const row of rows) {
    const existing = map.get(row.flag_key);
    if (!existing || row.confidence_score > existing.confidence_score) map.set(row.flag_key, row);
  }
  return [...map.values()];
}
