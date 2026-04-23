import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCanonicalHqLine } from "../src/lib/formatCanonicalHqLine.js";

const FIRM_RECORD_HQ_WRITE_KEYS = [
  "hq_city",
  "hq_state",
  "hq_country",
  "hq_zip_code",
  "hq_region",
  "address",
  "location",
  "locations",
] as const;

type HqRow = {
  canonical_hq_locked: boolean | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
};

function patchTouchesHq(patch: Record<string, unknown>): boolean {
  return FIRM_RECORD_HQ_WRITE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(patch, k));
}

function stripFirmRecordHqKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...patch };
  for (const k of FIRM_RECORD_HQ_WRITE_KEYS) delete (out as any)[k];
  delete (out as any).canonical_hq_source;
  delete (out as any).canonical_hq_set_at;
  return out;
}

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

export async function augmentFirmRecordsPatchWithSupabase(
  supabase: SupabaseClient,
  firmId: string,
  patch: Record<string, unknown>,
  source: string,
): Promise<Record<string, unknown>> {
  if (!patchTouchesHq(patch)) return patch;

  const row = await loadHqGateRow(supabase, firmId);
  if (!row) return patch;
  if (row.canonical_hq_locked) return stripFirmRecordHqKeys(patch);

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
  if (line && hqTouched) out.location = line;

  if (hqTouched || Object.prototype.hasOwnProperty.call(out, "location")) {
    out.canonical_hq_source = (out.canonical_hq_source as string | undefined) ?? source;
    out.canonical_hq_set_at = (out.canonical_hq_set_at as string | undefined) ?? new Date().toISOString();
  }

  return out;
}
