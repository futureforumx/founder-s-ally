/**
 * identity-resolution.service.ts
 * ================================
 * Deterministic then heuristic matching against canonical tables.
 * Never auto-merges at confidence < SAFE_MERGE_THRESHOLD.
 * Every attachment is audit-friendly (provider + confidence stored).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger, ProvenanceRecord } from "./types.ts";

const SAFE_MERGE_THRESHOLD = 0.85;

// ─── Input types ─────────────────────────────────────────────────────────────

export interface PersonLookupInput {
  full_name?:    string;
  linkedin_url?: string;
  email?:        string;
  x_url?:        string;
  entity_hint?:  string;  // optional type hint
}

export interface OrgLookupInput {
  name?:        string;
  website_url?: string;
  domain?:      string;
  linkedin_url?: string;
  entity_hint?: string;
}

export interface ResolvedEntity {
  entity_type: string;
  entity_id:   string;
  confidence:  number;
  match_method: "deterministic" | "heuristic" | "none";
  matched_on:  string[];
}

export interface AttachIdentityInput {
  entity_type:   string;
  entity_id:     string;
  provider:      string;
  external_id?:  string;
  external_url?: string;
  username?:     string;
  domain?:       string;
  confidence:    number;
  is_primary?:   boolean;
  metadata?:     Record<string, unknown>;
  provenance?:   ProvenanceRecord;
}

// ─── Canonical table definitions ─────────────────────────────────────────────
// Each entry: table name, entity_type label, key identity columns to match on

const PERSON_TABLES = [
  {
    table: "firm_investors",
    entity_type: "firm_investor",
    name_col: "full_name",
    linkedin_col: "linkedin_url",
    email_col: "email",
  },
  {
    table: "operator_profiles",
    entity_type: "operator_profile",
    name_col: "full_name",
    linkedin_col: "linkedin_url",
    email_col: "email",
  },
] as const;

const ORG_TABLES = [
  {
    table: "firm_records",
    entity_type: "firm_record",
    name_col: "firm_name",
    website_col: "website_url",
    linkedin_col: "linkedin_url",
  },
  {
    table: "organizations",
    entity_type: "organization",
    name_col: "name",
    website_col: "website_url",
    linkedin_col: "linkedin_url",
  },
] as const;

// ─── Person resolution ────────────────────────────────────────────────────────

export async function resolveCanonicalPerson(
  db: SupabaseClient,
  input: PersonLookupInput,
  logger?: Logger,
): Promise<ResolvedEntity | null> {

  for (const tbl of PERSON_TABLES) {
    if (input.entity_hint && input.entity_hint !== tbl.entity_type) continue;

    // 1. Deterministic: linkedin_url exact match
    if (input.linkedin_url) {
      const { data } = await db
        .from(tbl.table)
        .select("id")
        .eq(tbl.linkedin_col, input.linkedin_url)
        .limit(1)
        .single();
      if (data?.id) {
        return { entity_type: tbl.entity_type, entity_id: String(data.id), confidence: 1.0, match_method: "deterministic", matched_on: ["linkedin_url"] };
      }
    }

    // 2. Deterministic: email exact match
    if (input.email) {
      const { data } = await db
        .from(tbl.table)
        .select("id")
        .eq(tbl.email_col, input.email)
        .limit(1)
        .single();
      if (data?.id) {
        return { entity_type: tbl.entity_type, entity_id: String(data.id), confidence: 0.98, match_method: "deterministic", matched_on: ["email"] };
      }
    }

    // 3. Heuristic: normalized name similarity
    if (input.full_name) {
      const norm = normalizeName(input.full_name);
      const { data: rows } = await db
        .from(tbl.table)
        .select("id, " + tbl.name_col)
        .not(tbl.name_col, "is", null)
        .limit(20);

      if (rows?.length) {
        const best = rows
          .map(r => ({ id: r.id, score: scoreNameMatch(norm, normalizeName(r[tbl.name_col] ?? "")) }))
          .filter(r => r.score >= SAFE_MERGE_THRESHOLD)
          .sort((a, b) => b.score - a.score)[0];

        if (best) {
          logger?.debug("identity.person.heuristic_match", { entity_type: tbl.entity_type, entity_id: best.id, score: best.score });
          return { entity_type: tbl.entity_type, entity_id: String(best.id), confidence: best.score, match_method: "heuristic", matched_on: ["full_name"] };
        }
      }
    }
  }

  return null;
}

// ─── Organization resolution ──────────────────────────────────────────────────

export async function resolveCanonicalOrganization(
  db: SupabaseClient,
  input: OrgLookupInput,
  logger?: Logger,
): Promise<ResolvedEntity | null> {

  for (const tbl of ORG_TABLES) {
    if (input.entity_hint && input.entity_hint !== tbl.entity_type) continue;

    // 1. Deterministic: website domain
    if (input.website_url || input.domain) {
      const domain = input.domain ?? extractDomain(input.website_url ?? "");
      if (domain) {
        const { data: rows } = await db
          .from(tbl.table)
          .select("id, " + tbl.website_col)
          .not(tbl.website_col, "is", null)
          .limit(50);

        const match = rows?.find(r => extractDomain(r[tbl.website_col] ?? "") === domain);
        if (match) {
          return { entity_type: tbl.entity_type, entity_id: String(match.id), confidence: 0.99, match_method: "deterministic", matched_on: ["domain"] };
        }
      }
    }

    // 2. Deterministic: linkedin_url
    if (input.linkedin_url) {
      const { data } = await db
        .from(tbl.table)
        .select("id")
        .eq(tbl.linkedin_col, input.linkedin_url)
        .limit(1)
        .single();
      if (data?.id) {
        return { entity_type: tbl.entity_type, entity_id: String(data.id), confidence: 0.97, match_method: "deterministic", matched_on: ["linkedin_url"] };
      }
    }

    // 3. Heuristic: name
    if (input.name) {
      const norm = normalizeName(input.name);
      const { data: rows } = await db
        .from(tbl.table)
        .select("id, " + tbl.name_col)
        .not(tbl.name_col, "is", null)
        .limit(30);

      if (rows?.length) {
        const best = rows
          .map(r => ({ id: r.id, score: scoreNameMatch(norm, normalizeName(r[tbl.name_col] ?? "")) }))
          .filter(r => r.score >= SAFE_MERGE_THRESHOLD)
          .sort((a, b) => b.score - a.score)[0];

        if (best) {
          logger?.debug("identity.org.heuristic_match", { entity_type: tbl.entity_type, entity_id: best.id, score: best.score });
          return { entity_type: tbl.entity_type, entity_id: String(best.id), confidence: best.score, match_method: "heuristic", matched_on: ["name"] };
        }
      }
    }
  }

  return null;
}

// ─── Attach external identity ─────────────────────────────────────────────────

export async function attachPersonExternalIdentity(
  db: SupabaseClient,
  input: AttachIdentityInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<void> {
  const row = {
    entity_type: input.entity_type,
    entity_id:   input.entity_id,
    provider:    input.provider,
    external_id: input.external_id ?? null,
    external_url: input.external_url ?? null,
    username:    input.username ?? null,
    domain:      input.domain ?? null,
    confidence:  clamp(input.confidence),
    is_primary:  input.is_primary ?? false,
    last_seen_at: new Date().toISOString(),
    metadata:    input.metadata ?? {},
    updated_at:  new Date().toISOString(),
  };

  if (opts.dryRun) {
    opts.logger?.debug("identity.attach.dry", row);
    return;
  }

  const { error } = await db
    .from("person_external_identities")
    .upsert(row, { onConflict: "entity_type,entity_id,provider" });

  if (error) throw error;
  opts.logger?.debug("identity.attach.ok", { entity_id: input.entity_id, provider: input.provider });
}

export async function attachOrgExternalIdentity(
  db: SupabaseClient,
  input: AttachIdentityInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<void> {
  const row = {
    entity_type: input.entity_type,
    entity_id:   input.entity_id,
    provider:    input.provider,
    external_id: input.external_id ?? null,
    external_url: input.external_url ?? null,
    username:    input.username ?? null,
    domain:      input.domain ?? null,
    confidence:  clamp(input.confidence),
    is_primary:  input.is_primary ?? false,
    last_seen_at: new Date().toISOString(),
    metadata:    input.metadata ?? {},
    updated_at:  new Date().toISOString(),
  };

  if (opts.dryRun) {
    opts.logger?.debug("identity.attach_org.dry", row);
    return;
  }

  const { error } = await db
    .from("organization_external_identities")
    .upsert(row, { onConflict: "entity_type,entity_id,provider" });

  if (error) throw error;
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

export function scorePersonMatch(
  candidate: { full_name?: string; linkedin_url?: string; email?: string },
  input: PersonLookupInput,
): number {
  let score = 0;
  if (input.linkedin_url && candidate.linkedin_url === input.linkedin_url) return 1.0;
  if (input.email && candidate.email === input.email) return 0.98;
  if (input.full_name && candidate.full_name) {
    score = Math.max(score, scoreNameMatch(normalizeName(input.full_name), normalizeName(candidate.full_name)));
  }
  return score;
}

export function scoreOrganizationMatch(
  candidate: { name?: string; website_url?: string; linkedin_url?: string },
  input: OrgLookupInput,
): number {
  if (input.website_url && extractDomain(input.website_url) && extractDomain(candidate.website_url ?? "") === extractDomain(input.website_url)) return 0.99;
  if (input.linkedin_url && candidate.linkedin_url === input.linkedin_url) return 0.97;
  if (input.name && candidate.name) {
    return scoreNameMatch(normalizeName(input.name), normalizeName(candidate.name));
  }
  return 0;
}

// ─── Internals ────────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function scoreNameMatch(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  // Token overlap
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const intersection = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
