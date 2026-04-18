/**
 * organization-enrichment.service.ts
 * ====================================
 * Same pipeline as person-enrichment but for canonical organizations.
 * Idempotent — safe to retry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger, RunOptions, NormalizedOrgProfile, ActivitySignal } from "./types.ts";
import { discoverOrganizationSources } from "./source-discovery.service.ts";
import { parseOrgSnapshot } from "./source-parser.service.ts";
import { inferOrganizationAttributes } from "./inference.service.ts";
import { extractOrganizationRelationships } from "./relationship-extraction.service.ts";
import { detectOrganizationChanges } from "./change-detection.service.ts";
import { scoreOrganizationReputation } from "./reputation-scoring.service.ts";
import crypto from "node:crypto";

const FRESHNESS_HOURS = 24 * 7;

export async function enrichOrganization(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions & { logger?: Logger } = {},
): Promise<{ runId: string; status: string }> {
  const logger = opts.logger;
  const dryRun = opts.dryRun ?? false;
  const runKey = `org:${entityType}:${entityId}:${datestamp()}`;

  // ── Idempotency ─────────────────────────────────────────────────────────────
  if (!opts.forceRefresh) {
    const { data: existing } = await db
      .from("pig_enrichment_runs")
      .select("id, status, started_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .in("status", ["completed", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const ageHours = (Date.now() - new Date(existing.started_at).getTime()) / 3_600_000;
      if (ageHours < FRESHNESS_HOURS) {
        logger?.info("enrich_org.skip.fresh", { entityId, ageHours: Math.round(ageHours) });
        return { runId: existing.id, status: "skipped" };
      }
    }
  }

  // ── Create run ──────────────────────────────────────────────────────────────
  let runId = "";
  if (!dryRun) {
    const { data: run, error } = await db
      .from("pig_enrichment_runs")
      .upsert(
        { run_key: runKey, entity_type: entityType, entity_id: entityId, trigger: "manual", status: "running", started_at: new Date().toISOString() },
        { onConflict: "run_key" },
      )
      .select("id")
      .single();
    if (error) throw error;
    runId = run.id;
  } else {
    runId = `dry_${runKey}`;
  }

  const stepResults: Record<string, boolean> = {};
  const sources = await discoverOrganizationSources(db, entityType, entityId, logger);
  const targetSources = opts.sources ? sources.filter(s => opts.sources!.includes(s.provider)) : sources;

  const allProfiles: Array<{ provider: string; profile: NormalizedOrgProfile; signals: ActivitySignal[] }> = [];

  for (const src of targetSources) {
    const stepKey = `fetch:${src.provider}`;
    await writeStep(db, runId, stepKey, src.provider, "running", dryRun);

    try {
      const existing = await loadRecentOrgSnapshot(db, entityType, entityId, src.provider, FRESHNESS_HOURS);
      const raw = existing?.normalized_payload ?? existing?.raw_payload ?? null;

      if (raw && typeof raw === "object") {
        const parsed = parseOrgSnapshot(raw as Record<string, unknown>, src.provider);
        allProfiles.push({ provider: src.provider, ...parsed });
        await persistOrgSnapshot(db, { entityType, entityId, provider: src.provider, sourceUrl: src.url, raw: raw as Record<string, unknown>, normalized: parsed.profile }, dryRun);
        await writeStep(db, runId, stepKey, src.provider, "succeeded", dryRun, { records_written: 1 });
        stepResults[stepKey] = true;
      } else {
        await writeStep(db, runId, stepKey, src.provider, "skipped", dryRun, { metadata: { reason: "no_snapshot_available" } });
        stepResults[stepKey] = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.warn("enrich_org.source_failed", { entityId, provider: src.provider, err: msg });
      await writeStep(db, runId, stepKey, src.provider, "failed", dryRun, { error_message: msg });
      stepResults[stepKey] = false;
    }
  }

  const allSignals = allProfiles.flatMap(p => p.signals);
  if (allSignals.length > 0 && !dryRun) {
    await upsertOrgSignals(db, entityType, entityId, allSignals);
  }

  const mergedProfile = mergeOrgProfiles(allProfiles.map(p => p.profile));

  await runStep(db, runId, "inference",               dryRun, stepResults, logger, () => inferOrganizationAttributes(db, entityType, entityId, mergedProfile, { dryRun }));
  await runStep(db, runId, "relationship_extraction", dryRun, stepResults, logger, () => extractOrganizationRelationships(db, entityType, entityId, { dryRun }));
  await runStep(db, runId, "change_detection",        dryRun, stepResults, logger, () => detectOrganizationChanges(db, entityType, entityId, mergedProfile, { dryRun }));
  await runStep(db, runId, "reputation_scoring",      dryRun, stepResults, logger, () => scoreOrganizationReputation(db, entityType, entityId, { dryRun }));

  const succeeded = Object.values(stepResults).filter(Boolean).length;
  const failed    = Object.values(stepResults).filter(v => !v).length;
  const status    = failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed";

  if (!dryRun) {
    await db.from("pig_enrichment_runs").update({
      status, finished_at: new Date().toISOString(),
      steps_total: Object.keys(stepResults).length,
      steps_succeeded: succeeded, steps_failed: failed,
      sources_attempted: targetSources.map(s => s.provider),
      sources_succeeded: targetSources.filter(s => stepResults[`fetch:${s.provider}`]).map(s => s.provider),
    }).eq("id", runId);
  }

  logger?.info("enrich_org.done", { entityId, runId, status });
  return { runId, status };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadRecentOrgSnapshot(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  provider: string,
  freshnessHours: number,
): Promise<{ normalized_payload: unknown; raw_payload: unknown } | null> {
  const cutoff = new Date(Date.now() - freshnessHours * 3_600_000).toISOString();
  const { data } = await db
    .from("organization_source_profiles")
    .select("normalized_payload, raw_payload")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("provider", provider)
    .eq("parse_status", "parsed")
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function persistOrgSnapshot(
  db: SupabaseClient,
  args: { entityType: string; entityId: string; provider: string; sourceUrl: string; raw: Record<string, unknown>; normalized: NormalizedOrgProfile },
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const hash = crypto.createHash("sha256").update(JSON.stringify(args.raw)).digest("hex").slice(0, 16);
  await db.from("organization_source_profiles").upsert(
    {
      entity_type: args.entityType, entity_id: args.entityId, provider: args.provider,
      source_url: args.sourceUrl, fetched_at: new Date().toISOString(), content_hash: hash,
      parse_status: "parsed", raw_payload: args.raw, normalized_payload: args.normalized,
      provenance: { provider: args.provider, fetched_at: new Date().toISOString() },
    },
    { onConflict: "entity_type,entity_id,provider,content_hash" },
  );
}

async function upsertOrgSignals(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  signals: ActivitySignal[],
): Promise<void> {
  const rows = signals.map(s => ({
    entity_type: entityType, entity_id: entityId,
    signal_type: s.signal_type, signal_subtype: s.signal_subtype ?? null,
    signal_date: s.signal_date?.toISOString() ?? null, source_provider: s.source_provider,
    source_url: s.source_url ?? null, extracted_text: s.extracted_text ?? null,
    structured_payload: s.structured_payload ?? {}, confidence: s.confidence,
    provenance: { source_provider: s.source_provider }, created_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 50) {
    await db.from("organization_activity_signals").insert(rows.slice(i, i + 50));
  }
}

function mergeOrgProfiles(profiles: NormalizedOrgProfile[]): NormalizedOrgProfile {
  const merged: NormalizedOrgProfile = {};
  for (const p of profiles) {
    for (const [k, v] of Object.entries(p)) {
      if (v != null && !(merged as Record<string, unknown>)[k]) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
  }
  return merged;
}

async function runStep(
  db: SupabaseClient, runId: string, stepName: string, dryRun: boolean,
  results: Record<string, boolean>, logger: Logger | undefined,
  fn: () => Promise<unknown>,
): Promise<void> {
  await writeStep(db, runId, stepName, undefined, "running", dryRun);
  try {
    await fn();
    await writeStep(db, runId, stepName, undefined, "succeeded", dryRun);
    results[stepName] = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.warn(`enrich_org.step_failed.${stepName}`, { err: msg });
    await writeStep(db, runId, stepName, undefined, "failed", dryRun, { error_message: msg });
    results[stepName] = false;
  }
}

async function writeStep(
  db: SupabaseClient, runId: string, stepName: string, provider: string | undefined,
  status: string, dryRun: boolean, extra: Record<string, unknown> = {},
): Promise<void> {
  if (dryRun) return;
  const now = new Date().toISOString();
  const { data: existing } = await db.from("pig_enrichment_run_steps").select("id").eq("run_id", runId).eq("step_name", stepName).maybeSingle();
  if (existing?.id) {
    await db.from("pig_enrichment_run_steps").update({ status, finished_at: now, ...extra, updated_at: now }).eq("id", existing.id);
  } else {
    await db.from("pig_enrichment_run_steps").insert({ run_id: runId, step_name: stepName, source_provider: provider ?? null, status, started_at: now, ...extra });
  }
}

function datestamp(): string {
  return new Date().toISOString().slice(0, 10);
}
