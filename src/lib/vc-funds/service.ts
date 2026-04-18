import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildEvidenceRow,
  computeConflictPenalty,
  computeCorroborationScore,
  computeFreshCapitalPriorityScore,
  scoreCandidateCapitalEvent,
  statusFromCandidateScore,
  toCandidateDraft,
} from "./candidates";
import { CAPITAL_EVENT_THRESHOLDS } from "./config";
import { deriveCapitalWindow, deriveEstimatedCheckRange, deriveFirmCapitalState } from "./derivations";
import { refetchCapitalArticleDetails } from "./adapters";
import {
  buildAnnouncementFundKey,
  inferSequenceNumber,
  looksLikeGeneralFundraisingAnnouncement,
  looksLikePortfolioFinancingNews,
  matchFirmRecord,
  rankFirmMatches,
} from "./matching";
import { buildFundNormalizedKey, contentHash, inferFundStatus, inferFundType, normalizeFirmName, normalizeFundName } from "./normalize";
import { getSourcePriority } from "./sourcePriority";
import type {
  CandidateCapitalEventDraft,
  CandidateCapitalEventEvidence,
  CandidateCapitalEventStatus,
  CanonicalFundDraft,
  ExtractedFundAnnouncement,
  FirmRecordLookup,
  FundSignalRecord,
  FundSourceRecord,
  FundSyncRunOptions,
  FundSyncStats,
  FundSyncVerifyStats,
  VcFundSourceAdapter,
} from "./types";

type DbLike = SupabaseClient<any> & { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

type CandidateRow = {
  id: string;
  firm_record_id: string | null;
  raw_firm_name: string;
  normalized_firm_name: string;
  candidate_headline: string;
  excerpt: string | null;
  source_url: string;
  source_type: string;
  publisher: string | null;
  published_at: string | null;
  raw_text: string | null;
  event_type_guess: string;
  normalized_fund_label: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  size_amount: number | null;
  size_currency: string | null;
  confidence_score: number;
  confidence_breakdown: Record<string, unknown>;
  evidence_count: number;
  source_diversity: number;
  official_source_present: boolean;
  cluster_key: string | null;
  canonical_vc_fund_id: string | null;
  status: CandidateCapitalEventStatus;
  review_reason: string | null;
  metadata: Record<string, unknown>;
  first_seen_at?: string | null;
  created_at?: string | null;
};

export interface FundSyncServiceOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  adapters: VcFundSourceAdapter[];
}

function roundConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function hostish(value: string | null | undefined): string {
  if (!value) return "unknown";
  try {
    const normalized = value.startsWith("http") ? value : `https://${value}`;
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function dedupeSignals(signals: FundSignalRecord[]): FundSignalRecord[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (seen.has(signal.dedupeKey)) return false;
    seen.add(signal.dedupeKey);
    return true;
  });
}

function chooseValue<T>(fieldName: string, candidates: Array<{ value: T | null | undefined; sourceType: ExtractedFundAnnouncement["sourceType"] }>): T | null {
  let winner: { value: T; priority: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.value == null) continue;
    const priority = getSourcePriority(candidate.sourceType, fieldName);
    if (!winner || priority > winner.priority) {
      winner = { value: candidate.value, priority };
    }
  }
  return winner?.value ?? null;
}

