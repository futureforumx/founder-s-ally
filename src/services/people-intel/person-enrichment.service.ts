/**
 * person-enrichment.service.ts
 * ==============================
 * Orchestrates the full enrichment pipeline for a canonical person.
 *
 * Stages:
 *   1. start/resume enrichment run
 *   2. source discovery
 *   3. per-source: fetch → parse → persist snapshot
 *   4. merge normalized payloads
 *   5. upsert role history
 *   6. upsert activity signals
 *   7. call inference
 *   8. call relationship extraction
 *   9. call change detection
 *  10. call reputation scoring
 *  11. finalize run
 *
 * Idempotent: same run_key → reuses existing run (skips if completed recently).
 * Partial failures per source do not abort the run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger, RunOptions, NormalizedPersonProfile, RoleEntry, ActivitySignal } from "./types.ts";
import { discoverPersonSources } from "./source-discovery.service.ts";
import { parseGenericPersonSnapshot, normalizeRoleFunction, normalizeSeniority } from "./source-parser.service.ts";
import { inferPersonAttributes } from "./inference.service.ts";
import { extractPersonRelationships } from "./relationship-extraction.service.ts";
import { detectPersonChanges } from "./change-detection.service.ts";
import { scorePersonReputation } from "./reputation-scoring.service.ts";
import crypto from "node:crypto";

const FRESHNESS_HOURS = 24 * 7; // 7 days before re-enriching

export async function enrichPerson(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions & { logger?: Logger } = {},
): Promise<{ runId: string; status: string }> {
  const logger = opts.logger;
  const dryRun = opts.dryRun ?? false;

  const runKey = `person:${entityType}:${entityId}:${datestamp()}`;
  logger?.info("enrich_person.start", { entityType, entityId, runKey, dryRun });

  // ── 1. Idempotency check ────────────────────────────────────────────────────
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
        logger?.info("enrich_person.skip.fresh", { entityId, ageHours: Math.round(ageHours) });
        return { runId: existing.id, status: "skipped" };
      }
    }
  }

  // ── 2. Create run record ────────────────────────────────────────────────────
  let runId = "";
  if (!dryRun) {
    const { data: run, error: runErr } = await db
      .from("pig_enrichment_runs")
      .upsert(
        { run_key: runKey, entity_type: entityType, entity_id: entityId, trigger: opts.forceRefresh ? "manual" : "sweep", status: "running", started_at: new Date().toISOString() },
        { onConflict: "run_key" },
      )
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = run.id;
  } else {
    runId = `dry_${runKey}`;
  }

  const stepResults: Record<string, boolean> = {};

  // ── 3. Source discovery ─────────────────────────────────────────────────────
  const sources = await discoverPersonSources(db, entityType, entityId, logger);
  const targetSources = opts.sources ? sources.filter(s => opts.sources!.includes(s.provider)) : sources;

  // ── 4. Per-source fetch → parse → persist ──────────────────────────────────
  const allProfiles: Array<{ provider: string; profile: NormalizedPersonProfile; roles: RoleEntry[]; signals: ActivitySignal[] }> = [];

  for (const src of targetSources) {
    const stepKey = `fetch:${src.provider}`;
    await writeStep(db, runId, stepKey, src.provider, "running", dryRun);

    try {
      // In production this would call a real fetcher/scraper.
      // Here we check if a recent snapshot already exists and re-use it.
      const existing = await loadRecentSnapshot(db, entityType, entityId, src.provider, FRESHNESS_HOURS);
      const raw = existing?.normalized_payload ?? existing?.raw_payload ?? null;

      if (raw && typeof raw === "object") {
        const parsed = parseGenericPersonSnapshot(raw as Record<string, unknown>, src.provider);
        allProfiles.push({ provider: src.provider, ...parsed });
        await persistSnapshot(db, { entityType, entityId, provider: src.provider, sourceUrl: src.url, raw: raw as Record<string, unknown>, normalized: parsed.profile, status: "parsed" }, dryRun);
        await writeStep(db, runId, stepKey, src.provider, "succeeded", dryRun, { records_written: 1 });
        stepResults[stepKey] = true;
      } else {
        await writeStep(db, runId, stepKey, src.provider, "skipped", dryRun, { metadata: { reason: "no_snapshot_available" } });
        stepResults[stepKey] = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.warn("enrich_person.source_failed", { entityId, provider: src.provider, err: msg });
      await writeStep(db, runId, stepKey, src.provider, "failed", dryRun, { error_message: msg });
      stepResults[stepKey] = false;
    }
  }

  // ── 5. Merge + persist roles ────────────────────────────────────────────────
  const allRoles = allProfiles.flatMap(p => p.roles);
  if (allRoles.length > 0 && !dryRun) {
    await upsertPersonRoles(db, entityType, entityId, allRoles);
  }
  stepResults["upsert_roles"] = true;

  // ── 6. Persist activity signals ─────────────────────────────────────────────
  const allSignals = allProfiles.flatMap(p => p.signals);
  if (allSignals.length > 0 && !dryRun) {
    await upsertPersonSignals(db, entityType, entityId, allSignals);
  }
  stepResults["upsert_signals"] = true;

  // ── 7-10. Downstream services ───────────────────────────────────────────────
  const mergedProfile = mergeProfiles(allProfiles.map(p => p.profile));

  await runStep(db, runId, "inference",                 dryRun, stepResults, logger, () => inferPersonAttributes(db, entityType, entityId, mergedProfile, { dryRun }));
  await runStep(db, runId, "relationship_extraction",   dryRun, stepResults, logger, () => extractPersonRelationships(db, entityType, entityId, { dryRun }));
  await runStep(db, runId, "change_detection",          dryRun, stepResults, logger, () => detectPersonChanges(db, entityType, entityId, mergedProfile, { dryRun }));
  await runStep(db, runId, "reputation_scoring",        dryRun, stepResults, logger, () => scorePersonReputation(db, entityType, entityId, { dryRun }));

  // ── 11. Finalize run ────────────────────────────────────────────────────────
  const succeeded = Object.values(stepResults).filter(Boolean).length;
  const failed    = Object.values(stepResults).filter(v => !v).length;
  const status    = failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed";

  if (!dryRun) {
    await db.from("pig_enrichment_runs").update({
      status,
      finished_at:      new Date().toISOString(),
      steps_total:      Object.keys(stepResults).length,
      steps_succeeded:  succeeded,
      steps_failed:     failed,
      sources_attempted: targetSources.map(s => s.provider),
      sources_succeeded: targetSources.filter(s => stepResults[`fetch:${s.provider}`]).map(s => s.provider),
    }).eq("id", runId);
  }

  logger?.info("enrich_person.done", { entityId, runId, status, succeeded, failed });
  return { runId, status };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadRecentSnapshot(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  provider: string,
  freshnessHours: number,
): Promise<{ normalized_payload: unknown; raw_payload: unknown } | null> {
  const cutoff = new Date(Date.now() - freshnessHours * 3_600_000).toISOString();
  const { data } = await db
    .from("person_source_profiles")
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

async function persistSnapshot(
  db: SupabaseClient,
  args: { entityType: string; entityId: string; provider: string; sourceUrl: string; raw: Record<string, unknown>; normalized: NormalizedPersonProfile; status: string },
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const hash = crypto.createHash("sha256").update(JSON.stringify(args.raw)).digest("hex").slice(0, 16);
  await db.from("person_source_profiles").upsert(
    {
      entity_type:        args.entityType,
      entity_id:          args.entityId,
      provider:           args.provider,
      source_url:         args.sourceUrl,
      fetched_at:         new Date().toISOString(),
      content_hash:       hash,
      parse_status:       args.status,
      raw_payload:        args.raw,
      normalized_payload: args.normalized,
      provenance:         { provider: args.provider, fetched_at: new Date().toISOString() },
    },
    { onConflict: "entity_type,entity_id,provider,content_hash" },
  );
}

async function upsertPersonRoles(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  roles: RoleEntry[],
): Promise<void> {
  const rows = roles.map(r => ({
    person_entity_type:    entityType,
    person_entity_id:      entityId,
    org_entity_type:       "generic",
    org_entity_id:         slugify(r.company_name),
    title:                 r.title,
    normalized_role_function: r.normalized_role_function ?? normalizeRoleFunction(r.title),
    seniority_level:       r.seniority_level ?? normalizeSeniority(r.title),
    start_date:            r.start_date ?? null,
    end_date:              r.end_date ?? null,
    is_current:            r.is_current,
    confidence:            r.confidence,
    provenance:            { source_provider: r.source_provider },
    updated_at:            new Date().toISOString(),
  }));
  // Batch upsert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    await db.from("person_organization_roles").upsert(rows.slice(i, i + 50));
  }
}

async function upsertPersonSignals(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  signals: ActivitySignal[],
): Promise<void> {
  const rows = signals.map(s => ({
    entity_type:        entityType,
    entity_id:          entityId,
    signal_type:        s.signal_type,
    signal_subtype:     s.signal_subtype ?? null,
    signal_date:        s.signal_date?.toISOString() ?? null,
    source_provider:    s.source_provider,
    source_url:         s.source_url ?? null,
    extracted_text:     s.extracted_text ?? null,
    structured_payload: s.structured_payload ?? {},
    confidence:         s.confidence,
    provenance:         { source_provider: s.source_provider },
    created_at:         new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 50) {
    await db.from("person_activity_signals").insert(rows.slice(i, i + 50));
  }
}

function mergeProfiles(profiles: NormalizedPersonProfile[]): NormalizedPersonProfile {
  if (!profiles.length) return {};
  const merged: NormalizedPersonProfile = {};
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
  db: SupabaseClient,
  runId: string,
  stepName: string,
  dryRun: boolean,
  results: Record<string, boolean>,
  logger: Logger | undefined,
  fn: () => Promise<unknown>,
): Promise<void> {
  await writeStep(db, runId, stepName, undefined, "running", dryRun);
  try {
    await fn();
    await writeStep(db, runId, stepName, undefined, "succeeded", dryRun);
    results[stepName] = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.warn(`enrich_person.step_failed.${stepName}`, { err: msg });
    await writeStep(db, runId, stepName, undefined, "failed", dryRun, { error_message: msg });
    results[stepName] = false;
  }
}

async function writeStep(
  db: SupabaseClient,
  runId: string,
  stepName: string,
  provider: string | undefined,
  status: string,
  dryRun: boolean,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (dryRun) return;
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("pig_enrichment_run_steps")
    .select("id")
    .eq("run_id", runId)
    .eq("step_name", stepName)
    .maybeSingle();

  if (existing?.id) {
    await db.from("pig_enrichment_run_steps").update({ status, finished_at: now, ...extra, updated_at: now }).eq("id", existing.id);
  } else {
    await db.from("pig_enrichment_run_steps").insert({ run_id: runId, step_name: stepName, source_provider: provider ?? null, status, started_at: now, ...extra });
  }
}

function datestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
