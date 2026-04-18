// =============================================================================
// resolveIdentity.ts
// =============================================================================
// Resolves and creates canonical people / organization records.
//
// people and organizations are Prisma-managed tables — columns are camelCase.
// identity_links.person_id is TEXT (UUID stored as string).
//
// All public functions use the insert-first / 23505-catch idempotency pattern.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { PersonRecord, OrganizationRecord } from "./connector-types.ts";

// ---------------------------------------------------------------------------
// ensurePersonByEmail
// ---------------------------------------------------------------------------

/**
 * Returns the people row for a given email, creating one if it does not exist.
 * Email is normalised to lowercase before lookup / insert.
 */
export async function ensurePersonByEmail(
  supabase: SupabaseClient,
  email: string,
  displayName?: string | null,
): Promise<PersonRecord> {
  const normalised = email.trim().toLowerCase();
  const dedupeKey  = `email:${normalised}`;
  const canonical  = displayName?.trim() || normalised;

  // Try insert first
  const { data: inserted, error: insertErr } = await supabase
    .from("people")
    .insert({ email: normalised, canonicalName: canonical, dedupeKey })
    .select()
    .single();

  if (!insertErr) return inserted as PersonRecord;

  if ((insertErr as { code?: string }).code !== "23505") {
    throw new Error(`ensurePersonByEmail insert failed: ${insertErr.message}`);
  }

  // Already exists — fetch by email
  const { data: existing, error: fetchErr } = await supabase
    .from("people")
    .select()
    .eq("email", normalised)
    .single();

  if (fetchErr || !existing) {
    throw new Error(
      `ensurePersonByEmail fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`,
    );
  }
  return existing as PersonRecord;
}

// ---------------------------------------------------------------------------
// resolvePersonByEmail
// ---------------------------------------------------------------------------

/**
 * Looks up a people row by email without creating one.
 * Returns null if not found.
 */
export async function resolvePersonByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<PersonRecord | null> {
  const normalised = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("people")
    .select()
    .eq("email", normalised)
    .maybeSingle();

  if (error) throw new Error(`resolvePersonByEmail failed: ${error.message}`);
  return (data ?? null) as PersonRecord | null;
}

// ---------------------------------------------------------------------------
// resolvePersonByLinkedIn
// ---------------------------------------------------------------------------

/**
 * Looks up a people row by LinkedIn URL without creating one.
 * Returns null if not found.
 */
export async function resolvePersonByLinkedIn(
  supabase: SupabaseClient,
  linkedinUrl: string,
): Promise<PersonRecord | null> {
  const { data, error } = await supabase
    .from("people")
    .select()
    .eq("linkedinUrl", linkedinUrl.trim())
    .maybeSingle();

  if (error) throw new Error(`resolvePersonByLinkedIn failed: ${error.message}`);
  return (data ?? null) as PersonRecord | null;
}

// ---------------------------------------------------------------------------
// ensureOrganizationByDomain
// ---------------------------------------------------------------------------

/**
 * Returns the organizations row for a given domain, creating one if needed.
 * Domain is lowercased and leading www. is stripped.
 */
export async function ensureOrganizationByDomain(
  supabase: SupabaseClient,
  domain: string,
  name?: string | null,
): Promise<OrganizationRecord> {
  const normDomain  = normaliseDomain(domain);
  const dedupeKey   = `domain:${normDomain}`;
  const canonical   = name?.trim() || normDomain;

  const { data: inserted, error: insertErr } = await supabase
    .from("organizations")
    .insert({ domain: normDomain, canonicalName: canonical, dedupeKey })
    .select()
    .single();

  if (!insertErr) return inserted as OrganizationRecord;

  if ((insertErr as { code?: string }).code !== "23505") {
    throw new Error(`ensureOrganizationByDomain insert failed: ${insertErr.message}`);
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("organizations")
    .select()
    .eq("domain", normDomain)
    .single();

  if (fetchErr || !existing) {
    throw new Error(
      `ensureOrganizationByDomain fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`,
    );
  }
  return existing as OrganizationRecord;
}

// ---------------------------------------------------------------------------
// resolveOrganizationByDomain
// ---------------------------------------------------------------------------

/**
 * Looks up an organizations row by domain without creating one.
 * Returns null if not found.
 */
export async function resolveOrganizationByDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<OrganizationRecord | null> {
  const normDomain = normaliseDomain(domain);

  const { data, error } = await supabase
    .from("organizations")
    .select()
    .eq("domain", normDomain)
    .maybeSingle();

  if (error) throw new Error(`resolveOrganizationByDomain failed: ${error.message}`);
  return (data ?? null) as OrganizationRecord | null;
}

// ---------------------------------------------------------------------------
// resolveSelfPerson
// ---------------------------------------------------------------------------

/**
 * Returns the canonical people row linked to the given owner_context_id via
 * identity_links.  Returns null if no link exists yet.
 *
 * identity_links.person_id is TEXT (UUID stored as string).
 * identity_links.owner_context_id is UUID.
 */
export async function resolveSelfPerson(
  supabase: SupabaseClient,
  ownerContextId: string,
): Promise<PersonRecord | null> {
  // Fetch identity link with highest confidence for this context
  const { data: link, error: linkErr } = await supabase
    .from("identity_links")
    .select("person_id")
    .eq("owner_context_id", ownerContextId)
    .order("confidence", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkErr) throw new Error(`resolveSelfPerson identity_links query failed: ${linkErr.message}`);
  if (!link) return null;

  const personId: string = (link as { person_id: string }).person_id;

  const { data: person, error: personErr } = await supabase
    .from("people")
    .select()
    .eq("id", personId)
    .maybeSingle();

  if (personErr) throw new Error(`resolveSelfPerson people lookup failed: ${personErr.message}`);
  return (person ?? null) as PersonRecord | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lowercase and strip leading www. from a domain string. */
function normaliseDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}