function normalizeArray(values: string[] | null | undefined): string[] {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

function whyItMattersForSignal(signalType: string, firmName: string): string {
  switch (signalType) {
    case "fund_closed":
      return `${firmName} likely has a refreshed deployment cycle and a stronger near-term appetite for new investments.`;
    case "new_fund_announced":
      return `${firmName} may be increasing deployment activity and founder outreach responsiveness.`;
    case "fund_target_updated":
      return `${firmName}'s fundraising target shifted, which can change check-size expectations and timing.`;
    case "fresh_capital_inferred":
      return `${firmName} has recent capital signals that should boost founder targeting priority.`;
    default:
      return `Fresh capital activity at ${firmName} can affect timing, check size, and prioritization.`;
  }
}

export class FundSyncService {
  private readonly supabase: DbLike;

  constructor(private readonly options: FundSyncServiceOptions) {
    this.supabase = createClient(options.supabaseUrl, options.serviceRoleKey, {
      auth: { persistSession: false },
    }) as DbLike;
  }

  private serializeRunOptions(options: FundSyncRunOptions) {
    return {
      source_keys: options.sourceKeys ?? null,
      max_items: options.maxItems ?? null,
      allow_firm_creation: options.allowFirmCreation ?? null,
      fresh_capital_window_days: options.freshCapitalWindowDays ?? null,
      firm_id: options.firmId ?? null,
      cluster_key: options.clusterKey ?? null,
      date_from: options.dateFrom ?? null,
      date_to: options.dateTo ?? null,
      verbose: options.verbose ?? false,
      allow_official_source_promotion: options.allowOfficialSourcePromotion ?? null,
      require_verified_for_promotion: options.requireVerifiedForPromotion ?? null,
      verifier_batch_size: options.verifierBatchSize ?? null,
      verification_rate_ms: options.verificationRateMs ?? null,
    };
  }

  private async withRunLog<T>(phase: "detect" | "verify" | "promote" | "rederive" | "mirror" | "daily", options: FundSyncRunOptions, work: () => Promise<T>): Promise<T> {
    if (options.dryRun) return work();

    const { data: started, error: startError } = await this.supabase
      .from("vc_fund_sync_runs")
      .insert({
        phase,
        status: "running",
        dry_run: false,
        scope_firm_id: options.firmId ?? null,
        scope_cluster_key: options.clusterKey ?? null,
        options: this.serializeRunOptions(options),
      })
      .select("id")
      .single();
    if (startError) throw new Error(`Failed to create vc_fund_sync_runs entry: ${startError.message}`);

    try {
      const result = await work();
      await this.supabase
        .from("vc_fund_sync_runs")
        .update({
          status: "completed",
          stats: result as any,
          completed_at: new Date().toISOString(),
        })
        .eq("id", started.id);
      return result;
    } catch (error) {
      await this.supabase
        .from("vc_fund_sync_runs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", started.id);
      throw error;
    }
  }

  async run(options: FundSyncRunOptions = {}): Promise<FundSyncStats> {
    return this.withRunLog("daily", options, async () => {
      const detectStats = await this.detectCandidateCapitalEvents(options);
      if (options.dryRun) {
        return {
          ...detectStats,
          processedCandidates: detectStats.parsed,
        };
      }

      const verifyStats = await this.verifyCandidateClusters(options);
      const promoteStats = await this.promoteCandidateCapitalEvents(options);
      const rederivedFirms = await this.rederive(options);
      const mirroredSignals = await this.mirrorVcFundSignalsToIntelligenceEvents({ ...options, verbose: options.verbose });

      return {
        fetched: detectStats.fetched,
        parsed: detectStats.parsed,
        processedCandidates: (detectStats.processedCandidates ?? detectStats.parsed) + verifyStats.processed,
        verifiedCandidates: verifyStats.verified,
        promotedCandidates: promoteStats.promotedCandidates ?? 0,
        mirroredSignals,
        rederivedFirms,
        failures: (detectStats.failures ?? 0) + verifyStats.failures + (promoteStats.failures ?? 0),
        matchedFirms: detectStats.matchedFirms + promoteStats.matchedFirms,
        createdFirms: promoteStats.createdFirms,
        upsertedFunds: promoteStats.upsertedFunds,
        updatedFunds: promoteStats.updatedFunds,
        attachedSources: promoteStats.attachedSources,
        linkedPeople: promoteStats.linkedPeople,
        emittedSignals: promoteStats.emittedSignals,
        reviewQueueItems: detectStats.reviewQueueItems + verifyStats.review + promoteStats.reviewQueueItems,
      };
    });
  }

  async detectCandidateCapitalEvents(options: FundSyncRunOptions = {}): Promise<FundSyncStats> {
    return this.withRunLog("detect", options, async () => {
      const stats: FundSyncStats = {
        fetched: 0,
        parsed: 0,
        processedCandidates: 0,
        matchedFirms: 0,
        createdFirms: 0,
        upsertedFunds: 0,
        updatedFunds: 0,
        attachedSources: 0,
        linkedPeople: 0,
        emittedSignals: 0,
        reviewQueueItems: 0,
        failures: 0,
      };

      const firms = await this.loadFirmLookups(options);
      const adapters = this.options.adapters.filter((adapter) => !options.sourceKeys?.length || options.sourceKeys.includes(adapter.key));

      for (const adapter of adapters.sort((a, b) => b.priority - a.priority)) {
        const items = await adapter.fetchFundAnnouncements({ firms, options });
        stats.fetched += items.length;

        for (const item of items.slice(0, options.maxItems ?? items.length)) {
          stats.parsed += 1;
          stats.processedCandidates = (stats.processedCandidates ?? 0) + 1;

          if (looksLikePortfolioFinancingNews(item)) {
            if (options.verbose) console.log(`[vc-fund:detect] skip portfolio financing ${item.sourceUrl}`);
            continue;
          }
          if (looksLikeGeneralFundraisingAnnouncement(item)) {
            if (options.verbose) console.log(`[vc-fund:detect] skip generic fundraising ${item.sourceUrl}`);
            continue;
          }

          const match = matchFirmRecord(item, firms);
          const draft = toCandidateDraft({
            item,
            firm: match.matchedFirm,
            firmMatchConfidence: match.confidence,
            officialSourcePresent: item.sourceType === "official_website",
          });
          const evidence = buildEvidenceRow(item, draft.confidenceScore);

          if (match.matchedFirm) stats.matchedFirms += 1;
          if (draft.status === "review") stats.reviewQueueItems += 1;

          if (options.dryRun) {
            if (options.verbose) {
              console.log("[vc-fund:detect:dry]", JSON.stringify({ cluster: draft.clusterKey, score: draft.confidenceScore, status: draft.status, url: draft.sourceUrl }, null, 2));
            }
            continue;
          }

          const result = await this.upsertCandidateCluster(draft, evidence, match.confidence);
          if (options.verbose) {
            console.log("[vc-fund:detect]", JSON.stringify(result, null, 2));
          }
        }
      }

      return stats;
    });
  }

  async promoteCandidateCapitalEvents(options: FundSyncRunOptions = {}): Promise<FundSyncStats> {
    return this.withRunLog("promote", options, async () => {
      const stats: FundSyncStats = {
        fetched: 0,
        parsed: 0,
        processedCandidates: 0,
        promotedCandidates: 0,
        matchedFirms: 0,
        createdFirms: 0,
        upsertedFunds: 0,
        updatedFunds: 0,
        attachedSources: 0,
        linkedPeople: 0,
        emittedSignals: 0,
        reviewQueueItems: 0,
        failures: 0,
      };

      const candidates = await this.loadPromotableCandidates(options);
      const firms = await this.loadFirmLookups(options);
      const investors = await this.loadFirmInvestorLookups();

      if (options.dryRun) {
        if (options.verbose) {
          console.log("[vc-fund:promote:dry]", JSON.stringify(candidates.map((candidate) => ({
            id: candidate.id,
            cluster_key: candidate.cluster_key,
            status: candidate.status,
            score: candidate.confidence_score,
          })), null, 2));
        }
        stats.processedCandidates = candidates.length;
        return stats;
      }

      for (const candidate of candidates) {
        stats.processedCandidates = (stats.processedCandidates ?? 0) + 1;
        const result = await this.promoteCandidateCapitalEvent(candidate, firms, investors);
        if (!result) continue;
        const { wasUpdate, attachedSources, linkedPeople, emittedSignals, firmMatched, sentToReview } = result;
        if (sentToReview) {
          stats.reviewQueueItems += 1;
          continue;
        }
        if (firmMatched) stats.matchedFirms += 1;
        if (wasUpdate) stats.updatedFunds += 1;
        else stats.upsertedFunds += 1;
        stats.promotedCandidates = (stats.promotedCandidates ?? 0) + 1;
        stats.attachedSources += attachedSources;
        stats.linkedPeople += linkedPeople;
        stats.emittedSignals += emittedSignals;
      }

      return stats;
    });
  }

  async verifyCandidateClusters(options: FundSyncRunOptions = {}): Promise<FundSyncVerifyStats> {
    return this.withRunLog("verify", options, async () => {
      const candidates = await this.loadVerifiableCandidates(options);
      if (options.dryRun) {
        if (options.verbose) {
          console.log("[vc-fund:verify:dry]", JSON.stringify(candidates.map((candidate) => ({
            id: candidate.id,
            cluster_key: candidate.cluster_key,
            score: candidate.confidence_score,
            official_source_present: candidate.official_source_present,
          })), null, 2));
        }
        return {
          processed: candidates.length,
          verified: 0,
          escalated: candidates.length,
          rejected: 0,
          review: 0,
          failures: 0,
        };
      }
      const stats: FundSyncVerifyStats = {
        processed: 0,
        verified: 0,
        escalated: 0,
        rejected: 0,
        review: 0,
        failures: 0,
      };
      const delayMs = options.verificationRateMs ?? CAPITAL_EVENT_THRESHOLDS.verifierRateMs;

      for (const candidate of candidates) {
        stats.processed += 1;
        const outcome = await this.verifyEscalatedCandidateCapitalEvent(candidate);
        if (options.verbose) {
          console.log("[vc-fund:verify]", JSON.stringify({
            candidateId: candidate.id,
            clusterKey: candidate.cluster_key,
            previousStatus: candidate.status,
            outcome,
          }, null, 2));
        }
        if (outcome.status === "verified") stats.verified += 1;
        else if (outcome.status === "review") stats.review += 1;
        else if (outcome.status === "rejected") stats.rejected += 1;
        else stats.escalated += 1;
        await sleep(delayMs);
      }

      return stats;
    });
  }

  async verifyEscalatedCandidateCapitalEvent(candidate: CandidateRow): Promise<{
    status: CandidateCapitalEventStatus;
    confidenceScore: number;
    reviewReason?: string | null;
  }> {
    await this.updateCandidateStatus(candidate.id, "verifying", null);
    return this.verifyCandidateCluster(candidate);
  }

  async verifyCandidateCluster(candidate: CandidateRow): Promise<{
    status: CandidateCapitalEventStatus;
    confidenceScore: number;
    reviewReason?: string | null;
  }> {
    const evidenceRows = await this.loadCandidateEvidence(candidate.id);
    if (!evidenceRows.length) {
      await this.updateCandidateStatus(candidate.id, "rejected", "Verification failed: no evidence available");
      return { status: "rejected", confidenceScore: 0, reviewReason: "Verification failed: no evidence available" };
    }

    const firm = candidate.firm_record_id ? await this.loadFirmLookupById(candidate.firm_record_id) : null;
    const verificationEvidence = await this.attachVerificationEvidence(candidate, evidenceRows, firm);
    const allEvidence = [...evidenceRows, ...verificationEvidence];
    const hydrated = this.hydrateAnnouncementsFromEvidence(candidate, allEvidence);
    const corroborationScore = computeCorroborationScore(hydrated);
    const conflictPenalty = computeConflictPenalty(hydrated);
    const independentSourceCount = new Set(hydrated.map((item) => `${item.sourceType}:${item.sourcePublisher || "unknown"}`)).size;
    const officialSourcePresent = hydrated.some((item) => item.sourceType === "official_website");

    const firmRanking = await this.rankCandidateFirmMatches(candidate, hydrated);
    if (firmRanking.length > 1 && firmRanking[0].confidence >= 0.8 && firmRanking[1].confidence >= 0.8 && Math.abs(firmRanking[0].confidence - firmRanking[1].confidence) <= 0.06) {
      await this.sendCandidateToReview(candidate, "Multiple plausible canonical firms", {
        conflictingFields: ["firm_record_id"],
        suggestedMatches: firmRanking.slice(0, 3).map((entry) => ({ id: entry.firm.id, firm_name: entry.firm.firm_name, confidence: entry.confidence })),
        evidenceRows: allEvidence,
      });
      return { status: "review", confidenceScore: candidate.confidence_score, reviewReason: "Multiple plausible canonical firms" };
    }

    const firmMatch = firmRanking[0];
    const score = scoreCandidateCapitalEvent({
      item: hydrated[0],
      firm: firmMatch?.firm || firm,
      firmMatchConfidence: firmMatch?.confidence ?? (firm ? 0.9 : 0),
      corroborationCount: hydrated.length,
      officialSourcePresent,
      corroborationScore,
      conflictPenalty,
      independentSourceCount,
    });

    const dateConflict = this.detectDateConflict(hydrated);
    const sizeConflict = this.detectSizeConflict(hydrated);
    const sequenceConflict = this.detectSequenceConflict(hydrated);
    const reviewReason =
      sequenceConflict ? "Source disagreement on sequence number" :
      sizeConflict ? "Source disagreement on fund size above tolerance" :
      dateConflict ? "Conflicting event dates outside tolerance" :
      null;

    if (reviewReason) {
      await this.supabase.from("candidate_capital_events").update({
        confidence_score: score,
        confidence_breakdown: {
          ...(candidate.confidence_breakdown || {}),
          corroboration_score: corroborationScore,
          conflict_penalty: conflictPenalty,
          independent_source_count: independentSourceCount,
          verified_at: new Date().toISOString(),
        },
      }).eq("id", candidate.id);
      await this.sendCandidateToReview(candidate, reviewReason, {
        conflictingFields: [
          ...(sequenceConflict ? ["fund_sequence_number"] : []),
          ...(sizeConflict ? ["size_amount"] : []),
          ...(dateConflict ? ["announced_date"] : []),
        ],
        evidenceRows: allEvidence,
      });
      return { status: "review", confidenceScore: score, reviewReason };
    }

    const targetStatus =
      score >= CAPITAL_EVENT_THRESHOLDS.autoVerify && (corroborationScore >= CAPITAL_EVENT_THRESHOLDS.minCorroborationScore || officialSourcePresent)
        ? "verified"
        : score >= CAPITAL_EVENT_THRESHOLDS.escalate
          ? "escalated"
          : score < CAPITAL_EVENT_THRESHOLDS.review
            ? "rejected"
            : "review";

    await this.supabase.from("candidate_capital_events").update({
      firm_record_id: firmMatch?.firm.id || candidate.firm_record_id,
      raw_firm_name: firmMatch?.firm.firm_name || candidate.raw_firm_name,
      normalized_firm_name: normalizeFirmName(firmMatch?.firm.firm_name || candidate.raw_firm_name),
      candidate_headline: hydrated[0]?.sourceTitle || candidate.candidate_headline,
      excerpt: hydrated[0]?.rawText?.slice(0, 800) || candidate.excerpt,
      normalized_fund_label: hydrated[0]
        ? (() => {
            const raw = hydrated[0].fundLabel || hydrated[0].fundName || hydrated[0].sourceTitle || candidate.normalized_fund_label || "";
            const normalized = normalizeFundName(raw);
            return normalized || null;
          })()
        : candidate.normalized_fund_label,
      fund_sequence_number: this.pickDominantSequence(hydrated),
      vintage_year: this.pickDominantVintage(hydrated),
      announced_date: this.pickDominantDate(hydrated),
      size_amount: this.pickDominantSize(hydrated),
      confidence_score: score,
      confidence_breakdown: {
        ...(candidate.confidence_breakdown || {}),
        corroboration_score: corroborationScore,
        conflict_penalty: conflictPenalty,
        independent_source_count: independentSourceCount,
        verification_status: targetStatus,
        verified_at: new Date().toISOString(),
      },
      evidence_count: allEvidence.length,
      source_diversity: independentSourceCount,
      official_source_present: officialSourcePresent,
      latest_seen_at: new Date().toISOString(),
      status: targetStatus,
      verified_at: targetStatus === "verified" ? new Date().toISOString() : null,
      review_reason: targetStatus === "review" ? "Verification requires analyst review" : null,
      metadata: {
        ...(candidate.metadata || {}),
        verification_pass: true,
      },
    }).eq("id", candidate.id);

    if (targetStatus === "review") {
      await this.sendCandidateToReview(candidate, "Verification requires analyst review", {
        evidenceRows: allEvidence,
      });
    }

    return { status: targetStatus, confidenceScore: score, reviewReason: targetStatus === "review" ? "Verification requires analyst review" : null };
  }

  async attachVerificationEvidence(
    candidate: CandidateRow,
    evidenceRows: any[],
    firm: FirmRecordLookup | null,
  ): Promise<any[]> {
    const best = evidenceRows
      .slice()
      .sort((left, right) => {
        const priority = (row: any) => {
          if (row.source_type === "official_website") return 3;
          if (row.source_type === "press_release") return 2;
          return 1;
        };
        return priority(right) - priority(left);
      })
      .slice(0, 2);

    const inserted: any[] = [];
    for (const row of best) {
      const refined = await refetchCapitalArticleDetails({
        url: row.source_url,
        firmName: firm?.firm_name || candidate.raw_firm_name,
        firmWebsiteUrl: firm?.website_url || null,
        sourceType: row.source_type,
        publisher: row.publisher,
        headline: row.headline,
        excerpt: row.excerpt,
        publishedAt: row.published_at,
        metadata: {
          verification_source: true,
          candidate_capital_event_id: candidate.id,
        },
      });
      if (!refined) continue;

      const evidence = buildEvidenceRow(refined, Math.max(refined.confidence, candidate.confidence_score));
      evidence.sourceUrl = `${refined.sourceUrl}#verified`;
      evidence.rawPayload = {
        ...evidence.rawPayload,
        verification_refetch: true,
        original_source_url: row.source_url,
      };
      await this.insertCandidateEvidence(candidate.id, evidence);
      inserted.push({
        candidate_capital_event_id: candidate.id,
        source_url: evidence.sourceUrl,
        source_type: evidence.sourceType,
        publisher: evidence.publisher,
        published_at: evidence.publishedAt,
        headline: evidence.headline,
        excerpt: evidence.excerpt,
        raw_text: evidence.rawText,
        raw_payload: evidence.rawPayload,
        score: evidence.score,
      });
    }
    return inserted;
  }

  async mirrorVcFundSignalsToIntelligenceEvents(options: FundSyncRunOptions & { force?: boolean } = {}): Promise<number> {
    return this.withRunLog("mirror", options, async () => {
      const rows = await this.loadSignalsForMirror(options);
      let mirrored = 0;

      for (const row of rows) {
        const mirrorKey = `vc_fund_signal:${row.dedupe_key}`;
        const firmEntityId = await this.ensureIntelligenceEntity("investor", row.firm_name, [], { firm_record_id: row.firm_record_id });
        const fundEntityId = row.fund_name
          ? await this.ensureIntelligenceEntity("fund", row.fund_name, [], { vc_fund_id: row.vc_fund_id, firm_record_id: row.firm_record_id })
          : null;
        const personEntityId = row.firm_investor_name
          ? await this.ensureIntelligenceEntity("person", row.firm_investor_name, [], { firm_investor_id: row.firm_investor_id })
          : null;

        const { data: existing, error: existingError } = await this.supabase
          .from("intelligence_events")
          .select("id, source_count")
          .eq("dedupe_key", mirrorKey)
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);

        const payload = {
          event_type: row.signal_type,
          category: "investors",
          title: row.headline,
          summary: row.summary || "",
          why_it_matters: whyItMattersForSignal(row.signal_type, row.firm_name),
          confidence_score: row.confidence,
          importance_score: Math.min(1, Math.max(0.35, row.display_priority / 100)),
          relevance_score: Math.min(1, Math.max(0.4, row.confidence)),
          canonical_source_url: row.source_url,
          source_count: existing?.source_count ? Number(existing.source_count) + 1 : 1,
          dedupe_key: mirrorKey,
          metadata: {
            ...(row.metadata || {}),
            vc_fund_signal_id: row.id,
            firm_record_id: row.firm_record_id,
            vc_fund_id: row.vc_fund_id,
            firm_investor_id: row.firm_investor_id,
            mirror_key: mirrorKey,
          },
          last_seen_at: new Date().toISOString(),
        };

        const { data: event, error } = await this.supabase
          .from("intelligence_events")
          .upsert(payload, { onConflict: "dedupe_key" })
          .select("id")
          .single();
        if (error) throw new Error(`Failed to mirror intelligence_event: ${error.message}`);

        const links = [
          { event_id: event.id, entity_id: firmEntityId, role: "investor" },
          ...(fundEntityId ? [{ event_id: event.id, entity_id: fundEntityId, role: "fund" }] : []),
          ...(personEntityId ? [{ event_id: event.id, entity_id: personEntityId, role: "person" }] : []),
        ];
        for (const link of links) {
          await this.supabase.from("intelligence_event_entities").upsert(link, { onConflict: "event_id,entity_id,role" });
        }

        await this.supabase
          .from("vc_fund_signals")
          .update({
            intelligence_event_id: event.id,
            mirrored_to_intelligence_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        mirrored += 1;
      }

      return mirrored;
    });
  }

  async repairVcFundSignalMirror(options: FundSyncRunOptions = {}): Promise<number> {
    return this.mirrorVcFundSignalsToIntelligenceEvents({ ...options, force: true });
  }

  async promoteCandidateCapitalEvent(
    candidate: CandidateRow,
    firms?: FirmRecordLookup[],
    investors?: Array<{ id: string; firm_id: string; full_name: string; title?: string | null }>,
  ): Promise<{
    fundId: string;
    wasUpdate: boolean;
    attachedSources: number;
    linkedPeople: number;
    emittedSignals: number;
    firmMatched: boolean;
    sentToReview: boolean;
  } | null> {
    const evidenceRows = await this.loadCandidateEvidence(candidate.id);
    if (!evidenceRows.length) return null;

    const firmUniverse = firms || await this.loadFirmLookups({});
    const investorUniverse = investors || await this.loadFirmInvestorLookups();
    const firm = await this.resolveCandidateFirm(candidate, firmUniverse);
    if (!firm) {
      await this.sendCandidateToReview(candidate, "Weak or missing firm match during promotion");
      return { fundId: "", wasUpdate: false, attachedSources: 0, linkedPeople: 0, emittedSignals: 0, firmMatched: false, sentToReview: true };
    }

    const grouped = this.hydrateAnnouncementsFromEvidence(candidate, evidenceRows);
    const sequenceNumbers = new Set(grouped.map((item) => inferSequenceNumber(item)).filter((value) => value != null));
    if (sequenceNumbers.size > 1) {
      await this.sendCandidateToReview(candidate, "Conflicting sequence numbers across evidence");
      return { fundId: "", wasUpdate: false, attachedSources: 0, linkedPeople: 0, emittedSignals: 0, firmMatched: true, sentToReview: true };
    }

    const collisions = await this.findCanonicalFundCollisions(candidate, firm.id);
    if (collisions.length > 1) {
      await this.sendCandidateToReview(candidate, "Multiple possible canonical fund matches", {
        suggestedMatches: collisions.map((row) => ({
          id: row.id,
          normalized_name: row.normalized_name,
          fund_sequence_number: row.fund_sequence_number,
          vintage_year: row.vintage_year,
        })),
      });
      return { fundId: "", wasUpdate: false, attachedSources: 0, linkedPeople: 0, emittedSignals: 0, firmMatched: true, sentToReview: true };
    }

    const overlapping = await this.findOverlappingCandidateFunds(candidate, firm.id);
    if (overlapping.length > 0) {
      await this.sendCandidateToReview(candidate, "Same firm has overlapping candidate funds that may be duplicate or misparsed", {
        suggestedMatches: overlapping.map((row) => ({
          id: row.id,
          cluster_key: row.cluster_key,
          normalized_fund_label: row.normalized_fund_label,
          fund_sequence_number: row.fund_sequence_number,
          announced_date: row.announced_date,
        })),
      });
      return { fundId: "", wasUpdate: false, attachedSources: 0, linkedPeople: 0, emittedSignals: 0, firmMatched: true, sentToReview: true };
    }

    const verification = await this.verifyAndUpsertCanonicalFund(candidate, firm, grouped, investorUniverse);
    return {
      fundId: verification.fundId,
      wasUpdate: verification.wasUpdate,
      attachedSources: verification.attachedSources,
      linkedPeople: verification.linkedPeople,
      emittedSignals: verification.emittedSignals,
      firmMatched: true,
      sentToReview: false,
    };
  }

  async verifyAndUpsertCanonicalFund(
    candidate: CandidateRow,
    firm: FirmRecordLookup,
    grouped: ExtractedFundAnnouncement[],
    investors: Array<{ id: string; firm_id: string; full_name: string; title?: string | null }>,
  ) {
    const canonical = this.buildCanonicalDraft(firm, grouped);
    if (candidate.status !== "verified" && candidate.official_source_present) {
      canonical.verificationStatus = "official_source_promoted";
    }
    const { fundId, wasUpdate } = await this.upsertFund(canonical);
    const attachedSources = await this.attachProvenanceFromCandidate(fundId, grouped);
    const linkedPeople = await this.linkPeople(fundId, grouped, investors);
    const signals = dedupeSignals(this.buildSignals(firm, canonical, grouped, fundId));
    const emittedSignals = await this.emitSignals(firm.id, fundId, signals, candidate.id);

    await this.markCandidatePromoted(candidate.id, fundId);
    await this.refreshFirmDerivations(firm.id, 365);
    await this.refreshInvestorRankingInputs(firm.id);
    await this.mirrorLegacyFundRecord(firm, canonical, fundId);

    return { fundId, wasUpdate, attachedSources, linkedPeople, emittedSignals };
  }

  async attachProvenanceFromCandidate(fundId: string, grouped: ExtractedFundAnnouncement[]): Promise<number> {
    return this.attachSources(fundId, this.buildSourceRows(grouped));
  }

  async getCapitalHeatmapBackend(options: { windowDays?: number } = {}) {
    const { data, error } = await this.supabase.rpc("get_capital_heatmap_backend", {
      p_window_days: options.windowDays ?? 180,
    });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async refreshCapitalHeatmap(_options: { windowDays?: number } = {}) {
    return this.getCapitalHeatmapBackend(_options);
  }

  async rederive(options: FundSyncRunOptions = {}) {
    return this.withRunLog("rederive", options, async () => {
      const refreshed = await this.refreshFirmDerivations(options.firmId || null, options.freshCapitalWindowDays ?? 365);
      let investorsRefreshed = 0;
      if (options.firmId) {
        await this.refreshInvestorRankingInputs(options.firmId);
        investorsRefreshed = 1;
      } else {
        const firms = await this.loadFirmLookups({});
        for (const firm of firms.slice(0, options.maxItems ?? firms.length)) {
          await this.refreshInvestorRankingInputs(firm.id);
          investorsRefreshed += 1;
        }
      }
      return refreshed || investorsRefreshed;
    });
  }

  private async loadFirmLookups(options: FundSyncRunOptions = {}): Promise<FirmRecordLookup[]> {
    let query = this.supabase
      .from("firm_records")
      .select("id, firm_name, legal_name, website_url, aliases, slug, entity_type, stage_focus, thesis_verticals, active_geo_focus, min_check_size, max_check_size")
      .is("deleted_at", null)
      .limit(50000);
    if (options.firmId) query = query.eq("id", options.firmId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load firm_records: ${error.message}`);
    return (data ?? []) as FirmRecordLookup[];
  }

  private async loadFirmInvestorLookups(): Promise<Array<{ id: string; firm_id: string; full_name: string; title?: string | null }>> {
    const { data, error } = await this.supabase
      .from("firm_investors")
      .select("id, firm_id, full_name, title")
      .is("deleted_at", null)
      .limit(50000);
    if (error) return [];
    return (data ?? []) as Array<{ id: string; firm_id: string; full_name: string; title?: string | null }>;
  }

  private buildCanonicalDraft(firm: FirmRecordLookup, grouped: ExtractedFundAnnouncement[]): CanonicalFundDraft {
    const base = grouped[0];
    const fundName =
      chooseValue("fundName", grouped.map((item) => ({ value: item.fundName || item.fundLabel || item.sourceTitle || null, sourceType: item.sourceType }))) ||
      `${firm.firm_name} Fund`;
    const normalizedName = normalizeFundName(fundName);
    const fundType = chooseValue("fundType", grouped.map((item) => ({ value: inferFundType(item), sourceType: item.sourceType })));
    const announcedDate = chooseValue("announcedDate", grouped.map((item) => ({ value: item.announcedDate || null, sourceType: item.sourceType })));
    const closeDate = chooseValue("closeDate", grouped.map((item) => ({ value: item.closeDate || null, sourceType: item.sourceType })));
    const targetSizeUsd = chooseValue("targetSizeUsd", grouped.map((item) => ({ value: item.targetSizeUsd ?? item.fundSize ?? null, sourceType: item.sourceType })));
    const finalSizeUsd = chooseValue("finalSizeUsd", grouped.map((item) => ({ value: item.finalSizeUsd ?? null, sourceType: item.sourceType })));
    const vintageYear = chooseValue("vintageYear", grouped.map((item) => ({ value: item.vintageYear ?? null, sourceType: item.sourceType })));
    const status = inferFundStatus({
      closeDate,
      targetSizeUsd,
      finalSizeUsd,
      rawText: grouped.map((item) => item.rawText || "").join("\n"),
    });
    const fieldProvenance: Record<string, string[]> = {};
    const fieldConfidence: Record<string, number> = {};

    const provenanceEntries: Array<[string, unknown]> = [
      ["fundName", fundName],
      ["fundType", fundType],
      ["announcedDate", announcedDate],
      ["closeDate", closeDate],
      ["targetSizeUsd", targetSizeUsd],
      ["finalSizeUsd", finalSizeUsd],
      ["vintageYear", vintageYear],
    ];

    for (const [fieldName, fieldValue] of provenanceEntries) {
      if (fieldValue == null) continue;
      const sources = grouped
        .filter((item) => {
          if (fieldName === "fundName") return Boolean(item.fundName || item.fundLabel || item.sourceTitle);
          if (fieldName === "fundType") return Boolean(inferFundType(item));
          return item.rawPayload != null || item.rawText != null;
        })
        .map((item) => item.sourceUrl);
      fieldProvenance[fieldName] = Array.from(new Set(sources.filter(Boolean))) as string[];
      fieldConfidence[fieldName] = roundConfidence(Math.max(...grouped.map((item) => item.confidence), 0.5));
    }

    const sequenceNumber = inferSequenceNumber(base);
    const normalizedKey = buildFundNormalizedKey({ firmRecordId: firm.id, fundName, vintageYear });
    const capitalWindow = deriveCapitalWindow({ announcedDate, closeDate, fundType, status });
    const checkRange = deriveEstimatedCheckRange(
      { finalSizeUsd, targetSizeUsd, fundType },
      { checkSizeMin: firm.min_check_size ?? null, checkSizeMax: firm.max_check_size ?? null },
    );
    const latestSourcePublishedAt = grouped
      .map((item) => item.closeDate || item.announcedDate || null)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    const nowIso = new Date().toISOString();

    return {
      firmRecordId: firm.id,
      name: fundName,
      normalizedName,
      normalizedKey,
      fundType,
      fundSequenceNumber: sequenceNumber,
      vintageYear,
      announcedDate,
      closeDate,
      targetSizeUsd,
      finalSizeUsd,
      currency: base.currency || "USD",
      status,
      sourceConfidence: roundConfidence(grouped.reduce((sum, item) => sum + item.confidence, 0) / Math.max(grouped.length, 1)),
      sourceCount: grouped.length,
      leadSource: base.sourceType,
      announcementUrl: base.sourceUrl || null,
      announcementTitle: base.sourceTitle || null,
      rawSourceText: grouped.map((item) => item.rawText).filter(Boolean).join("\n\n") || null,
      isNewFundSignal: true,
      activeDeploymentWindowStart: capitalWindow.start,
      activeDeploymentWindowEnd: capitalWindow.end,
      likelyActivelyDeploying: null,
      stageFocus: normalizeArray(grouped.flatMap((item) => item.stageFocus || [])),
      sectorFocus: normalizeArray(grouped.flatMap((item) => item.sectorFocus || [])),
      geographyFocus: normalizeArray(grouped.flatMap((item) => item.geographyFocus || [])),
      estimatedCheckMinUsd: checkRange.minUsd,
      estimatedCheckMaxUsd: checkRange.maxUsd,
      fieldConfidence,
      fieldProvenance,
      verificationStatus: "verified",
      lastVerifiedAt: nowIso,
      freshnessSyncedAt: nowIso,
      latestSourcePublishedAt,
      metadata: {
        adapter_keys: Array.from(new Set(grouped.map((item) => item.sourceType))),
        external_ids: grouped.map((item) => item.externalId).filter(Boolean),
      },
    };
  }

  private buildSourceRows(grouped: ExtractedFundAnnouncement[]): FundSourceRecord[] {
    return grouped.map((item) => ({
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl || null,
      sourceTitle: item.sourceTitle || null,
      publisher: item.sourcePublisher || null,
      publishedAt: item.announcedDate || item.closeDate || null,
      extractedPayload: {
        ...item.rawPayload,
        fund_name: item.fundName,
        fund_label: item.fundLabel,
        raw_text: item.rawText,
      },
      confidence: roundConfidence(item.confidence),
      contentHash: contentHash([item.sourceUrl, item.sourceTitle, item.fundName, item.vintageYear, item.fundSize]),
    }));
  }

  private buildSignals(firm: FirmRecordLookup, fund: CanonicalFundDraft, grouped: ExtractedFundAnnouncement[], fundId: string): FundSignalRecord[] {
    const derivations = deriveFirmCapitalState(fund);
    fund.likelyActivelyDeploying = derivations.likelyActivelyDeploying;
    const eventDate = fund.closeDate || fund.announcedDate || new Date().toISOString().slice(0, 10);
    const representativeSize = fund.finalSizeUsd ?? fund.targetSizeUsd;
    const recencyDays = eventDate ? Math.floor((Date.now() - new Date(`${eventDate}T00:00:00Z`).getTime()) / 86400000) : null;
    const capitalPriority = computeFreshCapitalPriorityScore({
      recencyDays,
      representativeSizeUsd: representativeSize,
      confidenceScore: fund.sourceConfidence,
      officialSourcePresent: grouped.some((item) => item.sourceType === "official_website"),
    });
    const baseHeadline = `${firm.firm_name} ${fund.name}`;
    const signals: FundSignalRecord[] = [
      {
        signalType: "new_vehicle_detected",
        eventDate,
        headline: `${baseHeadline} detected`,
        summary: `New fund vehicle detected for ${firm.firm_name}.`,
        sourceUrl: fund.announcementUrl,
        confidence: fund.sourceConfidence,
        displayPriority: 60,
        metadata: { fund_id: fundId, normalized_key: fund.normalizedKey, capital_priority_score: capitalPriority },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:new_vehicle_detected`,
      },
    ];

    if (fund.status === "final_close") {
      signals.push({
        signalType: "fund_closed",
        eventDate,
        headline: `${firm.firm_name} closes ${fund.name}`,
        summary: representativeSize ? `${firm.firm_name} closed ${fund.name} at approximately $${Math.round(representativeSize).toLocaleString()}.` : `${firm.firm_name} closed ${fund.name}.`,
        sourceUrl: fund.announcementUrl,
        confidence: fund.sourceConfidence,
        displayPriority: 90,
        metadata: { fund_id: fundId, status: fund.status, size_usd: representativeSize, capital_priority_score: capitalPriority },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:fund_closed:${eventDate}`,
      });
    } else {
      signals.push({
        signalType: "new_fund_announced",
        eventDate,
        headline: `${firm.firm_name} announces ${fund.name}`,
        summary: representativeSize ? `${firm.firm_name} announced ${fund.name} with approximately $${Math.round(representativeSize).toLocaleString()} in fresh capital.` : `${firm.firm_name} announced ${fund.name}.`,
        sourceUrl: fund.announcementUrl,
        confidence: fund.sourceConfidence,
        displayPriority: 88,
        metadata: { fund_id: fundId, status: fund.status, size_usd: representativeSize, capital_priority_score: capitalPriority },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:new_fund_announced:${eventDate}`,
      });
    }

    if (fund.targetSizeUsd != null && fund.finalSizeUsd == null) {
      signals.push({
        signalType: "fund_target_updated",
        eventDate,
        headline: `${firm.firm_name} targets ${fund.name}`,
        summary: `${fund.name} is targeting approximately $${Math.round(fund.targetSizeUsd).toLocaleString()}.`,
        sourceUrl: fund.announcementUrl,
        confidence: fund.sourceConfidence,
        displayPriority: 65,
        metadata: { fund_id: fundId, target_size_usd: fund.targetSizeUsd, capital_priority_score: capitalPriority },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:fund_target_updated:${eventDate}`,
      });
    }

    if (representativeSize != null) {
      signals.push({
        signalType: "fund_size_updated",
        eventDate,
        headline: `${fund.name} size updated`,
        summary: `${fund.name} now reflects approximately $${Math.round(representativeSize).toLocaleString()}.`,
        sourceUrl: fund.announcementUrl,
        confidence: fund.sourceConfidence,
        displayPriority: 55,
        metadata: { fund_id: fundId, representative_size_usd: representativeSize, capital_priority_score: capitalPriority },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:fund_size_updated:${representativeSize}`,
      });
    }

    if (derivations.hasFreshCapital) {
      signals.push({
        signalType: "fresh_capital_inferred",
        eventDate,
        headline: `${firm.firm_name} has fresh capital`,
        summary: `${firm.firm_name} likely has fresh deployable capital based on ${grouped.length} corroborating source${grouped.length === 1 ? "" : "s"}.`,
        sourceUrl: fund.announcementUrl,
        confidence: Math.max(fund.sourceConfidence, 0.7),
        displayPriority: 75,
        metadata: {
          fund_id: fundId,
          active_window_start: derivations.activeDeploymentWindowStart,
          active_window_end: derivations.activeDeploymentWindowEnd,
          priority_score_for_founders: derivations.priorityScoreForFounders,
          capital_priority_score: capitalPriority,
        },
        dedupeKey: `${firm.id}:${fund.normalizedKey}:fresh_capital_inferred`,
      });
    }

    return signals;
  }

  private async upsertFund(fund: CanonicalFundDraft): Promise<{ fundId: string; wasUpdate: boolean }> {
    const { data: existing } = await this.supabase.from("vc_funds").select("id").eq("normalized_key", fund.normalizedKey).is("deleted_at", null).maybeSingle();
    const payload = {
      firm_record_id: fund.firmRecordId,
      name: fund.name,
      normalized_name: fund.normalizedName,
      normalized_key: fund.normalizedKey,
      fund_type: fund.fundType,
      fund_sequence_number: fund.fundSequenceNumber,
      vintage_year: fund.vintageYear,
      announced_date: fund.announcedDate,
      close_date: fund.closeDate,
      target_size_usd: fund.targetSizeUsd,
      final_size_usd: fund.finalSizeUsd,
      currency: fund.currency,
      status: fund.status,
      source_confidence: fund.sourceConfidence,
      source_count: fund.sourceCount,
      lead_source: fund.leadSource,
      announcement_url: fund.announcementUrl,
      announcement_title: fund.announcementTitle,
      raw_source_text: fund.rawSourceText,
      is_new_fund_signal: fund.isNewFundSignal,
      active_deployment_window_start: fund.activeDeploymentWindowStart,
      active_deployment_window_end: fund.activeDeploymentWindowEnd,
      likely_actively_deploying: fund.likelyActivelyDeploying,
      stage_focus: fund.stageFocus,
      sector_focus: fund.sectorFocus,
      geography_focus: fund.geographyFocus,
      estimated_check_min_usd: fund.estimatedCheckMinUsd,
      estimated_check_max_usd: fund.estimatedCheckMaxUsd,
      field_confidence: fund.fieldConfidence,
      field_provenance: fund.fieldProvenance,
      verification_status: fund.verificationStatus,
      last_verified_at: fund.lastVerifiedAt,
      freshness_synced_at: fund.freshnessSyncedAt,
      latest_source_published_at: fund.latestSourcePublishedAt,
      metadata: fund.metadata,
      last_signal_at: new Date().toISOString(),
    };
    const { data, error } = await this.supabase.from("vc_funds").upsert(payload, { onConflict: "normalized_key" }).select("id").single();
    if (error) throw new Error(`Failed to upsert vc_funds: ${error.message}`);
    return { fundId: String(data.id), wasUpdate: Boolean(existing?.id) };
  }

  private async attachSources(fundId: string, rows: FundSourceRecord[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      const conflictColumns = row.sourceUrl ? "vc_fund_id,source_url" : "vc_fund_id,content_hash";
      const { error } = await this.supabase.from("vc_fund_sources").upsert({
        vc_fund_id: fundId,
        source_type: row.sourceType,
        source_url: row.sourceUrl,
        source_title: row.sourceTitle,
        publisher: row.publisher,
        published_at: row.publishedAt,
        extracted_payload: row.extractedPayload,
        confidence: row.confidence,
        content_hash: row.contentHash,
      }, { onConflict: conflictColumns });
      if (!error) count += 1;
    }
    return count;
  }

  private async linkPeople(
    fundId: string,
    grouped: ExtractedFundAnnouncement[],
    investors: Array<{ id: string; firm_id: string; full_name: string; title?: string | null }>,
  ): Promise<number> {
    let count = 0;
    const partners = grouped.flatMap((item) => item.partners || []);
    if (!partners.length) return 0;
    const fund = await this.supabase.from("vc_funds").select("firm_record_id").eq("id", fundId).single();
    const firmRecordId = String(fund.data?.firm_record_id || "");
    if (!firmRecordId) return 0;

    for (const partner of partners) {
      const candidate = investors.find((investor) => investor.firm_id === firmRecordId && investor.full_name?.toLowerCase() === partner.fullName.toLowerCase());
      const { error } = await this.supabase.from("vc_fund_people").upsert({
        vc_fund_id: fundId,
        firm_investor_id: candidate?.id || null,
        canonical_person_key: candidate ? null : partner.fullName.toLowerCase(),
        role: partner.role || "partner",
        confidence: roundConfidence(partner.confidence ?? 0.7),
        source: partner.title || "inferred_from_announcement",
        source_url: grouped[0]?.sourceUrl || null,
      }, { onConflict: candidate?.id ? "vc_fund_id,firm_investor_id,role" : "vc_fund_id,canonical_person_key,role" });
      if (!error) count += 1;
    }
    return count;
  }

  private async emitSignals(firmRecordId: string, fundId: string, signals: FundSignalRecord[], candidateCapitalEventId?: string): Promise<number> {
    let count = 0;
    for (const signal of signals) {
      const { error } = await this.supabase.from("vc_fund_signals").upsert({
        signal_type: signal.signalType,
        firm_record_id: firmRecordId,
        vc_fund_id: fundId,
        event_date: signal.eventDate,
        headline: signal.headline,
        summary: signal.summary,
        source_url: signal.sourceUrl,
        confidence: signal.confidence,
        display_priority: signal.displayPriority,
        metadata: {
          ...signal.metadata,
          candidate_capital_event_id: candidateCapitalEventId || null,
        },
        dedupe_key: signal.dedupeKey,
      }, { onConflict: "dedupe_key" });
      if (!error) count += 1;
    }
    return count;
  }

  private async upsertCandidateCluster(draft: CandidateCapitalEventDraft, evidence: CandidateCapitalEventEvidence, firmMatchConfidence: number) {
    const { data: existingEvidence } = await this.supabase
      .from("candidate_capital_event_evidence")
      .select("id, candidate_capital_event_id")
      .eq("source_url", evidence.sourceUrl)
      .maybeSingle();

    if (existingEvidence?.candidate_capital_event_id) {
      await this.supabase.from("candidate_capital_events").update({
        latest_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", existingEvidence.candidate_capital_event_id);
      return { action: "deduped_source_url", candidateId: existingEvidence.candidate_capital_event_id };
    }

    const { data: existingCluster } = await this.supabase
      .from("candidate_capital_events")
      .select("*")
      .eq("cluster_key", draft.clusterKey)
      .in("status", ["pending", "review", "escalated", "verifying", "verified", "promoted"])
      .order("latest_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingCluster) {
      const { data: inserted, error } = await this.supabase
        .from("candidate_capital_events")
        .insert({
          firm_record_id: draft.firmRecordId,
          raw_firm_name: draft.rawFirmName,
          normalized_firm_name: draft.normalizedFirmName,
          candidate_headline: draft.candidateHeadline,
          excerpt: draft.excerpt,
          source_url: draft.sourceUrl,
          source_type: draft.sourceType,
          publisher: draft.publisher,
          published_at: draft.publishedAt,
          raw_text: draft.rawText,
          event_type_guess: draft.eventTypeGuess,
          normalized_fund_label: draft.normalizedFundLabel,
          fund_sequence_number: draft.fundSequenceNumber,
          vintage_year: draft.vintageYear,
          announced_date: draft.announcedDate,
          size_amount: draft.sizeAmount,
          size_currency: draft.sizeCurrency,
          confidence_score: draft.confidenceScore,
          confidence_breakdown: draft.confidenceBreakdown,
          evidence_count: 1,
          source_diversity: 1,
          official_source_present: draft.officialSourcePresent,
          cluster_key: draft.clusterKey,
          canonical_vc_fund_id: null,
          status: draft.status,
          review_reason: draft.reviewReason,
          metadata: {
            ...draft.metadata,
            source_urls: [draft.sourceUrl],
            firm_match_confidence: firmMatchConfidence,
          },
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to insert candidate_capital_events: ${error.message}`);
      await this.insertCandidateEvidence(inserted.id, evidence);
      if (draft.status === "review") {
        await this.enqueueReview("fund", {
          externalId: draft.clusterKey || draft.sourceUrl,
          firmName: draft.rawFirmName,
          sourceUrl: draft.sourceUrl,
          sourceType: draft.sourceType as any,
          confidence: draft.confidenceScore,
        } as ExtractedFundAnnouncement, "Low-confidence capital event cluster requires review");
      }
      return { action: "inserted_cluster", candidateId: inserted.id, score: draft.confidenceScore, status: draft.status };
    }

    await this.insertCandidateEvidence(existingCluster.id, evidence);
    const evidenceRows = await this.loadCandidateEvidence(existingCluster.id);
    const hydrated = this.hydrateAnnouncementsFromEvidence(existingCluster as CandidateRow, evidenceRows);
    const corroborationCount = hydrated.length;
    const sourceDiversity = new Set(evidenceRows.map((row) => `${row.publisher || ""}:${row.source_type}`)).size;
    const independentSourceCount = new Set(evidenceRows.map((row) => `${row.source_type}:${hostish(row.source_url || row.publisher || "")}`)).size;
    const officialSourcePresent = evidenceRows.some((row) => row.source_type === "official_website");
    const corroborationScore = computeCorroborationScore(hydrated);
    const conflictPenalty = computeConflictPenalty(hydrated);
    const score = scoreCandidateCapitalEvent({
      item: hydrated[0],
      firm: existingCluster.firm_record_id ? { id: existingCluster.firm_record_id, firm_name: existingCluster.raw_firm_name } as FirmRecordLookup : null,
      firmMatchConfidence,
      corroborationCount,
      officialSourcePresent,
      corroborationScore,
      conflictPenalty,
      independentSourceCount,
    });
    const clusterAgeDays = Math.max(0, Math.round((Date.now() - new Date(existingCluster.first_seen_at || existingCluster.created_at || Date.now()).getTime()) / 86400000));
    let status = statusFromCandidateScore(score);
    if (status === "verified" && (!officialSourcePresent || corroborationScore < CAPITAL_EVENT_THRESHOLDS.minCorroborationScore) && score < CAPITAL_EVENT_THRESHOLDS.officialSourceAutoPromote) {
      status = "escalated";
    }
    if (conflictPenalty > 0.35 || clusterAgeDays > CAPITAL_EVENT_THRESHOLDS.maxClusterAgeDaysBeforeReview) {
      status = "review";
    }

    const leadEvidence = evidenceRows.find((row) => row.source_type === "official_website") || evidenceRows[0];
    const { error } = await this.supabase.from("candidate_capital_events").update({
      candidate_headline: leadEvidence.headline,
      excerpt: leadEvidence.excerpt,
      source_url: leadEvidence.source_url,
      source_type: leadEvidence.source_type,
      publisher: leadEvidence.publisher,
      published_at: leadEvidence.published_at,
      raw_text: leadEvidence.raw_text,
      confidence_score: score,
      confidence_breakdown: {
        ...(existingCluster.confidence_breakdown || {}),
        corroboration_count: corroborationCount,
        corroboration_score: corroborationScore,
        conflict_penalty: conflictPenalty,
        independent_source_count: independentSourceCount,
        source_diversity: sourceDiversity,
        official_source_present: officialSourcePresent,
      },
      evidence_count: corroborationCount,
      source_diversity: sourceDiversity,
      official_source_present: officialSourcePresent,
      latest_seen_at: new Date().toISOString(),
      status: existingCluster.status === "promoted" ? "promoted" : existingCluster.status === "verified" ? "verified" : status,
      review_reason: status === "review" ? "Conflicting corroboration or stale escalated cluster" : null,
      metadata: {
        ...(existingCluster.metadata || {}),
        source_urls: Array.from(new Set(evidenceRows.map((row) => row.source_url))),
        cluster_age_days: clusterAgeDays,
      },
    }).eq("id", existingCluster.id);
    if (error) throw new Error(`Failed to update candidate cluster: ${error.message}`);
    if (status === "review") {
      await this.sendCandidateToReview(existingCluster as CandidateRow, "Conflicting corroboration or stale escalated cluster", {
        conflictingFields: conflictPenalty > 0.35 ? ["size_amount", "announced_date", "fund_sequence_number"] : ["latest_seen_at"],
        evidenceRows,
      });
    }
    return { action: "updated_cluster", candidateId: existingCluster.id, score, status };
  }

  private async insertCandidateEvidence(candidateId: string, evidence: CandidateCapitalEventEvidence) {
    const { error } = await this.supabase.from("candidate_capital_event_evidence").upsert({
      candidate_capital_event_id: candidateId,
      source_url: evidence.sourceUrl,
      source_type: evidence.sourceType,
      publisher: evidence.publisher,
      published_at: evidence.publishedAt,
      headline: evidence.headline,
      excerpt: evidence.excerpt,
      raw_text: evidence.rawText,
      raw_payload: evidence.rawPayload,
      score: evidence.score,
    }, { onConflict: "source_url" });
    if (error) throw new Error(`Failed to insert candidate evidence: ${error.message}`);
  }

  private async loadPromotableCandidates(options: FundSyncRunOptions): Promise<CandidateRow[]> {
    const requireVerified = options.requireVerifiedForPromotion ?? true;
    let query = this.supabase
      .from("candidate_capital_events")
      .select("*")
      .in("status", requireVerified ? ["verified"] : ["verified", "escalated"])
      .order("latest_seen_at", { ascending: false })
      .limit(options.maxItems ?? 200);
    if (options.firmId) query = query.eq("firm_record_id", options.firmId);
    if (options.clusterKey) query = query.eq("cluster_key", options.clusterKey);
    if (options.dateFrom) query = query.gte("published_at", options.dateFrom);
    if (options.dateTo) query = query.lte("published_at", options.dateTo);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load promotable candidates: ${error.message}`);
    return ((data ?? []) as CandidateRow[]).filter((candidate) => {
      if (candidate.status === "verified") return true;
      return Boolean(
        options.allowOfficialSourcePromotion &&
        candidate.official_source_present &&
        Number(candidate.confidence_score) >= CAPITAL_EVENT_THRESHOLDS.officialSourceAutoPromote,
      );
    });
  }

  private async loadCandidateEvidence(candidateId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from("candidate_capital_event_evidence")
      .select("*")
      .eq("candidate_capital_event_id", candidateId)
      .order("published_at", { ascending: false });
    if (error) throw new Error(`Failed to load candidate evidence: ${error.message}`);
    return data ?? [];
  }

  private async resolveCandidateFirm(candidate: CandidateRow, firms: FirmRecordLookup[]): Promise<FirmRecordLookup | null> {
    if (candidate.firm_record_id) {
      const existing = firms.find((firm) => firm.id === candidate.firm_record_id);
      if (existing) return existing;
    }
    const synthetic: ExtractedFundAnnouncement = {
      firmName: candidate.raw_firm_name,
      sourceUrl: candidate.source_url,
      sourceType: candidate.source_type as any,
      confidence: candidate.confidence_score,
      sourceTitle: candidate.candidate_headline,
      rawText: candidate.raw_text,
    };
    return matchFirmRecord(synthetic, firms).matchedFirm;
  }

  private hydrateAnnouncementsFromEvidence(candidate: CandidateRow, evidenceRows: any[]): ExtractedFundAnnouncement[] {
    return evidenceRows.map((row) => {
      const payload = row.raw_payload || {};
      return {
        externalId: payload.external_id || contentHash([row.source_url, row.headline]),
        firmName: payload.firm_name || candidate.raw_firm_name,
        firmWebsiteUrl: payload.firm_website_url || null,
        fundName: payload.fund_name || null,
        fundLabel: payload.fund_label || candidate.normalized_fund_label || null,
        fundType: payload.fund_type || null,
        fundSize: payload.fund_size ?? candidate.size_amount ?? null,
        targetSizeUsd: payload.target_size_usd ?? null,
        finalSizeUsd: payload.final_size_usd ?? null,
        currency: payload.currency || candidate.size_currency || "USD",
        vintageYear: payload.vintage_year ?? candidate.vintage_year ?? null,
        announcedDate: payload.announced_date || candidate.announced_date || (row.published_at ? String(row.published_at).slice(0, 10) : null),
        closeDate: payload.close_date || null,
        sourceUrl: payload.original_source_url || row.source_url,
        sourceTitle: row.headline,
        sourcePublisher: row.publisher,
        sourceType: row.source_type,
        rawText: row.raw_text,
        confidence: Number(row.score || candidate.confidence_score || 0.5),
        partners: payload.partners || [],
        metadata: payload.metadata || {},
        rawPayload: payload,
      } as ExtractedFundAnnouncement;
    });
  }

  private async findCanonicalFundCollisions(candidate: CandidateRow, firmRecordId: string) {
    let query = this.supabase
      .from("vc_funds")
      .select("id, normalized_name, fund_sequence_number, vintage_year")
      .eq("firm_record_id", firmRecordId)
      .is("deleted_at", null);
    if (candidate.normalized_fund_label) query = query.eq("normalized_name", candidate.normalized_fund_label);
    const { data, error } = await query.limit(5);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private async findOverlappingCandidateFunds(candidate: CandidateRow, firmRecordId: string) {
    let query = this.supabase
      .from("candidate_capital_events")
      .select("id, cluster_key, normalized_fund_label, fund_sequence_number, announced_date")
      .eq("firm_record_id", firmRecordId)
      .neq("id", candidate.id)
      .in("status", ["pending", "escalated", "verifying", "verified"])
      .order("latest_seen_at", { ascending: false })
      .limit(5);
    if (candidate.fund_sequence_number != null) query = query.eq("fund_sequence_number", candidate.fund_sequence_number);
    else if (candidate.normalized_fund_label) query = query.eq("normalized_fund_label", candidate.normalized_fund_label);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private async markCandidatePromoted(candidateId: string, fundId: string) {
    await this.supabase.from("candidate_capital_events").update({
      canonical_vc_fund_id: fundId,
      status: "promoted",
      review_reason: null,
      promoted_at: new Date().toISOString(),
      latest_seen_at: new Date().toISOString(),
    }).eq("id", candidateId);
  }

  private async sendCandidateToReview(candidate: CandidateRow, reason: string, details: {
    conflictingFields?: string[];
    evidenceRows?: any[];
    suggestedMatches?: Array<Record<string, unknown>>;
  } = {}) {
    await this.supabase.from("candidate_capital_events").update({
      status: "review",
      review_reason: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", candidate.id);

    const evidenceRows = details.evidenceRows || await this.loadCandidateEvidence(candidate.id);
    const payload = {
      entity_type: "fund",
      entity_id: candidate.id,
      firm_id: candidate.firm_record_id,
      reason,
      review_data: {
        candidate,
        cluster_key: candidate.cluster_key,
        evidence_summary: evidenceRows.map((row) => ({
          source_url: row.source_url,
          source_type: row.source_type,
          publisher: row.publisher,
          published_at: row.published_at,
          headline: row.headline,
          score: row.score,
        })),
        conflicting_fields: details.conflictingFields || [],
        source_urls: Array.from(new Set(evidenceRows.map((row) => row.source_url))),
        suggested_canonical_matches: details.suggestedMatches || [],
      },
      status: "pending",
    };

    const { data: existing } = await this.supabase
      .from("enrichment_review_queue")
      .select("id")
      .eq("entity_type", "fund")
      .eq("entity_id", candidate.id)
      .eq("reason", reason)
      .in("status", ["pending", "in_progress"])
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await this.supabase.from("enrichment_review_queue").update(payload).eq("id", existing.id);
    } else {
      await this.supabase.from("enrichment_review_queue").insert(payload);
    }
  }

  private async updateCandidateStatus(candidateId: string, status: CandidateCapitalEventStatus, reviewReason: string | null) {
    const payload: Record<string, unknown> = {
      status,
      review_reason: reviewReason,
      updated_at: new Date().toISOString(),
    };
    if (status === "verifying") payload.verification_started_at = new Date().toISOString();
    if (status === "verified") payload.verified_at = new Date().toISOString();
    await this.supabase.from("candidate_capital_events").update(payload).eq("id", candidateId);
  }

  private async loadVerifiableCandidates(options: FundSyncRunOptions): Promise<CandidateRow[]> {
    let query = this.supabase
      .from("candidate_capital_events")
      .select("*")
      .eq("status", "escalated")
      .order("confidence_score", { ascending: false })
      .order("latest_seen_at", { ascending: false })
      .limit(options.verifierBatchSize ?? options.maxItems ?? CAPITAL_EVENT_THRESHOLDS.verifierBatchSize);
    if (options.firmId) query = query.eq("firm_record_id", options.firmId);
    if (options.clusterKey) query = query.eq("cluster_key", options.clusterKey);
    if (options.dateFrom) query = query.gte("published_at", options.dateFrom);
    if (options.dateTo) query = query.lte("published_at", options.dateTo);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load verifiable candidates: ${error.message}`);
    return (data ?? []) as CandidateRow[];
  }

  private async loadFirmLookupById(firmId: string): Promise<FirmRecordLookup | null> {
    const { data, error } = await this.supabase
      .from("firm_records")
      .select("id, firm_name, legal_name, website_url, aliases, slug, entity_type, stage_focus, thesis_verticals, active_geo_focus, min_check_size, max_check_size")
      .eq("id", firmId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return null;
    return (data as FirmRecordLookup | null) || null;
  }

  private async rankCandidateFirmMatches(candidate: CandidateRow, hydrated: ExtractedFundAnnouncement[]) {
    const basis = hydrated[0] || {
      firmName: candidate.raw_firm_name,
      sourceUrl: candidate.source_url,
      sourceType: candidate.source_type as any,
      confidence: candidate.confidence_score,
      rawText: candidate.raw_text,
      sourceTitle: candidate.candidate_headline,
    };
    const firms = await this.loadFirmLookups({});
    return rankFirmMatches(basis, firms);
  }

  private pickDominantSequence(hydrated: ExtractedFundAnnouncement[]): number | null {
    const counts = new Map<number, number>();
    for (const value of hydrated.map((item) => inferSequenceNumber(item)).filter((value): value is number => value != null)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private pickDominantVintage(hydrated: ExtractedFundAnnouncement[]): number | null {
    const counts = new Map<number, number>();
    for (const value of hydrated.map((item) => item.vintageYear).filter((value): value is number => value != null)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private pickDominantDate(hydrated: ExtractedFundAnnouncement[]): string | null {
    const counts = new Map<string, number>();
    for (const value of hydrated.map((item) => item.closeDate || item.announcedDate).filter((value): value is string => Boolean(value))) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private pickDominantSize(hydrated: ExtractedFundAnnouncement[]): number | null {
    const counts = new Map<number, number>();
    for (const value of hydrated.map((item) => item.finalSizeUsd ?? item.targetSizeUsd ?? item.fundSize).filter((value): value is number => typeof value === "number")) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private detectSequenceConflict(hydrated: ExtractedFundAnnouncement[]): boolean {
    return new Set(hydrated.map((item) => inferSequenceNumber(item)).filter((value) => value != null)).size > 1;
  }

  private detectDateConflict(hydrated: ExtractedFundAnnouncement[]): boolean {
    const dates = hydrated.map((item) => item.closeDate || item.announcedDate).filter((value): value is string => Boolean(value));
    if (dates.length < 2) return false;
    const min = dates.reduce((best, value) => value < best ? value : best, dates[0]);
    const max = dates.reduce((best, value) => value > best ? value : best, dates[0]);
    return Math.abs((new Date(max).getTime() - new Date(min).getTime()) / 86400000) > CAPITAL_EVENT_THRESHOLDS.conflictingDateToleranceDays;
  }

  private detectSizeConflict(hydrated: ExtractedFundAnnouncement[]): boolean {
    const sizes = hydrated.map((item) => item.finalSizeUsd ?? item.targetSizeUsd ?? item.fundSize).filter((value): value is number => typeof value === "number");
    if (sizes.length < 2) return false;
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    return Math.abs(max - min) / Math.max(max, 1) > CAPITAL_EVENT_THRESHOLDS.conflictingFundSizeTolerancePct;
  }

  private async loadSignalsForMirror(options: FundSyncRunOptions & { force?: boolean }) {
    let query = this.supabase
      .from("vc_fund_signals")
      .select([
        "id,signal_type,event_date,headline,summary,source_url,confidence,display_priority,metadata,dedupe_key,intelligence_event_id",
        ",firm_record_id,vc_fund_id,firm_records!inner(firm_name),vc_funds(name)",
      ].join(""))
      .order("event_date", { ascending: false })
      .limit(options.maxItems ?? 500);

    if (!options.force) query = query.is("intelligence_event_id", null);
    if (options.firmId) query = query.eq("firm_record_id", options.firmId);
    if (options.dateFrom) query = query.gte("event_date", options.dateFrom);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load signals for mirror: ${error.message}`);

    const fundIds = Array.from(new Set((data ?? []).map((row: any) => row.vc_fund_id).filter(Boolean)));
    const peopleByFund = new Map<string, { firm_investor_id: string | null; full_name: string | null }>();
    if (fundIds.length) {
      const { data: peopleRows } = await this.supabase
        .from("vc_fund_people")
        .select("vc_fund_id,firm_investor_id,firm_investors(full_name)")
        .in("vc_fund_id", fundIds)
        .order("confidence", { ascending: false });
      for (const row of peopleRows || []) {
        const investorName = Array.isArray(row.firm_investors)
          ? row.firm_investors[0]?.full_name || null
          : row.firm_investors?.full_name || null;
        if (!peopleByFund.has(row.vc_fund_id)) {
          peopleByFund.set(row.vc_fund_id, {
            firm_investor_id: row.firm_investor_id || null,
            full_name: investorName,
          });
        }
      }
    }

    return (data ?? []).map((row: any) => ({
      ...row,
      firm_name: row.firm_records?.firm_name || "Unknown firm",
      fund_name: row.vc_funds?.name || null,
      firm_investor_id: peopleByFund.get(row.vc_fund_id)?.firm_investor_id || null,
      firm_investor_name: peopleByFund.get(row.vc_fund_id)?.full_name || null,
    }));
  }

  private async ensureIntelligenceEntity(type: string, name: string, aliases: string[] = [], metadata: Record<string, unknown> = {}) {
    const { data: existing } = await this.supabase
      .from("intelligence_entities")
      .select("id")
      .eq("type", type)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data, error } = await this.supabase.from("intelligence_entities").insert({
      type,
      name,
      aliases,
      metadata,
    }).select("id").single();
    if (error) throw new Error(`Failed to ensure intelligence entity: ${error.message}`);
    return data.id as string;
  }

  private async refreshFirmDerivations(firmRecordId: string | null, windowDays: number): Promise<number> {
    const { data, error } = await this.supabase.rpc("refresh_firm_capital_derived_fields", {
      p_firm_record_id: firmRecordId,
      p_fresh_window_days: windowDays,
    });
    if (error) throw new Error(`Failed to refresh firm capital derivations: ${error.message}`);
    return Number(data || 0);
  }

  private async refreshInvestorRankingInputs(firmRecordId: string): Promise<void> {
    const { data: firm } = await this.supabase
      .from("firm_records")
      .select("fresh_capital_priority_score,last_capital_signal_at")
      .eq("id", firmRecordId)
      .maybeSingle();
    if (!firm) return;

    const baseBoost = Number(firm.fresh_capital_priority_score || 0);
    await this.supabase.from("firm_investors").update({
      capital_freshness_boost_score: roundConfidence(baseBoost * 0.8),
      last_capital_signal_at: firm.last_capital_signal_at,
    }).eq("firm_id", firmRecordId);

    const { data: linked } = await this.supabase.from("vc_fund_people").select("firm_investor_id").not("firm_investor_id", "is", null).in(
      "vc_fund_id",
      (await this.supabase.from("vc_funds").select("id").eq("firm_record_id", firmRecordId).is("deleted_at", null)).data?.map((row: any) => row.id) || [],
    );
    const linkedIds = (linked || []).map((row: any) => row.firm_investor_id).filter(Boolean);
    if (linkedIds.length) {
      await this.supabase.from("firm_investors").update({
        capital_freshness_boost_score: roundConfidence(baseBoost),
        last_capital_signal_at: firm.last_capital_signal_at,
      }).in("id", linkedIds);
    }
  }

  private async mirrorLegacyFundRecord(firm: FirmRecordLookup, fund: CanonicalFundDraft, fundId: string): Promise<void> {
    await this.supabase.from("fund_records").upsert({
      firm_id: firm.id,
      canonical_vc_fund_id: fundId,
      fund_name: fund.name,
      normalized_fund_name: fund.normalizedName,
      fund_number: fund.fundSequenceNumber,
      fund_type: fund.fundType || "venture",
      fund_status: fund.status === "final_close" ? "closed" : "active",
      strategy: fund.fundType,
      vintage_year: fund.vintageYear,
      open_date: fund.announcedDate,
      close_date: fund.closeDate,
      currency: fund.currency,
      size_usd: fund.finalSizeUsd ?? fund.targetSizeUsd,
      target_size_usd: fund.targetSizeUsd,
      final_close_size_usd: fund.finalSizeUsd,
      stage_focus: fund.stageFocus,
      sector_focus: fund.sectorFocus,
      geo_focus: fund.geographyFocus,
      avg_check_size_min: fund.estimatedCheckMinUsd,
      avg_check_size_max: fund.estimatedCheckMaxUsd,
      actively_deploying: fund.likelyActivelyDeploying,
      confidence: fund.sourceConfidence,
      source_url: fund.announcementUrl,
      verification_status: fund.verificationStatus,
      last_verified_at: fund.lastVerifiedAt,
      canonical_freshness_synced_at: fund.freshnessSyncedAt,
    }, { onConflict: "firm_id,normalized_fund_name" });
  }

  private async enqueueReview(entityType: string, payload: ExtractedFundAnnouncement, reason: string): Promise<void> {
    await this.supabase.from("enrichment_review_queue").insert({
      entity_type: entityType,
      entity_id: payload.externalId || payload.sourceUrl,
      reason,
      review_data: payload,
      status: "pending",
    });
  }
}

export function createFundSyncService(options: FundSyncServiceOptions): FundSyncService {
  return new FundSyncService(options);
}
