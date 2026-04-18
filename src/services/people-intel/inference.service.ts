/**
 * inference.service.ts
 * =====================
 * Rule-based inference of person and organization attributes.
 * All outputs include explanation_summary + confidence + model_version.
 * No LLM — purely deterministic from structured inputs.
 * Stored as UPSERT so re-running is idempotent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPersonProfile, NormalizedOrgProfile, RunOptions } from "./types.ts";
import { normalizeRoleFunction, normalizeSeniority } from "./source-parser.service.ts";

const MODEL_VERSION = "rules-v1";

// ─── Person attributes ────────────────────────────────────────────────────────

export async function inferPersonAttributes(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  profile: NormalizedPersonProfile,
  opts: RunOptions = {},
): Promise<void> {
  const attrs: Array<{
    attribute_key: string;
    attribute_value: unknown;
    confidence: number;
    explanation_summary: string;
    supporting_source_ids: unknown[];
  }> = [];

  // ── seniority_level ─────────────────────────────────────────────────────────
  const seniorityFromTitle = profile.current_title ? normalizeSeniority(profile.current_title) : undefined;
  if (seniorityFromTitle) {
    attrs.push({
      attribute_key:       "seniority_level",
      attribute_value:     { level: seniorityFromTitle },
      confidence:          0.8,
      explanation_summary: `Inferred from title: "${profile.current_title}"`,
      supporting_source_ids: [],
    });
  }

  // ── role_function ───────────────────────────────────────────────────────────
  const funcFromTitle = profile.current_title ? normalizeRoleFunction(profile.current_title) : undefined;
  if (funcFromTitle) {
    attrs.push({
      attribute_key:       "role_function",
      attribute_value:     { function: funcFromTitle },
      confidence:          0.75,
      explanation_summary: `Inferred from title: "${profile.current_title}"`,
      supporting_source_ids: [],
    });
  }

  // ── domain_expertise ────────────────────────────────────────────────────────
  const topics = [...(profile.skills ?? []), ...(profile.topics ?? [])];
  if (topics.length > 0) {
    const normalized = topics.map(t => t.toLowerCase().trim()).filter(Boolean);
    attrs.push({
      attribute_key:       "domain_expertise",
      attribute_value:     { topics: [...new Set(normalized)].slice(0, 20) },
      confidence:          0.7,
      explanation_summary: `Extracted ${normalized.length} topics from profile skills/interests`,
      supporting_source_ids: [],
    });
  }

  // ── profile_completeness ────────────────────────────────────────────────────
  const COMPLETENESS_FIELDS: Array<keyof NormalizedPersonProfile> = [
    "full_name", "headline", "bio", "photo_url", "email",
    "linkedin_url", "current_title", "current_company",
  ];
  const filled = COMPLETENESS_FIELDS.filter(f => !!profile[f]).length;
  const completeness = filled / COMPLETENESS_FIELDS.length;
  attrs.push({
    attribute_key:       "profile_completeness",
    attribute_value:     { score: Math.round(completeness * 100) / 100, filled, total: COMPLETENESS_FIELDS.length },
    confidence:          1.0,
    explanation_summary: `${filled}/${COMPLETENESS_FIELDS.length} key profile fields present`,
    supporting_source_ids: [],
  });

  // ── career_velocity (proxy: # role changes in last 5 years) ─────────────────
  const { data: roles } = await db
    .from("person_organization_roles")
    .select("start_date, end_date, is_current")
    .eq("person_entity_type", entityType)
    .eq("person_entity_id", entityId);

  if (roles && roles.length > 0) {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const recentRoles = roles.filter(r => !r.start_date || new Date(r.start_date) >= fiveYearsAgo);
    const velocity = recentRoles.length;
    const label = velocity === 0 ? "stable" : velocity <= 1 ? "slow" : velocity <= 3 ? "moderate" : "fast";
    attrs.push({
      attribute_key:       "career_velocity",
      attribute_value:     { changes_last_5y: velocity, label },
      confidence:          0.75,
      explanation_summary: `${velocity} roles in last 5 years → ${label} career movement`,
      supporting_source_ids: [],
    });
  }

  // ── investor_relevance ──────────────────────────────────────────────────────
  if (entityType === "firm_investor") {
    attrs.push({
      attribute_key:       "investor_relevance",
      attribute_value:     { relevant: true, source: "entity_type" },
      confidence:          0.95,
      explanation_summary: "Entity is a firm_investor — high investor relevance by type",
      supporting_source_ids: [],
    });
  }

  // ── operator_relevance ──────────────────────────────────────────────────────
  if (entityType === "operator_profile" || entityType === "startup_founder") {
    attrs.push({
      attribute_key:       "operator_relevance",
      attribute_value:     { relevant: true, source: "entity_type" },
      confidence:          0.95,
      explanation_summary: "Entity is an operator/founder — high operator relevance by type",
      supporting_source_ids: [],
    });
  }

  if (attrs.length === 0 || opts.dryRun) return;

  const rows = attrs.map(a => ({
    entity_type:          entityType,
    entity_id:            entityId,
    attribute_key:        a.attribute_key,
    attribute_value:      a.attribute_value,
    model_version:        MODEL_VERSION,
    inferred_at:          new Date().toISOString(),
    confidence:           a.confidence,
    supporting_source_ids: a.supporting_source_ids,
    explanation_summary:  a.explanation_summary,
    provenance:           { model: MODEL_VERSION, inferred_at: new Date().toISOString() },
  }));

  for (let i = 0; i < rows.length; i += 25) {
    await db
      .from("person_inferred_attributes")
      .upsert(rows.slice(i, i + 25), { onConflict: "entity_type,entity_id,attribute_key" });
  }
}

// ─── Organization attributes ──────────────────────────────────────────────────

export async function inferOrganizationAttributes(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  profile: NormalizedOrgProfile,
  opts: RunOptions = {},
): Promise<void> {
  const attrs: Array<{
    attribute_key: string;
    attribute_value: unknown;
    confidence: number;
    explanation_summary: string;
  }> = [];

  // ── org_type ─────────────────────────────────────────────────────────────────
  const orgTypeMap: Record<string, string> = {
    firm_record:       "vc_firm",
    organization:      "company",
    startup:           "startup",
    portfolio_company: "portfolio_company",
  };
  const orgType = orgTypeMap[entityType] ?? "unknown";
  attrs.push({
    attribute_key:       "org_type",
    attribute_value:     { type: orgType, source: "entity_type" },
    confidence:          0.95,
    explanation_summary: `Org type derived from entity_type="${entityType}"`,
  });

  // ── sector_focus ─────────────────────────────────────────────────────────────
  if (profile.sectors?.length) {
    attrs.push({
      attribute_key:       "sector_focus",
      attribute_value:     { sectors: profile.sectors.slice(0, 10) },
      confidence:          0.8,
      explanation_summary: `Sectors extracted from profile: ${profile.sectors.slice(0, 5).join(", ")}`,
    });
  }

  // ── stage_focus ───────────────────────────────────────────────────────────────
  if (profile.stage_focus?.length) {
    attrs.push({
      attribute_key:       "stage_focus",
      attribute_value:     { stages: profile.stage_focus },
      confidence:          0.8,
      explanation_summary: `Stage focus: ${profile.stage_focus.join(", ")}`,
    });
  }

  // ── data_completeness ─────────────────────────────────────────────────────────
  const COMPLETENESS_FIELDS: Array<keyof NormalizedOrgProfile> = [
    "name", "website_url", "description", "hq_city", "sectors", "founded_year",
  ];
  const filled = COMPLETENESS_FIELDS.filter(f => {
    const v = profile[f];
    return v != null && !(Array.isArray(v) && v.length === 0);
  }).length;
  attrs.push({
    attribute_key:       "data_completeness",
    attribute_value:     { score: Math.round(filled / COMPLETENESS_FIELDS.length * 100) / 100, filled, total: COMPLETENESS_FIELDS.length },
    confidence:          1.0,
    explanation_summary: `${filled}/${COMPLETENESS_FIELDS.length} key org profile fields present`,
  });

  // ── hiring_intensity (from activity signals) ──────────────────────────────────
  const { data: hireSignals } = await db
    .from("organization_activity_signals")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .in("signal_type", ["new_hire", "job_post_surge"])
    .gte("signal_date", new Date(Date.now() - 90 * 24 * 3_600_000).toISOString());

  const hireCount = hireSignals?.length ?? 0;
  const hireIntensity = hireCount === 0 ? "low" : hireCount < 3 ? "moderate" : "high";
  attrs.push({
    attribute_key:       "hiring_intensity",
    attribute_value:     { signal_count_90d: hireCount, label: hireIntensity },
    confidence:          0.7,
    explanation_summary: `${hireCount} hiring signals in last 90 days → ${hireIntensity} intensity`,
  });

  if (opts.dryRun) return;

  const rows = attrs.map(a => ({
    entity_type:          entityType,
    entity_id:            entityId,
    attribute_key:        a.attribute_key,
    attribute_value:      a.attribute_value,
    model_version:        MODEL_VERSION,
    inferred_at:          new Date().toISOString(),
    confidence:           a.confidence,
    supporting_source_ids: [],
    explanation_summary:  a.explanation_summary,
    provenance:           { model: MODEL_VERSION },
  }));

  for (let i = 0; i < rows.length; i += 25) {
    await db
      .from("organization_inferred_attributes")
      .upsert(rows.slice(i, i + 25), { onConflict: "entity_type,entity_id,attribute_key" });
  }
}
