/**
 * Canonical HQ write policy for `firm_records` (used by batch / sync scripts).
 * - Respects `canonical_hq_locked` (must align with DB trigger).
 * - Sets `canonical_hq_source` + `canonical_hq_set_at` when writing HQ.
 * - Keeps legacy `location` derived from structured hq_* (no standalone location writes from jobs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCanonicalHqLine } from "../../src/lib/formatCanonicalHqLine";

export const FIRM_RECORD_HQ_WRITE_KEYS = [
  "hq_city",
  "hq_state",
  "hq_country",
  "hq_zip_code",
  "hq_region",
  "address",
  "location",
  "locations",
] as const;

export type FirmRecordHqWriteKey = (typeof FIRM_RECORD_HQ_WRITE_KEYS)[number];

function patchTouchesHq(patch: Record<string, unknown>): boolean {
  return FIRM_RECORD_HQ_WRITE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(patch, k));
}

/** Remove HQ-related keys from a REST patch (used when row is locked). */
export function stripFirmRecordHqKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...patch };
  for (const k of FIRM_RECORD_HQ_WRITE_KEYS) delete (out as any)[k];
  delete (out as any).canonical_hq_source;
  delete (out as any).canonical_hq_set_at;
  return out;
}

type HqRow = {
  canonical_hq_locked: boolean | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
};

async function loadHqGateRow(
  supabase: SupabaseClient,
  firmId: string,
): Promise<HqRow | null> {
  const { data, error } = await supabase
    .from("firm_records")
    .select("canonical_hq_locked, hq_city, hq_state, hq_country")
    .eq("id", firmId)
    .maybeSingle();
  if (error || !data) return null;
  return data as HqRow;
}

/** Supabase-js client path (sync-prisma, signal scrapers, enrich-firm-records). */
export async function augmentFirmRecordsPatchWithSupabase(
  supabase: SupabaseClient,
  firmId: string,
  patch: Record<string, unknown>,
  source: string,
): Promise<Record<string, unknown>> {
  if (!patchTouchesHq(patch)) return patch;

  const row = await loadHqGateRow(supabase, firmId);
  if (!row) return patch;

  if (row.canonical_hq_locked) {
    return stripFirmRecordHqKeys(patch) as Record<string, unknown>;
  }

  const out: Record<string, unknown> = { ...patch };

  const hqTouched =
    Object.prototype.hasOwnProperty.call(out, "hq_city") ||
    Object.prototype.hasOwnProperty.call(out, "hq_state") ||
    Object.prototype.hasOwnProperty.call(out, "hq_country") ||
    Object.prototype.hasOwnProperty.call(out, "hq_zip_code") ||
    Object.prototype.hasOwnProperty.call(out, "hq_region") ||
    Object.prototype.hasOwnProperty.call(out, "address") ||
    Object.prototype.hasOwnProperty.call(out, "locations");

  if (
    Object.prototype.hasOwnProperty.call(out, "location") &&
    !hqTouched &&
    !Object.prototype.hasOwnProperty.call(out, "hq_city") &&
    !Object.prototype.hasOwnProperty.call(out, "hq_state") &&
    !Object.prototype.hasOwnProperty.call(out, "hq_country")
  ) {
    delete out.location;
  }

  const mergedCity = Object.prototype.hasOwnProperty.call(out, "hq_city") ? out.hq_city : row.hq_city;
  const mergedState = Object.prototype.hasOwnProperty.call(out, "hq_state") ? out.hq_state : row.hq_state;
  const mergedCountry = Object.prototype.hasOwnProperty.call(out, "hq_country")
    ? out.hq_country
    : row.hq_country;

  const line = formatCanonicalHqLine(
    mergedCity as string | null,
    mergedState as string | null,
    mergedCountry as string | null,
  );
  if (line && hqTouched) {
    out.location = line;
  }

  if (hqTouched || Object.prototype.hasOwnProperty.call(out, "location")) {
    out.canonical_hq_source = (out.canonical_hq_source as string | undefined) ?? source;
    out.canonical_hq_set_at = (out.canonical_hq_set_at as string | undefined) ?? new Date().toISOString();
  }

  return out;
}

/** PostgREST fetch path (enrich-all, backfill-from-csv). */
export async function augmentFirmRecordsPatchWithFetch(
  baseUrl: string,
  headers: Record<string, string>,
  firmId: string,
  patch: Record<string, unknown>,
  source: string,
): Promise<Record<string, unknown>> {
  if (!patchTouchesHq(patch)) return patch;

  const sel = "canonical_hq_locked,hq_city,hq_state,hq_country";
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/firm_records?id=eq.${firmId}&select=${sel}`, {
    headers,
  });
  if (!r.ok) return patch;
  const rows = (await r.json()) as HqRow[];
  const row = rows[0];
  if (!row) return patch;

  if (row.canonical_hq_locked) {
    return stripFirmRecordHqKeys(patch) as Record<string, unknown>;
  }

  const out: Record<string, unknown> = { ...patch };

  const hqTouched =
    Object.prototype.hasOwnProperty.call(out, "hq_city") ||
    Object.prototype.hasOwnProperty.call(out, "hq_state") ||
    Object.prototype.hasOwnProperty.call(out, "hq_country") ||
    Object.prototype.hasOwnProperty.call(out, "hq_zip_code") ||
    Object.prototype.hasOwnProperty.call(out, "hq_region") ||
    Object.prototype.hasOwnProperty.call(out, "address") ||
    Object.prototype.hasOwnProperty.call(out, "locations");

  if (
    Object.prototype.hasOwnProperty.call(out, "location") &&
    !hqTouched &&
    !Object.prototype.hasOwnProperty.call(out, "hq_city") &&
    !Object.prototype.hasOwnProperty.call(out, "hq_state") &&
    !Object.prototype.hasOwnProperty.call(out, "hq_country")
  ) {
    delete out.location;
  }

  const mergedCity = Object.prototype.hasOwnProperty.call(out, "hq_city") ? out.hq_city : row.hq_city;
  const mergedState = Object.prototype.hasOwnProperty.call(out, "hq_state") ? out.hq_state : row.hq_state;
  const mergedCountry = Object.prototype.hasOwnProperty.call(out, "hq_country")
    ? out.hq_country
    : row.hq_country;

  const line = formatCanonicalHqLine(
    mergedCity as string | null,
    mergedState as string | null,
    mergedCountry as string | null,
  );
  if (line && hqTouched) {
    out.location = line;
  }

  if (hqTouched || Object.prototype.hasOwnProperty.call(out, "location")) {
    out.canonical_hq_source = (out.canonical_hq_source as string | undefined) ?? source;
    out.canonical_hq_set_at = (out.canonical_hq_set_at as string | undefined) ?? new Date().toISOString();
  }

  return out;
}
