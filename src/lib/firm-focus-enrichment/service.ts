import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../backfill/logger";
import type {
  FirmFocusEvidence,
  FirmFocusExtraction,
  FirmFocusFirmRow,
  FirmFocusReportRow,
  FirmFocusRunStats,
  FirmFocusSourceType,
} from "./types";
import {
  detectUnderrepresentedFoundersFocus,
  inferFundNameFromText,
  normalizeDateString,
  normalizeGeoFocus,
  normalizeSectorFocus,
  normalizeStageFocus,
  normalizeThemes,
  parseMoneyToUsd,
  toFirmRecordStageFocus,
} from "./normalize";

const TARGET_PATHS = [
  "/",
  "/about",
  "/team",
  "/portfolio",
  "/focus",
  "/thesis",
  "/approach",
  "/investment-criteria",
  "/news",
  "/blog",
  "/announcements",
];

const SOURCE_PRIORITY: Record<FirmFocusSourceType, number> = {
  official_site: 100,
  official_blog: 92,
  techcrunch: 82,
  press_release: 70,
  other: 50,
};

const DEFAULT_HEADERS = {
  "user-agent": "VEKTA firm focus enrichment bot/1.0",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

interface PageContent {
  url: string;
  title: string | null;
  publishedAt: string | null;
  text: string;
}

interface CandidateValue {
  field: string;
  value: unknown;
  confidence: number;
  sourceType: FirmFocusSourceType;
  sourceUrl: string;
  sourceTitle: string | null;
  snippet: string;
}

export interface FirmFocusRunConfig {
  limit: number;
  offset: number;
  commit: boolean;
  firmId?: string;
  minConfidence: number;
  reportPath?: string;
}

export interface FirmFocusRunResult {
  runId: string | null;
  stats: FirmFocusRunStats;
  reportPath: string;
  rows: FirmFocusReportRow[];
}

export class FirmFocusEnrichmentService {
  private readonly db: SupabaseClient<any, "public", any>;
  private readonly logger = createLogger({ job: "firm_focus_enrichment", pid: process.pid });
  private readonly firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim() || "";
  private readonly exaKey = process.env.EXA_API_KEY?.trim() || "";
  private readonly robotsCache = new Map<string, string[] | null>();
  private firmRecordColumnsCache: Set<string> | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    this.db = createClient(url, key);
  }

  async run(config: FirmFocusRunConfig): Promise<FirmFocusRunResult> {
    const startedAt = new Date().toISOString();
    const reportRows: FirmFocusReportRow[] = [];
    const stats: FirmFocusRunStats = {
      processed: 0,
      updated: 0,
      reviewed: 0,
      failed: 0,
      skipped: 0,
    };

    if (config.commit) {
      await this.assertCommitSchema();
    }

    const firmRecordColumns = await this.getFirmRecordColumns();
    const runId = config.commit ? await this.createRun(config, startedAt) : null;
    const firms = await this.selectFirms(config);
    this.logger.info("firm_focus.selected", { count: firms.length, commit: config.commit });

    for (const firm of firms) {
      const child = this.logger.child({ firm_id: firm.id, firm_name: firm.firm_name });
      try {
        const beforeMissing = this.computeMissingFields(firm, config.minConfidence);
        if (!beforeMissing.length) {
          stats.skipped += 1;
          continue;
        }

        const extraction = await this.enrichFirm(firm, child);
        const patch = this.buildFirmPatch(firm, extraction, config.minConfidence, firmRecordColumns);
        const fieldsFilled = Object.keys(patch).filter((key) => beforeMissing.includes(key));
        const needsManualReview = extraction.extraction_confidence < config.minConfidence || fieldsFilled.length === 0;

        reportRows.push({
          firm_name: firm.firm_name,
          missing_fields_before: beforeMissing,
          fields_filled: fieldsFilled,
          extraction_confidence: extraction.extraction_confidence,
          latest_fund_name: extraction.latest_fund_name,
          latest_fund_size_usd: extraction.latest_fund_size_usd,
          evidence_count: extraction.evidence.length,
          needs_manual_review: needsManualReview,
        });

        if (!fieldsFilled.length && !extraction.evidence.length) {
          stats.skipped += 1;
          if (config.commit && runId) {
            await this.logBackfillRun(firm, [], "skipped", null);
          }
          continue;
        }

        if (config.commit) {
          await this.persistExtraction(runId, firm, extraction, patch, needsManualReview);
        }

        stats.processed += 1;
        if (fieldsFilled.length) stats.updated += 1;
        if (needsManualReview) stats.reviewed += 1;
      } catch (error) {
        stats.failed += 1;
        child.error("firm_focus.failed", { err: error instanceof Error ? error.message : String(error) });
      }
    }

    const reportPath = await this.writeReport(reportRows, config.reportPath);
    if (config.commit && runId) {
      await this.finishRun(runId, stats, reportPath);
    }

    return { runId, stats, reportPath, rows: reportRows };
  }

  private async getFirmRecordColumns(): Promise<Set<string>> {
    if (this.firmRecordColumnsCache) {
      return this.firmRecordColumnsCache;
    }

    const requiredColumns = ["id", "firm_name"];
    const optionalColumns = [
      "website_url",
      "blog_url",
      "firm_blog_url",
      "stage_focus",
      "sector_focus",
      "investment_themes",
      "geo_focus",
      "latest_fund_name",
      "latest_fund_size_usd",
      "latest_fund_announcement_date",
      "last_fund_announcement_date",
      "underrepresented_founders_focus",
      "evidence_urls",
      "extraction_confidence",
      "intel_confidence_score",
      "last_verified_at",
      "manual_review_status",
      "focus_enriched_at",
    ];

    const availableColumns = new Set<string>(requiredColumns);
    const baseSelect = requiredColumns.join(",");

    const baseProbe = await this.db.from("firm_records").select(baseSelect).limit(1);
    if (baseProbe.error) {
      throw new Error(`Failed to inspect firm_records columns: ${baseProbe.error.message}`);
    }

    for (const column of optionalColumns) {
      const probe = await this.db.from("firm_records").select(`${baseSelect},${column}`).limit(1);
      if (!probe.error) {
        availableColumns.add(column);
        continue;
      }

      if (!/column .* does not exist/i.test(probe.error.message)) {
        throw new Error(`Failed to inspect firm_records columns: ${probe.error.message}`);
      }
    }

    this.firmRecordColumnsCache = availableColumns;
    return this.firmRecordColumnsCache;
  }

  private async assertCommitSchema(): Promise<void> {
    const firmColumns = await this.getFirmRecordColumns();
    const requiredFirmColumns = [
      "sector_focus",
      "latest_fund_name",
      "latest_fund_announcement_date",
      "underrepresented_founders_focus",
      "evidence_urls",
      "extraction_confidence",
      "focus_enriched_at",
    ];
    const missingFirmColumns = requiredFirmColumns.filter((column) => !firmColumns.has(column));

    const missingTables: string[] = [];
    for (const tableName of ["firm_enrichment_runs", "firm_field_values", "firm_source_evidence"]) {
      const probe = await this.db.from(tableName).select("*").limit(1);
      if (!probe.error) continue;
      if (/could not find the table|relation .* does not exist/i.test(probe.error.message)) {
        missingTables.push(tableName);
        continue;
      }
      throw new Error(`Failed to inspect enrichment tables: ${probe.error.message}`);
    }

    if (missingFirmColumns.length || missingTables.length) {
      const missingParts = [
        missingFirmColumns.length ? `firm_records columns: ${missingFirmColumns.join(", ")}` : null,
        missingTables.length ? `tables: ${missingTables.join(", ")}` : null,
      ].filter(Boolean);
      throw new Error(
        `Missing firm-focus enrichment schema (${missingParts.join("; ")}). Apply supabase/migrations/20260420173000_firm_focus_enrichment_pipeline.sql before running commit mode.`,
      );
    }
  }

  private async createRun(config: FirmFocusRunConfig, startedAt: string): Promise<string> {
    const payload = {
      mode: config.commit ? "commit" : "dry_run",
      status: "running",
      started_at: startedAt,
      commit_mode: config.commit,
      limit_count: config.limit,
      offset_count: config.offset,
      config_json: config,
    };
    const { data, error } = await this.db.from("firm_enrichment_runs").insert(payload).select("id").single();
    if (error) throw new Error(`Failed to create firm_enrichment_runs row: ${error.message}`);
    return data.id as string;
  }

  private async finishRun(runId: string, stats: FirmFocusRunStats, reportPath: string): Promise<void> {
    const { error } = await this.db
      .from("firm_enrichment_runs")
      .update({
        status: stats.failed ? "completed_with_errors" : "completed",
        finished_at: new Date().toISOString(),
        processed_count: stats.processed,
        updated_count: stats.updated,
        review_count: stats.reviewed,
        failed_count: stats.failed,
        skipped_count: stats.skipped,
        report_path: reportPath,
      })
      .eq("id", runId);
    if (error) throw new Error(`Failed to finish run ${runId}: ${error.message}`);
  }

  private async selectFirms(config: FirmFocusRunConfig): Promise<FirmFocusFirmRow[]> {
    const requestedColumns = [
      "id",
      "firm_name",
      "website_url",
      "blog_url",
      "firm_blog_url",
      "stage_focus",
      "sector_focus",
      "investment_themes",
      "geo_focus",
      "latest_fund_name",
      "latest_fund_size_usd",
      "latest_fund_announcement_date",
      "last_fund_announcement_date",
      "underrepresented_founders_focus",
      "evidence_urls",
      "extraction_confidence",
      "intel_confidence_score",
      "last_verified_at",
      "manual_review_status",
    ];

    const availableColumns = await this.getFirmRecordColumns();
    const selectedColumns = requestedColumns.filter((column) => availableColumns.has(column));

    if (!selectedColumns.includes("id") || !selectedColumns.includes("firm_name")) {
      throw new Error("firm_records is missing required columns: id and/or firm_name");
    }

    let query = this.db.from("firm_records").select(selectedColumns.join(",")).order("firm_name");
    if (config.firmId) query = query.eq("id", config.firmId);
    if (config.limit > 0) query = query.range(config.offset, config.offset + config.limit - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load firm_records: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      firm_name: String(row.firm_name),
      website_url: typeof row.website_url === "string" ? row.website_url : null,
      blog_url: typeof row.blog_url === "string" ? row.blog_url : null,
      firm_blog_url: typeof row.firm_blog_url === "string" ? row.firm_blog_url : null,
      stage_focus: Array.isArray(row.stage_focus) ? row.stage_focus : null,
      sector_focus: Array.isArray(row.sector_focus) ? row.sector_focus : null,
      investment_themes: Array.isArray(row.investment_themes) ? row.investment_themes : null,
      geo_focus: Array.isArray(row.geo_focus) ? row.geo_focus : null,
      latest_fund_name: typeof row.latest_fund_name === "string" ? row.latest_fund_name : null,
      latest_fund_size_usd: typeof row.latest_fund_size_usd === "number" ? row.latest_fund_size_usd : null,
      latest_fund_announcement_date:
        typeof row.latest_fund_announcement_date === "string" ? row.latest_fund_announcement_date : null,
      last_fund_announcement_date:
        typeof row.last_fund_announcement_date === "string" ? row.last_fund_announcement_date : null,
      underrepresented_founders_focus:
        typeof row.underrepresented_founders_focus === "boolean" ? row.underrepresented_founders_focus : null,
      evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : null,
      extraction_confidence: typeof row.extraction_confidence === "number" ? row.extraction_confidence : null,
      intel_confidence_score: typeof row.intel_confidence_score === "number" ? row.intel_confidence_score : null,
      last_verified_at: typeof row.last_verified_at === "string" ? row.last_verified_at : null,
      manual_review_status: typeof row.manual_review_status === "string" ? row.manual_review_status : null,
    })) as FirmFocusFirmRow[];
  }

  computeMissingFields(firm: FirmFocusFirmRow, minConfidence: number): string[] {
    const lowConfidence = (firm.extraction_confidence ?? firm.intel_confidence_score ?? 0) < minConfidence;
    const emptyList = (value: unknown) => !Array.isArray(value) || value.length === 0;
    const missing: string[] = [];
    if (emptyList(firm.stage_focus) || lowConfidence) missing.push("stage_focus");
    if (emptyList(firm.sector_focus) || lowConfidence) missing.push("sector_focus");
    if (emptyList(firm.investment_themes) || lowConfidence) missing.push("themes");
    if (emptyList(firm.geo_focus) || lowConfidence) missing.push("geo_focus");
    if (!firm.latest_fund_name) missing.push("latest_fund_name");
    if (!firm.latest_fund_size_usd) missing.push("latest_fund_size_usd");
    if (!(firm.latest_fund_announcement_date ?? firm.last_fund_announcement_date)) missing.push("latest_fund_announcement_date");
    if (firm.underrepresented_founders_focus == null || lowConfidence) missing.push("underrepresented_founders_focus");
    if (emptyList(firm.evidence_urls) || lowConfidence) missing.push("evidence_urls");
    if (firm.extraction_confidence == null || firm.extraction_confidence < minConfidence) missing.push("extraction_confidence");
    return missing;
  }

  private async enrichFirm(firm: FirmFocusFirmRow, logger = this.logger): Promise<FirmFocusExtraction> {
    const officialPages = await this.collectOfficialPages(
      firm.website_url,
      [firm.blog_url, firm.firm_blog_url].filter(Boolean) as string[],
      logger,
    );
    const officialEvidence = await this.extractFromPages(firm, officialPages, logger);

    const needsTechCrunch =
      !officialEvidence.some((e) => e.field === "latest_fund_name") ||
      !officialEvidence.some((e) => e.field === "latest_fund_size_usd") ||
      !officialEvidence.some((e) => e.field === "latest_fund_announcement_date");

    const tcEvidence = needsTechCrunch ? await this.collectTechCrunchEvidence(firm, logger) : [];
    const pressEvidence = !tcEvidence.length ? await this.collectPressEvidence(firm, logger) : [];
    const evidence = [...officialEvidence, ...tcEvidence, ...pressEvidence];

    const extraction = this.mergeEvidence(firm, evidence);
    if (!officialPages.length) {
      extraction.extraction_notes.push("No official website pages could be fetched within crawl bounds.");
    }
    if (!tcEvidence.length) {
      extraction.extraction_notes.push("No TechCrunch corroboration found for this firm within targeted search bounds.");
    }
    if (!pressEvidence.length && !extraction.latest_fund_size_usd) {
      extraction.extraction_notes.push("No PR fallback evidence found for missing fund amount.");
    }
    return extraction;
  }

  private async collectOfficialPages(baseUrl: string | null, knownBlogUrls: string[], logger = this.logger): Promise<PageContent[]> {
    if (!baseUrl) return [];
    const normalizedBase = this.normalizeUrl(baseUrl);
    if (!normalizedBase) return [];

    const urls = new Set<string>();
    for (const pathName of TARGET_PATHS) {
      urls.add(new URL(pathName, normalizedBase).toString());
    }

    const homepage = await this.fetchPage(normalizedBase, "official_site", logger);
    if (!homepage) return [];

    const host = new URL(normalizedBase).host;
    for (const href of this.extractLinksFromHtml(homepage.text, normalizedBase)) {
      try {
        const parsed = new URL(href);
        if (parsed.host !== host) continue;
        if (/(blog|news|announcements?|press|thesis|focus|approach)/i.test(parsed.pathname)) {
          urls.add(parsed.toString());
        }
      } catch {
        continue;
      }
    }

    for (const blogUrl of knownBlogUrls) {
      const normalized = this.normalizeUrl(blogUrl);
      if (normalized) urls.add(normalized);
    }

    const pages: PageContent[] = [homepage];
    const sortedUrls = [...urls].filter((value) => value !== homepage.url).slice(0, 10);
    for (const url of sortedUrls) {
      const sourceType = /(blog|news|announcements?|press)/i.test(url) ? "official_blog" : "official_site";
      const page = await this.fetchPage(url, sourceType, logger);
      if (page) pages.push(page);
    }
    return pages;
  }

  private async extractFromPages(firm: FirmFocusFirmRow, pages: PageContent[], logger = this.logger): Promise<FirmFocusEvidence[]> {
    const evidence: FirmFocusEvidence[] = [];
    for (const page of pages) {
      const sourceType: FirmFocusSourceType = /(blog|news|announcements?|press)/i.test(page.url) ? "official_blog" : "official_site";
      evidence.push(...this.extractEvidenceFromText(firm, page, sourceType, logger));
    }
    return evidence;
  }

  private async collectTechCrunchEvidence(firm: FirmFocusFirmRow, logger = this.logger): Promise<FirmFocusEvidence[]> {
    const queries = [
      `${firm.firm_name} fund`,
      `${firm.firm_name} new fund`,
      `${firm.firm_name} closes fund`,
    ];

    const articleUrls = new Set<string>();
    for (const query of queries) {
      const url = `https://techcrunch.com/search/${encodeURIComponent(query)}`;
      const page = await this.fetchPage(url, "techcrunch", logger);
      if (!page) continue;
      for (const candidate of this.extractLinksFromHtml(page.text, url)) {
        if (/techcrunch\.com\/\d{4}\/\d{2}\/\d{2}\//i.test(candidate)) articleUrls.add(candidate);
      }
      if (articleUrls.size) break;
    }

    if (!articleUrls.size && this.exaKey) {
      for (const candidate of await this.searchWithExa(`site:techcrunch.com "${firm.firm_name}" fund`)) {
        articleUrls.add(candidate);
      }
    }

    const evidence: FirmFocusEvidence[] = [];
    for (const url of [...articleUrls].slice(0, 3)) {
      const page = await this.fetchPage(url, "techcrunch", logger);
      if (!page) continue;
      evidence.push(...this.extractEvidenceFromText(firm, page, "techcrunch", logger));
    }
    return evidence;
  }

  private async collectPressEvidence(firm: FirmFocusFirmRow, logger = this.logger): Promise<FirmFocusEvidence[]> {
    const searchUrl = `https://www.prnewswire.com/search/news/?keyword=${encodeURIComponent(`${firm.firm_name} fund`)}`;
    const searchPage = await this.fetchPage(searchUrl, "press_release", logger);
    const articleUrls = new Set<string>();
    if (searchPage) {
      for (const candidate of this.extractLinksFromHtml(searchPage.text, searchUrl)) {
        if (/prnewswire\.com\/news-releases\//i.test(candidate)) articleUrls.add(candidate);
      }
    }
    if (!articleUrls.size && this.exaKey) {
      for (const candidate of await this.searchWithExa(`site:prnewswire.com "${firm.firm_name}" fund`)) {
        articleUrls.add(candidate);
      }
    }

    const evidence: FirmFocusEvidence[] = [];
    for (const url of [...articleUrls].slice(0, 2)) {
      const page = await this.fetchPage(url, "press_release", logger);
      if (!page) continue;
      evidence.push(...this.extractEvidenceFromText(firm, page, "press_release", logger));
    }
    return evidence;
  }

  private extractEvidenceFromText(
    firm: FirmFocusFirmRow,
    page: PageContent,
    sourceType: FirmFocusSourceType,
    logger = this.logger,
  ): FirmFocusEvidence[] {
    const text = page.text;
    if (!text.trim()) return [];
    const evidence: FirmFocusEvidence[] = [];
    const baseConfidence = this.baseConfidence(sourceType);

    const stages = normalizeStageFocus(text);
    if (stages.length) {
      evidence.push({
        field: "stage_focus",
        value: stages,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(pre[\s-]?seed|seed|series[\s-]?[abc]|growth|multi[\s-]?stage|early[\s-]?stage)/i),
        confidence: Math.min(1, baseConfidence),
      });
    }

    const sectors = normalizeSectorFocus(text);
    if (sectors.length) {
      evidence.push({
        field: "sector_focus",
        value: sectors,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(ai|fintech|health|enterprise|consumer|climate|cyber|supply chain)/i),
        confidence: Math.min(1, baseConfidence - 0.02),
      });
    }

    const themes = normalizeThemes(text);
    if (themes.length) {
      evidence.push({
        field: "themes",
        value: themes,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(agentic ai|vertical ai|enterprise ai|underrepresented founders?|workflow automation|medical devices)/i),
        confidence: Math.min(1, baseConfidence - 0.03),
      });
    }

    const geos = normalizeGeoFocus(text);
    if (geos.length) {
      evidence.push({
        field: "geo_focus",
        value: geos,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(united states|u\.s\.|europe|uk|latam|india|global)/i),
        confidence: Math.min(1, baseConfidence - 0.02),
      });
    }

    const underrepresented = detectUnderrepresentedFoundersFocus(text);
    if (underrepresented.value != null) {
      evidence.push({
        field: "underrepresented_founders_focus",
        value: underrepresented,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(underrepresented founders?|diverse founders?|women founders?|black founders?|latinx founders?)/i),
        confidence: Math.min(1, baseConfidence),
      });
    }

    const fundName = inferFundNameFromText(firm.firm_name, [page.title, text].filter(Boolean).join("\n"));
    if (fundName) {
      evidence.push({
        field: "latest_fund_name",
        value: fundName,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /(fund|leaders|growth|futures)\s+[ivxlcm0-9]+/i),
        confidence: Math.min(1, sourceType === "official_site" ? baseConfidence - 0.02 : baseConfidence),
      });
    }

    const sizeMatch = text.match(/\$[0-9][0-9.,]*(?:\s?(?:M|B|K|million|billion|thousand))/i);
    const sizeUsd = parseMoneyToUsd(sizeMatch?.[0] ?? null);
    if (sizeUsd) {
      evidence.push({
        field: "latest_fund_size_usd",
        value: sizeUsd,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /\$[0-9][0-9.,]*(?:\s?(?:M|B|K|million|billion|thousand))/i),
        confidence: Math.min(1, sourceType === "techcrunch" ? baseConfidence + 0.03 : baseConfidence),
      });
    }

    const announcementDate = normalizeDateString(page.publishedAt) ?? normalizeDateString(text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i)?.[0] ?? null);
    if (announcementDate) {
      evidence.push({
        field: "latest_fund_announcement_date",
        value: announcementDate,
        source_type: sourceType,
        source_url: page.url,
        source_title: page.title,
        quote_or_snippet: this.firstSnippet(text, /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i),
        confidence: Math.min(1, baseConfidence),
      });
    }

    if (!evidence.length) {
      logger.debug("firm_focus.page.no_matches", { url: page.url, source_type: sourceType });
    }

    return evidence;
  }

  private mergeEvidence(firm: FirmFocusFirmRow, evidence: FirmFocusEvidence[]): FirmFocusExtraction {
    const winners = new Map<string, CandidateValue>();
    const notes: string[] = [];
    const grouped = new Map<string, CandidateValue[]>();

    for (const item of evidence) {
      const candidate: CandidateValue = {
        field: item.field,
        value: item.value,
        confidence: item.confidence,
        sourceType: item.source_type,
        sourceUrl: item.source_url,
        sourceTitle: item.source_title,
        snippet: item.quote_or_snippet,
      };
      const list = grouped.get(item.field) ?? [];
      list.push(candidate);
      grouped.set(item.field, list);
    }

    for (const [field, candidates] of grouped) {
      const sorted = [...candidates].sort((a, b) => {
        const prio = SOURCE_PRIORITY[b.sourceType] - SOURCE_PRIORITY[a.sourceType];
        if (prio !== 0) return prio;
        return b.confidence - a.confidence;
      });
      const winner = sorted[0];
      winners.set(field, winner);

      if (sorted.length > 1) {
        const second = sorted[1];
        if (SOURCE_PRIORITY[winner.sourceType] - SOURCE_PRIORITY[second.sourceType] < 15 && JSON.stringify(winner.value) !== JSON.stringify(second.value)) {
          notes.push(`Conflicting ${field} values between ${winner.sourceType} and ${second.sourceType}.`);
        }
      }
    }

    const stageFocus = (winners.get("stage_focus")?.value as string[] | undefined) ?? [];
    const sectorFocus = (winners.get("sector_focus")?.value as string[] | undefined) ?? [];
    const themes = (winners.get("themes")?.value as string[] | undefined) ?? [];
    const geoFocus = (winners.get("geo_focus")?.value as string[] | undefined) ?? [];
    const underrepresented =
      (winners.get("underrepresented_founders_focus")?.value as FirmFocusExtraction["underrepresented_founders_focus"] | undefined) ??
      { value: null, label: null, rationale: null };

    const confidenceValues = [...winners.values()].map((value) => value.confidence);
    const extractionConfidence = confidenceValues.length
      ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(3))
      : 0;

    return {
      firm_name: firm.firm_name,
      website: firm.website_url,
      stage_focus: stageFocus,
      sector_focus: sectorFocus,
      themes,
      geo_focus: geoFocus,
      latest_fund_name: (winners.get("latest_fund_name")?.value as string | undefined) ?? null,
      latest_fund_size_usd: (winners.get("latest_fund_size_usd")?.value as number | undefined) ?? null,
      latest_fund_announcement_date: (winners.get("latest_fund_announcement_date")?.value as string | undefined) ?? null,
      underrepresented_founders_focus: underrepresented,
      evidence,
      extraction_confidence: extractionConfidence,
      extraction_notes: notes,
    };
  }

  private buildFirmPatch(
    firm: FirmFocusFirmRow,
    extraction: FirmFocusExtraction,
    minConfidence: number,
    availableColumns?: Set<string>,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const hasColumn = (column: string) => !availableColumns || availableColumns.has(column);

    if (
      hasColumn("stage_focus") &&
      (!Array.isArray(firm.stage_focus) || !firm.stage_focus.length || (firm.extraction_confidence ?? 0) < minConfidence) &&
      extraction.stage_focus.length
    ) {
      patch.stage_focus = toFirmRecordStageFocus(extraction.stage_focus);
    }
    if (
      hasColumn("sector_focus") &&
      (!Array.isArray(firm.sector_focus) || !firm.sector_focus.length || (firm.extraction_confidence ?? 0) < minConfidence) &&
      extraction.sector_focus.length
    ) {
      patch.sector_focus = extraction.sector_focus;
    }
    if (
      hasColumn("investment_themes") &&
      (!Array.isArray(firm.investment_themes) || !firm.investment_themes.length || (firm.extraction_confidence ?? 0) < minConfidence) &&
      extraction.themes.length
    ) {
      patch.investment_themes = extraction.themes;
    }
    if (
      hasColumn("geo_focus") &&
      (!Array.isArray(firm.geo_focus) || !firm.geo_focus.length || (firm.extraction_confidence ?? 0) < minConfidence) &&
      extraction.geo_focus.length
    ) {
      patch.geo_focus = extraction.geo_focus;
    }
    if (hasColumn("latest_fund_name") && !firm.latest_fund_name && extraction.latest_fund_name) {
      patch.latest_fund_name = extraction.latest_fund_name;
    }
    if (hasColumn("latest_fund_size_usd") && !firm.latest_fund_size_usd && extraction.latest_fund_size_usd) {
      patch.latest_fund_size_usd = extraction.latest_fund_size_usd;
    }
    if (
      (hasColumn("latest_fund_announcement_date") || hasColumn("last_fund_announcement_date")) &&
      !(firm.latest_fund_announcement_date ?? firm.last_fund_announcement_date) &&
      extraction.latest_fund_announcement_date
    ) {
      if (hasColumn("latest_fund_announcement_date")) {
        patch.latest_fund_announcement_date = extraction.latest_fund_announcement_date;
      }
      if (hasColumn("last_fund_announcement_date")) {
        patch.last_fund_announcement_date = extraction.latest_fund_announcement_date;
      }
    }
    if (
      hasColumn("underrepresented_founders_focus") &&
      firm.underrepresented_founders_focus == null &&
      extraction.underrepresented_founders_focus.value != null
    ) {
      patch.underrepresented_founders_focus = extraction.underrepresented_founders_focus.value;
      patch.underrepresented_founders_focus_label = extraction.underrepresented_founders_focus.label;
      patch.underrepresented_founders_focus_rationale = extraction.underrepresented_founders_focus.rationale;
    }

    if (hasColumn("evidence_urls") && extraction.evidence.length) {
      patch.evidence_urls = [...new Set(extraction.evidence.map((item) => item.source_url))];
    }
    if (hasColumn("extraction_confidence")) patch.extraction_confidence = extraction.extraction_confidence;
    if (hasColumn("intel_confidence_score")) patch.intel_confidence_score = extraction.extraction_confidence;
    if (hasColumn("focus_enriched_at")) patch.focus_enriched_at = new Date().toISOString();
    if (hasColumn("last_verified_at")) patch.last_verified_at = new Date().toISOString();
    return patch;
  }

  private async persistExtraction(
    runId: string | null,
    firm: FirmFocusFirmRow,
    extraction: FirmFocusExtraction,
    patch: Record<string, unknown>,
    needsManualReview: boolean,
  ): Promise<void> {
    const now = new Date().toISOString();
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(cleanPatch).length) {
      const { error } = await this.db.from("firm_records").update(cleanPatch).eq("id", firm.id);
      if (error) throw new Error(`Failed to update firm_records for ${firm.firm_name}: ${error.message}`);
    }

    if (runId) {
      const valueRows = extraction.evidence.map((item) => ({
        run_id: runId,
        firm_id: firm.id,
        field_name: item.field,
        normalized_value_json: { value: item.value },
        confidence_score: item.confidence,
        source_type: item.source_type,
        source_url: item.source_url,
        is_winner: this.isWinner(item, extraction),
        created_at: now,
      }));
      if (valueRows.length) {
        const { error } = await this.db.from("firm_field_values").insert(valueRows);
        if (error) throw new Error(`Failed to insert firm_field_values for ${firm.firm_name}: ${error.message}`);
      }

      const evidenceRows = extraction.evidence.map((item) => ({
        run_id: runId,
        firm_id: firm.id,
        field_name: item.field,
        source_type: item.source_type,
        source_url: item.source_url,
        source_title: item.source_title,
        quote_or_snippet: item.quote_or_snippet,
        value_json: { value: item.value },
        confidence_score: item.confidence,
        created_at: now,
      }));
      if (evidenceRows.length) {
        const { error } = await this.db.from("firm_source_evidence").insert(evidenceRows);
        if (error) throw new Error(`Failed to insert firm_source_evidence for ${firm.firm_name}: ${error.message}`);
      }
    }

    if (extraction.evidence.length) {
      const provenanceRows = extraction.evidence.map((item) => ({
        firm_id: firm.id,
        field_name: item.field,
        source_name: item.source_type,
        source_url: item.source_url,
        source_record_id: runId,
        extracted_value_json: { value: item.value },
        confidence_score: item.confidence,
        extracted_at: now,
        updated_at: now,
      }));
      const { error } = await this.db
        .from("firm_field_sources")
        .upsert(provenanceRows, { onConflict: "firm_id,field_name,source_name" });
      if (error) throw new Error(`Failed to upsert firm_field_sources for ${firm.firm_name}: ${error.message}`);
    }

    if (needsManualReview) {
      const existingReview = await this.db
        .from("enrichment_review_queue")
        .select("id")
        .eq("entity_type", "firm_focus")
        .eq("entity_id", firm.id)
        .eq("status", "pending")
        .maybeSingle();
      if (existingReview.error) {
        throw new Error(`Failed to check review queue for ${firm.firm_name}: ${existingReview.error.message}`);
      }
      if (!existingReview.data) {
        const reviewRow = {
          entity_type: "firm_focus",
          entity_id: firm.id,
          firm_id: firm.id,
          reason: "Low-confidence or conflicting firm focus enrichment output",
          review_data: {
            extraction_notes: extraction.extraction_notes,
            extraction_confidence: extraction.extraction_confidence,
            evidence_urls: extraction.evidence.map((item) => item.source_url),
          },
          status: "pending",
        };
        const { error } = await this.db.from("enrichment_review_queue").insert(reviewRow);
        if (error) throw new Error(`Failed to enqueue review row for ${firm.firm_name}: ${error.message}`);
      }
      await this.db.from("firm_records").update({ manual_review_status: "needs_review", needs_review: true }).eq("id", firm.id);
    } else {
      await this.db.from("firm_records").update({ manual_review_status: "ok", needs_review: false }).eq("id", firm.id);
    }

    await this.logBackfillRun(firm, Object.keys(cleanPatch), "completed", null);
  }

  private async logBackfillRun(
    firm: FirmFocusFirmRow,
    fieldsWritten: string[],
    status: string,
    errorMessage: string | null,
  ): Promise<void> {
    await this.db.from("backfill_runs").insert({
      firm_id: firm.id,
      firm_name: firm.firm_name,
      source: "firm_focus_enrichment",
      status,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      fields_written: fieldsWritten,
      error_message: errorMessage,
    });
  }

  private isWinner(item: FirmFocusEvidence, extraction: FirmFocusExtraction): boolean {
    if (item.field === "stage_focus") return JSON.stringify(item.value) === JSON.stringify(extraction.stage_focus);
    if (item.field === "sector_focus") return JSON.stringify(item.value) === JSON.stringify(extraction.sector_focus);
    if (item.field === "themes") return JSON.stringify(item.value) === JSON.stringify(extraction.themes);
    if (item.field === "geo_focus") return JSON.stringify(item.value) === JSON.stringify(extraction.geo_focus);
    if (item.field === "latest_fund_name") return item.value === extraction.latest_fund_name;
    if (item.field === "latest_fund_size_usd") return item.value === extraction.latest_fund_size_usd;
    if (item.field === "latest_fund_announcement_date") return item.value === extraction.latest_fund_announcement_date;
    if (item.field === "underrepresented_founders_focus") {
      return JSON.stringify(item.value) === JSON.stringify(extraction.underrepresented_founders_focus);
    }
    return false;
  }

  private async writeReport(rows: FirmFocusReportRow[], requestedPath?: string): Promise<string> {
    const reportPath =
      requestedPath ??
      path.join(process.cwd(), "reports", `firm-focus-enrichment-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);

    await mkdir(path.dirname(reportPath), { recursive: true });
    const header = [
      "firm_name",
      "missing_fields_before",
      "fields_filled",
      "extraction_confidence",
      "latest_fund_name",
      "latest_fund_size_usd",
      "evidence_count",
      "needs_manual_review",
    ];
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.firm_name,
          row.missing_fields_before.join("|"),
          row.fields_filled.join("|"),
          row.extraction_confidence.toString(),
          row.latest_fund_name ?? "",
          row.latest_fund_size_usd?.toString() ?? "",
          row.evidence_count.toString(),
          row.needs_manual_review ? "true" : "false",
        ]
          .map((value) => this.csvEscape(value))
          .join(","),
      );
    }
    await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
    return reportPath;
  }

  private csvEscape(value: string): string {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
    return value;
  }

  private normalizeUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return new URL(value).toString();
    } catch {
      try {
        return new URL(`https://${value}`).toString();
      } catch {
        return null;
      }
    }
  }

  private baseConfidence(sourceType: FirmFocusSourceType): number {
    if (sourceType === "official_site") return 0.96;
    if (sourceType === "official_blog") return 0.92;
    if (sourceType === "techcrunch") return 0.84;
    if (sourceType === "press_release") return 0.74;
    return 0.55;
  }

  private firstSnippet(text: string, rx: RegExp): string {
    const match = rx.exec(text);
    if (!match?.index && match?.index !== 0) return text.slice(0, 220).trim();
    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + 180);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }

  private extractLinksFromHtml(content: string, baseUrl: string): string[] {
    const out = new Set<string>();
    const hrefRegex = /href=["']([^"'#]+)["']/gi;
    for (const match of content.matchAll(hrefRegex)) {
      const href = match[1];
      try {
        out.add(new URL(href, baseUrl).toString());
      } catch {
        continue;
      }
    }
    const markdownLinkRegex = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi;
    for (const match of content.matchAll(markdownLinkRegex)) {
      out.add(match[1]);
    }
    const plainUrlRegex = /\bhttps?:\/\/[^\s<>"')]+/gi;
    for (const match of content.matchAll(plainUrlRegex)) {
      out.add(match[0]);
    }
    return [...out];
  }

  private async fetchPage(url: string, sourceType: FirmFocusSourceType, logger = this.logger): Promise<PageContent | null> {
    if (!(await this.allowedByRobots(url, logger))) return null;

    const firecrawlPage = await this.firecrawlScrape(url, logger);
    if (firecrawlPage) return firecrawlPage;

    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return null;
      const html = await response.text();
      return {
        url,
        title: this.extractTitle(html),
        publishedAt: this.extractPublishedAt(html),
        text: this.stripHtml(html),
      };
    } catch (error) {
      logger.warn("firm_focus.fetch.failed", {
        url,
        source_type: sourceType,
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async firecrawlScrape(url: string, logger = this.logger): Promise<PageContent | null> {
    if (!this.firecrawlKey) return null;
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.firecrawlKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "html"],
          onlyMainContent: true,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as Record<string, any>;
      const data = payload.data ?? payload;
      const markdown = typeof data.markdown === "string" ? data.markdown : "";
      const html = typeof data.html === "string" ? data.html : "";
      const text = markdown || this.stripHtml(html);
      if (!text.trim()) return null;
      return {
        url,
        title: data.metadata?.title ?? data.title ?? null,
        publishedAt: data.metadata?.publishedTime ?? data.metadata?.published_at ?? null,
        text,
      };
    } catch (error) {
      logger.warn("firm_focus.firecrawl.failed", {
        url,
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async searchWithExa(query: string): Promise<string[]> {
    try {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "x-api-key": this.exaKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: 5,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as { results?: Array<{ url?: string }> };
      return (payload.results ?? []).map((result) => result.url).filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  private extractTitle(html: string): string | null {
    return html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  }

  private extractPublishedAt(html: string): string | null {
    return (
      html.match(/property=["']article:published_time["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/name=["']pubdate["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/datetime=["']([^"']+)["']/i)?.[1] ??
      null
    );
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async allowedByRobots(url: string, logger = this.logger): Promise<boolean> {
    try {
      const parsed = new URL(url);
      const cacheKey = `${parsed.protocol}//${parsed.host}`;
      if (!this.robotsCache.has(cacheKey)) {
        const robotsUrl = `${cacheKey}/robots.txt`;
        const response = await fetch(robotsUrl, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (!response || !response.ok) {
          this.robotsCache.set(cacheKey, null);
        } else {
          const text = await response.text();
          const disallows = this.parseRobotsDisallows(text);
          this.robotsCache.set(cacheKey, disallows);
        }
      }
      const disallows = this.robotsCache.get(cacheKey);
      if (!disallows?.length) return true;
      const blocked = disallows.some((entry) => entry !== "/" && parsed.pathname.startsWith(entry));
      if (blocked) {
        logger.info("firm_focus.robots.skip", { url });
      }
      return !blocked;
    } catch {
      return true;
    }
  }

  private parseRobotsDisallows(text: string): string[] {
    const lines = text.split(/\r?\n/);
    const disallows: string[] = [];
    let inGlobalAgent = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const [directive, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(directive)) {
        inGlobalAgent = value === "*";
        continue;
      }
      if (inGlobalAgent && /^disallow$/i.test(directive) && value) {
        disallows.push(value);
      }
    }
    return disallows;
  }
}
