/**
 * reputation-scoring.service.ts
 * ===============================
 * Computes first-pass reputation scores for people and organizations.
 * All scores are 0–1 numeric values with explainable components.
 * Stored as UPSERT so re-running is idempotent.
 *
 * Person score keys:
 *   expertise_credibility, network_centrality_proxy, public_visibility,
 *   consistency_score, data_completeness, investor_relevance, operator_relevance
 *
 * Org score keys:
 *   brand_strength, network_centrality_proxy, hiring_momentum,
 *   deal_activity, data_completeness
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunOptions } from "./types.ts";

const MODEL_VERSION = "rules-v1";

// ─── Person scoring ───────────────────────────────────────────────────────────

export async function scorePersonReputation(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions = {},
): Promise<void> {
  const scores: Array<{
    score_key: string;
    score_value: number;
    score_components: Record<string, unknown>;
  }> = [];

  // ── data_completeness: use existing inferred attribute ────────────────────
  const { data: completenessAttr } = await db
    .from("person_inferred_attributes")
    .select("attribute_value")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("attribute_key", "profile_completeness")
    .maybeSingle();
  const completenessScore = (completenessAttr?.attribute_value as { score?: number } | null)?.score ?? 0;
  scores.push({ score_key: "data_completeness", score_value: completenessScore, score_components: { source: "inferred_profile_completeness" } });

  // ── public_visibility: signals count proxy ────────────────────────────────
  const { count: signalCount } = await db
    .from("person_activity_signals")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  const visibilityScore = Math.min(1.0, (signalCount ?? 0) / 20);  // 20 signals = max
  scores.push({ score_key: "public_visibility", score_value: Math.round(visibilityScore * 1000) / 1000, score_components: { signal_count: signalCount ?? 0, max: 20 } });

  // ── network_centrality_proxy: edge count ──────────────────────────────────
  const { count: edgeCount } = await db
    .from("person_relationship_edges")
    .select("id", { count: "exact", head: true })
    .or(`from_entity_type.eq.${entityType},to_entity_type.eq.${entityType}`)
    .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);
  const centralityScore = Math.min(1.0, (edgeCount ?? 0) / 50);  // 50 connections = max
  scores.push({ score_key: "network_centrality_proxy", score_value: Math.round(centralityScore * 1000) / 1000, score_components: { edge_count: edgeCount ?? 0, max: 50 } });

  // ── expertise_credibility: topics + capabilities count ────────────────────
  const { count: topicCount } = await db
    .from("person_topics")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  const expertiseScore = Math.min(1.0, (topicCount ?? 0) / 10);
  scores.push({ score_key: "expertise_credibility", score_value: Math.round(expertiseScore * 1000) / 1000, score_components: { topic_count: topicCount ?? 0, max: 10 } });

  // ── consistency_score: multiple sources agreeing ──────────────────────────
  const { count: sourceCount } = await db
    .from("person_source_profiles")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("parse_status", "parsed");
  const consistencyScore = Math.min(1.0, (sourceCount ?? 0) / 5);
  scores.push({ score_key: "consistency_score", score_value: Math.round(consistencyScore * 1000) / 1000, score_components: { source_count: sourceCount ?? 0, max: 5 } });

  // ── investor_relevance: from inferred attribute ───────────────────────────
  const { data: investorAttr } = await db
    .from("person_inferred_attributes")
    .select("attribute_value, confidence")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("attribute_key", "investor_relevance")
    .maybeSingle();
  if (investorAttr) {
    const relevant = (investorAttr.attribute_value as { relevant?: boolean })?.relevant ?? false;
    scores.push({ score_key: "investor_relevance", score_value: relevant ? investorAttr.confidence : 0.1, score_components: { source: "inferred_attribute" } });
  }

  // ── operator_relevance ────────────────────────────────────────────────────
  const { data: operatorAttr } = await db
    .from("person_inferred_attributes")
    .select("attribute_value, confidence")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("attribute_key", "operator_relevance")
    .maybeSingle();
  if (operatorAttr) {
    const relevant = (operatorAttr.attribute_value as { relevant?: boolean })?.relevant ?? false;
    scores.push({ score_key: "operator_relevance", score_value: relevant ? operatorAttr.confidence : 0.1, score_components: { source: "inferred_attribute" } });
  }

  if (opts.dryRun) return;

  const rows = scores.map(s => ({
    entity_type:      entityType,
    entity_id:        entityId,
    score_key:        s.score_key,
    score_value:      s.score_value,
    score_components: s.score_components,
    model_version:    MODEL_VERSION,
    scored_at:        new Date().toISOString(),
    provenance:       { model: MODEL_VERSION, scored_at: new Date().toISOString() },
    created_at:       new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 25) {
    await db
      .from("person_reputation_scores")
      .upsert(rows.slice(i, i + 25), { onConflict: "entity_type,entity_id,score_key" });
  }
}

// ─── Organization scoring ─────────────────────────────────────────────────────

export async function scoreOrganizationReputation(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions = {},
): Promise<void> {
  const scores: Array<{
    score_key: string;
    score_value: number;
    score_components: Record<string, unknown>;
  }> = [];

  // ── data_completeness ─────────────────────────────────────────────────────
  const { data: completenessAttr } = await db
    .from("organization_inferred_attributes")
    .select("attribute_value")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("attribute_key", "data_completeness")
    .maybeSingle();
  const completenessScore = (completenessAttr?.attribute_value as { score?: number } | null)?.score ?? 0;
  scores.push({ score_key: "data_completeness", score_value: completenessScore, score_components: { source: "inferred_completeness" } });

  // ── hiring_momentum ───────────────────────────────────────────────────────
  const { data: hiringAttr } = await db
    .from("organization_inferred_attributes")
    .select("attribute_value")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("attribute_key", "hiring_intensity")
    .maybeSingle();
  const hiringLabel = (hiringAttr?.attribute_value as { label?: string } | null)?.label ?? "low";
  const hiringScore = hiringLabel === "high" ? 0.9 : hiringLabel === "moderate" ? 0.5 : 0.1;
  scores.push({ score_key: "hiring_momentum", score_value: hiringScore, score_components: { label: hiringLabel, source: "inferred_hiring_intensity" } });

  // ── network_centrality_proxy ──────────────────────────────────────────────
  const { count: orgEdgeCount } = await db
    .from("organization_relationship_edges")
    .select("id", { count: "exact", head: true })
    .or(`from_entity_type.eq.${entityType},to_entity_type.eq.${entityType}`)
    .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`);
  const centralityScore = Math.min(1.0, (orgEdgeCount ?? 0) / 30);
  scores.push({ score_key: "network_centrality_proxy", score_value: Math.round(centralityScore * 1000) / 1000, score_components: { edge_count: orgEdgeCount ?? 0, max: 30 } });

  // ── deal_activity ─────────────────────────────────────────────────────────
  const { count: dealCount } = await db
    .from("organization_activity_signals")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("signal_type", "funding_round");
  const dealScore = Math.min(1.0, (dealCount ?? 0) / 10);
  scores.push({ score_key: "deal_activity", score_value: Math.round(dealScore * 1000) / 1000, score_components: { deal_count: dealCount ?? 0, max: 10 } });

  // ── brand_strength: source count + completeness ───────────────────────────
  const { count: sourceCount } = await db
    .from("organization_source_profiles")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("parse_status", "parsed");
  const brandScore = (completenessScore + Math.min(1.0, (sourceCount ?? 0) / 4)) / 2;
  scores.push({ score_key: "brand_strength", score_value: Math.round(brandScore * 1000) / 1000, score_components: { source_count: sourceCount ?? 0, completeness: completenessScore } });

  if (opts.dryRun) return;

  const rows = scores.map(s => ({
    entity_type: entityType, entity_id: entityId,
    score_key: s.score_key, score_value: s.score_value,
    score_components: s.score_components, model_version: MODEL_VERSION,
    scored_at: new Date().toISOString(), provenance: { model: MODEL_VERSION },
    created_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 25) {
    await db
      .from("organization_reputation_scores")
      .upsert(rows.slice(i, i + 25), { onConflict: "entity_type,entity_id,score_key" });
  }
}
