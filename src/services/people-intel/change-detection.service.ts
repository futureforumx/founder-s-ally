/**
 * change-detection.service.ts
 * ============================
 * Compares a new normalized payload against the last known state and writes
 * person_change_log / organization_change_log rows for any detected diffs.
 *
 * Watched fields can be configured per entity type.
 * Change detection is purely additive — only inserts new log rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPersonProfile, NormalizedOrgProfile, RunOptions } from "./types.ts";

// Fields we actively monitor for changes
const PERSON_WATCHED_FIELDS: Array<keyof NormalizedPersonProfile> = [
  "current_title",
  "current_company",
  "headline",
  "linkedin_url",
  "email",
  "location",
];

const ORG_WATCHED_FIELDS: Array<keyof NormalizedOrgProfile> = [
  "name",
  "website_url",
  "description",
  "hq_city",
  "hq_country",
  "linkedin_url",
];

// ─── Person change detection ──────────────────────────────────────────────────

export async function detectPersonChanges(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  newProfile: NormalizedPersonProfile,
  opts: RunOptions & { sourceProvider?: string; sourceProfileId?: string } = {},
): Promise<number> {
  const oldState = await loadLastPersonState(db, entityType, entityId);
  const changes: Array<Record<string, unknown>> = [];

  for (const field of PERSON_WATCHED_FIELDS) {
    const oldVal = oldState[field] ?? null;
    const newVal = newProfile[field] ?? null;
    if (!valuesDiffer(oldVal, newVal)) continue;

    changes.push({
      entity_type:       entityType,
      entity_id:         entityId,
      field_name:        field,
      old_value:         oldVal !== null ? JSON.parse(JSON.stringify({ v: oldVal })) : null,
      new_value:         newVal !== null ? JSON.parse(JSON.stringify({ v: newVal })) : null,
      detected_at:       new Date().toISOString(),
      source_provider:   opts.sourceProvider ?? null,
      source_profile_id: opts.sourceProfileId ?? null,
      diff_summary:      buildDiffSummary(field, oldVal, newVal),
      provenance:        { source: opts.sourceProvider ?? "enrichment", detected_at: new Date().toISOString() },
      created_at:        new Date().toISOString(),
    });
  }

  if (!changes.length || opts.dryRun) return changes.length;

  for (let i = 0; i < changes.length; i += 25) {
    await db.from("person_change_log").insert(changes.slice(i, i + 25));
  }

  return changes.length;
}

// ─── Organization change detection ───────────────────────────────────────────

export async function detectOrganizationChanges(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  newProfile: NormalizedOrgProfile,
  opts: RunOptions & { sourceProvider?: string; sourceProfileId?: string } = {},
): Promise<number> {
  const oldState = await loadLastOrgState(db, entityType, entityId);
  const changes: Array<Record<string, unknown>> = [];

  for (const field of ORG_WATCHED_FIELDS) {
    const oldVal = oldState[field] ?? null;
    const newVal = newProfile[field] ?? null;
    if (!valuesDiffer(oldVal, newVal)) continue;

    changes.push({
      entity_type:       entityType,
      entity_id:         entityId,
      field_name:        field,
      old_value:         oldVal !== null ? { v: oldVal } : null,
      new_value:         newVal !== null ? { v: newVal } : null,
      detected_at:       new Date().toISOString(),
      source_provider:   opts.sourceProvider ?? null,
      source_profile_id: opts.sourceProfileId ?? null,
      diff_summary:      buildDiffSummary(field, oldVal, newVal),
      provenance:        { source: opts.sourceProvider ?? "enrichment" },
      created_at:        new Date().toISOString(),
    });
  }

  if (!changes.length || opts.dryRun) return changes.length;

  for (let i = 0; i < changes.length; i += 25) {
    await db.from("organization_change_log").insert(changes.slice(i, i + 25));
  }

  return changes.length;
}

// ─── State loaders (last known normalized profile) ───────────────────────────

async function loadLastPersonState(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<Partial<NormalizedPersonProfile>> {
  const { data } = await db
    .from("person_source_profiles")
    .select("normalized_payload")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("parse_status", "parsed")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.normalized_payload ?? {}) as Partial<NormalizedPersonProfile>;
}

async function loadLastOrgState(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<Partial<NormalizedOrgProfile>> {
  const { data } = await db
    .from("organization_source_profiles")
    .select("normalized_payload")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("parse_status", "parsed")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.normalized_payload ?? {}) as Partial<NormalizedOrgProfile>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (a == null && b == null) return false;
  return JSON.stringify(a) !== JSON.stringify(b);
}

function buildDiffSummary(field: string, oldVal: unknown, newVal: unknown): string {
  if (oldVal == null) return `${field} set to "${newVal}"`;
  if (newVal == null) return `${field} cleared (was "${oldVal}")`;
  return `${field} changed from "${oldVal}" to "${newVal}"`;
}
