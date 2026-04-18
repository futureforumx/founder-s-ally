/**
 * source-discovery.service.ts
 * ============================
 * Given a canonical entity ref, return ranked candidate source URLs.
 * Priority follows the merge rules spec: official website first, aggregators last.
 * Discovery is purely additive — it reads existing identities but writes nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "./types.ts";
import { PROVIDER_PRIORITY, type Provider } from "./types.ts";

export interface SourceCandidate {
  provider:    Provider;
  url:         string;
  confidence:  number;
  origin:      "known_identity" | "canonical_field" | "constructed";
}

// ─── Person source discovery ──────────────────────────────────────────────────

export async function discoverPersonSources(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  logger?: Logger,
): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];

  // 1. Known external identities (already verified, highest trust)
  const { data: identities } = await db
    .from("person_external_identities")
    .select("provider, external_url, confidence")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .not("external_url", "is", null);

  for (const id of identities ?? []) {
    if (id.external_url) {
      candidates.push({
        provider:   id.provider as Provider,
        url:        id.external_url,
        confidence: id.confidence ?? 0.9,
        origin:     "known_identity",
      });
    }
  }

  // 2. Pull canonical fields from the underlying table
  const canonicalUrls = await fetchCanonicalPersonUrls(db, entityType, entityId);
  for (const [provider, url] of Object.entries(canonicalUrls)) {
    if (url && !candidates.some(c => c.url === url)) {
      candidates.push({
        provider:   provider as Provider,
        url,
        confidence: 0.8,
        origin:     "canonical_field",
      });
    }
  }

  // De-dupe by URL, then sort by provider priority desc, then confidence desc
  const seen = new Set<string>();
  const deduped = candidates.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  deduped.sort((a, b) => {
    const pa = PROVIDER_PRIORITY[a.provider] ?? 0;
    const pb = PROVIDER_PRIORITY[b.provider] ?? 0;
    return pb - pa || b.confidence - a.confidence;
  });

  logger?.debug("source_discovery.person", { entityType, entityId, count: deduped.length });
  return deduped;
}

// ─── Organization source discovery ───────────────────────────────────────────

export async function discoverOrganizationSources(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  logger?: Logger,
): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];

  const { data: identities } = await db
    .from("organization_external_identities")
    .select("provider, external_url, confidence")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .not("external_url", "is", null);

  for (const id of identities ?? []) {
    if (id.external_url) {
      candidates.push({
        provider:   id.provider as Provider,
        url:        id.external_url,
        confidence: id.confidence ?? 0.9,
        origin:     "known_identity",
      });
    }
  }

  const canonicalUrls = await fetchCanonicalOrgUrls(db, entityType, entityId);
  for (const [provider, url] of Object.entries(canonicalUrls)) {
    if (url && !candidates.some(c => c.url === url)) {
      candidates.push({
        provider:   provider as Provider,
        url,
        confidence: 0.8,
        origin:     "canonical_field",
      });
    }
  }

  const seen = new Set<string>();
  const deduped = candidates.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  deduped.sort((a, b) => {
    const pa = PROVIDER_PRIORITY[a.provider] ?? 0;
    const pb = PROVIDER_PRIORITY[b.provider] ?? 0;
    return pb - pa || b.confidence - a.confidence;
  });

  logger?.debug("source_discovery.org", { entityType, entityId, count: deduped.length });
  return deduped;
}

// ─── Canonical field readers ──────────────────────────────────────────────────

async function fetchCanonicalPersonUrls(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<Partial<Record<Provider, string>>> {
  const urls: Partial<Record<Provider, string>> = {};

  if (entityType === "firm_investor") {
    const { data } = await db
      .from("firm_investors")
      .select("linkedin_url, x_url, personal_website, firm_bio_page_url")
      .eq("id", entityId)
      .single();
    if (data) {
      if (data.linkedin_url)    urls["linkedin"]          = data.linkedin_url;
      if (data.x_url)           urls["x"]                 = data.x_url;
      if (data.personal_website) urls["website_personal"] = data.personal_website;
      if (data.firm_bio_page_url) urls["website_team_page"] = data.firm_bio_page_url;
    }
  }

  if (entityType === "operator_profile") {
    const { data } = await db
      .from("operator_profiles")
      .select("linkedin_url, x_url, personal_website")
      .eq("id", entityId)
      .single();
    if (data) {
      if (data.linkedin_url)     urls["linkedin"]         = data.linkedin_url;
      if (data.x_url)            urls["x"]                = data.x_url;
      if (data.personal_website) urls["website_personal"] = data.personal_website;
    }
  }

  if (entityType === "startup_founder") {
    const { data } = await db
      .from("startup_founders")
      .select("linkedin_url")
      .eq("id", entityId)
      .single();
    if (data?.linkedin_url) urls["linkedin"] = data.linkedin_url;
  }

  return urls;
}

async function fetchCanonicalOrgUrls(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<Partial<Record<Provider, string>>> {
  const urls: Partial<Record<Provider, string>> = {};

  if (entityType === "firm_record") {
    const { data } = await db
      .from("firm_records")
      .select("website_url, linkedin_url, x_url, crunchbase_url, angellist_url, signal_nfx_url, pitchbook_url, tracxn_url")
      .eq("id", entityId)
      .single();
    if (data) {
      if (data.website_url)    urls["website_official"] = data.website_url;
      if (data.linkedin_url)   urls["linkedin"]         = data.linkedin_url;
      if (data.x_url)          urls["x"]                = data.x_url;
      if (data.crunchbase_url) urls["crunchbase"]       = data.crunchbase_url;
      if (data.angellist_url)  urls["angellist"]        = data.angellist_url;
      if (data.signal_nfx_url) urls["signal_nfx"]      = data.signal_nfx_url;
      if (data.pitchbook_url)  urls["pitchbook"]        = data.pitchbook_url;
      if (data.tracxn_url)     urls["tracxn"]           = data.tracxn_url;
    }
  }

  if (entityType === "organization") {
    const { data } = await db
      .from("organizations")
      .select("website_url, linkedin_url")
      .eq("id", entityId)
      .single();
    if (data) {
      if (data.website_url)  urls["website_official"] = data.website_url;
      if (data.linkedin_url) urls["linkedin"]         = data.linkedin_url;
    }
  }

  return urls;
}
