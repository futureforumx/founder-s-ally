import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  resolveFirmWebsiteLocationBundle,
  normalizeWebsiteHost,
  buildMergedLocationsForPersist,
  parseAddressLineToStructured,
} from "./_firmWebsiteHq.js";
import { augmentFirmRecordsPatchWithSupabase } from "../scripts/lib/firmRecordsCanonicalHqPolicy.ts";

function safeTrim(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type FirmWebsiteHqPostResult = {
  hqLine: string | null;
  offices: string[];
  hqPickReason: string | null;
  persisted: boolean;
  persistSkipped?: string;
};

export async function handleFirmWebsiteHqPost(body: Record<string, unknown>): Promise<FirmWebsiteHqPostResult> {
  const firmWebsiteUrl = typeof body.firmWebsiteUrl === "string" ? body.firmWebsiteUrl.trim() : "";
  const firmRecordIdRaw = typeof body.firmRecordId === "string" ? body.firmRecordId.trim() : "";

  if (!firmWebsiteUrl) {
    return {
      hqLine: null,
      offices: [],
      hqPickReason: null,
      persisted: false,
      persistSkipped: "missing_firmWebsiteUrl",
    };
  }

  const bundle = await resolveFirmWebsiteLocationBundle(firmWebsiteUrl);
  if (!bundle) {
    return { hqLine: null, offices: [], hqPickReason: null, persisted: false };
  }

  const hqLine = bundle.hqLine;
  const offices = bundle.officeLines;
  const hqPickReason = bundle.hqPickReason;

  if (!firmRecordIdRaw || !isUuid(firmRecordIdRaw)) {
    return { hqLine, offices, hqPickReason, persisted: false };
  }

  const admin = supabaseAdmin();
  if (!admin) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: "no_supabase_service_role",
    };
  }

  const { data: row, error } = await admin
    .from("firm_records")
    .select("website_url, canonical_hq_locked, hq_city, hq_state, hq_country, address, locations")
    .eq("id", firmRecordIdRaw)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !row) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: "firm_record_not_found",
    };
  }

  if (row.canonical_hq_locked) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: "canonical_hq_locked",
    };
  }

  const scrapeHost = normalizeWebsiteHost(firmWebsiteUrl);
  const dbWebsite = safeTrim(typeof row.website_url === "string" ? row.website_url : "");
  const dbHost = normalizeWebsiteHost(dbWebsite);

  /** Allow persist when DB has no website yet, or hosts match / subdomain relationship. */
  const hostsCompatible =
    Boolean(scrapeHost) &&
    (!dbWebsite ||
      (Boolean(dbHost) &&
        (scrapeHost === dbHost ||
          scrapeHost.endsWith(`.${dbHost}`) ||
          dbHost.endsWith(`.${scrapeHost}`))));

  if (!hostsCompatible) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: dbWebsite ? "website_hostname_mismatch" : "firm_record_missing_website_url",
    };
  }

  const merged = buildMergedLocationsForPersist(row.locations, firmWebsiteUrl, bundle);

  const patch: Record<string, unknown> = {
    locations: merged,
    canonical_hq_source: "firm_website_hq",
  };

  if (!dbWebsite && firmWebsiteUrl) {
    patch.website_url = firmWebsiteUrl.trim();
  }

  const emptyStructuredHq =
    !safeTrim(row.hq_city) && !safeTrim(row.hq_state) && !safeTrim(row.hq_country);

  const hqSourceLine = safeTrim(merged.hq_line) || safeTrim(hqLine);
  if (emptyStructuredHq && hqSourceLine) {
    const parsed = parseAddressLineToStructured(hqSourceLine);
    if (parsed) {
      patch.hq_city = parsed.hq_city;
      patch.hq_state = parsed.hq_state;
      patch.hq_country = parsed.hq_country;
      if (!safeTrim(row.address) && hqSourceLine) {
        patch.address = hqSourceLine;
      }
    }
  }

  const finalPatch = await augmentFirmRecordsPatchWithSupabase(admin, firmRecordIdRaw, patch, "firm_website_hq");

  if (Object.keys(finalPatch).length === 0) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: "patch_empty_after_policy",
    };
  }

  const { error: upErr } = await admin.from("firm_records").update(finalPatch).eq("id", firmRecordIdRaw);
  if (upErr) {
    return {
      hqLine,
      offices,
      hqPickReason,
      persisted: false,
      persistSkipped: `update_failed:${upErr.message}`,
    };
  }

  return { hqLine, offices, hqPickReason, persisted: true };
}
