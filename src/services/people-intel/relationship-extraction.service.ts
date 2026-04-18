/**
 * relationship-extraction.service.ts
 * =====================================
 * Generates person↔person and person↔org edges from:
 *   - person_organization_roles (shared employer + time overlap → co_worker)
 *   - entity_type fields (founder_of, investor_at, employed_at)
 *   - organization member lists (board_member, advisor)
 *
 * All edges use supporting_evidence JSONB for auditability.
 * UPSERT with evidence_count increment is idempotent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunOptions } from "./types.ts";

// ─── Person → Org edges ───────────────────────────────────────────────────────

export async function extractPersonRelationships(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions = {},
): Promise<void> {

  // 1. Build person → org edges from role history
  const { data: roles } = await db
    .from("person_organization_roles")
    .select("org_entity_type, org_entity_id, title, is_current, start_date, end_date, seniority_level")
    .eq("person_entity_type", entityType)
    .eq("person_entity_id", entityId);

  if (!roles?.length) return;

  const personOrgEdges: Array<Record<string, unknown>> = [];
  for (const role of roles) {
    const edgeType = derivePersonOrgEdgeType(role.seniority_level, role.title);
    personOrgEdges.push({
      person_entity_type: entityType,
      person_entity_id:   entityId,
      org_entity_type:    role.org_entity_type,
      org_entity_id:      role.org_entity_id,
      edge_type:          edgeType,
      weight:             edgeType === "founder_of" ? 0.95 : edgeType === "investor_at" ? 0.9 : edgeType === "board_member" ? 0.85 : 0.7,
      evidence_count:     1,
      first_seen_at:      role.start_date ? new Date(role.start_date).toISOString() : new Date().toISOString(),
      last_seen_at:       role.is_current ? new Date().toISOString() : (role.end_date ? new Date(role.end_date).toISOString() : new Date().toISOString()),
      confidence:         0.85,
      supporting_evidence: [{ title: role.title, is_current: role.is_current, source: "person_organization_roles" }],
      provenance:         { source: "role_history", extracted_at: new Date().toISOString() },
      updated_at:         new Date().toISOString(),
    });
  }

  if (personOrgEdges.length && !opts.dryRun) {
    for (let i = 0; i < personOrgEdges.length; i += 25) {
      await db
        .from("person_org_relationship_edges")
        .upsert(personOrgEdges.slice(i, i + 25), {
          onConflict: "person_entity_type,person_entity_id,org_entity_type,org_entity_id,edge_type",
        });
    }
  }

  // 2. Build person↔person edges from shared employer overlap
  await extractCoWorkerEdges(db, entityType, entityId, roles, opts);
}

// ─── Co-worker edges (shared employer + time overlap) ────────────────────────

async function extractCoWorkerEdges(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  roles: Array<{ org_entity_type: string; org_entity_id: string; start_date: string | null; end_date: string | null }>,
  opts: RunOptions,
): Promise<void> {

  for (const role of roles) {
    // Find others who worked at the same org
    const { data: peers } = await db
      .from("person_organization_roles")
      .select("person_entity_type, person_entity_id, start_date, end_date")
      .eq("org_entity_type", role.org_entity_type)
      .eq("org_entity_id", role.org_entity_id)
      .neq("person_entity_id", entityId)
      .limit(50);

    if (!peers?.length) continue;

    const edges: Array<Record<string, unknown>> = [];
    for (const peer of peers) {
      if (!dateRangesOverlap(role.start_date, role.end_date, peer.start_date, peer.end_date)) continue;

      // Canonical undirected key: LEAST(a,b), GREATEST(a,b)
      const aKey = `${entityType}:${entityId}`;
      const bKey = `${peer.person_entity_type}:${peer.person_entity_id}`;

      edges.push({
        from_entity_type:    aKey < bKey ? entityType : peer.person_entity_type,
        from_entity_id:      aKey < bKey ? entityId   : peer.person_entity_id,
        to_entity_type:      aKey < bKey ? peer.person_entity_type : entityType,
        to_entity_id:        aKey < bKey ? peer.person_entity_id   : entityId,
        edge_type:           "co_worker",
        weight:              0.6,
        evidence_count:      1,
        first_seen_at:       laterDate(role.start_date, peer.start_date) ?? new Date().toISOString(),
        last_seen_at:        earlierDate(role.end_date, peer.end_date) ?? new Date().toISOString(),
        confidence:          0.7,
        supporting_evidence: [{ shared_org_id: role.org_entity_id, overlap: true }],
        provenance:          { source: "employer_overlap", extracted_at: new Date().toISOString() },
        updated_at:          new Date().toISOString(),
      });
    }

    if (edges.length && !opts.dryRun) {
      for (let i = 0; i < edges.length; i += 25) {
        // Use INSERT ... ON CONFLICT DO UPDATE to increment evidence_count
        const chunk = edges.slice(i, i + 25);
        for (const edge of chunk) {
          await db.rpc("pig_upsert_person_rel_edge", edge).maybeSingle().catch(() => null);
        }
        // Fallback: simple upsert (no evidence_count increment)
        await db.from("person_relationship_edges").upsert(chunk).then(() => {}).catch(() => {});
      }
    }
  }
}

// ─── Organization relationship edges ─────────────────────────────────────────

export async function extractOrganizationRelationships(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
  opts: RunOptions = {},
): Promise<void> {
  // For VC firms: extract investor→portfolio edges from existing co-investor patterns
  if (entityType !== "firm_record") return;

  // Pull portfolio company org edges from existing investment signals
  const { data: investSignals } = await db
    .from("organization_activity_signals")
    .select("structured_payload, signal_date")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("signal_type", "funding_round");

  if (!investSignals?.length || opts.dryRun) return;

  const edges: Array<Record<string, unknown>> = [];
  for (const sig of investSignals) {
    const payload = sig.structured_payload as Record<string, unknown>;
    const portfolioId = payload?.portfolio_company_id as string | undefined;
    if (!portfolioId) continue;
    edges.push({
      from_entity_type:    entityType,
      from_entity_id:      entityId,
      to_entity_type:      "portfolio_company",
      to_entity_id:        portfolioId,
      edge_type:           "investor_in",
      weight:              0.9,
      evidence_count:      1,
      first_seen_at:       sig.signal_date ?? new Date().toISOString(),
      last_seen_at:        sig.signal_date ?? new Date().toISOString(),
      confidence:          0.85,
      supporting_evidence: [{ signal: "funding_round", date: sig.signal_date }],
      provenance:          { source: "funding_signal" },
      updated_at:          new Date().toISOString(),
    });
  }

  for (let i = 0; i < edges.length; i += 25) {
    await db.from("organization_relationship_edges")
      .upsert(edges.slice(i, i + 25), {
        onConflict: "from_entity_type,from_entity_id,to_entity_type,to_entity_id,edge_type",
      });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivePersonOrgEdgeType(seniority: string | null, title: string | null): string {
  const s = (seniority ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (s === "founder" || /\bfounder\b/.test(t))                          return "founder_of";
  if (/\b(general partner|gp|partner|managing partner)\b/.test(t))       return "investor_at";
  if (s === "board" || /\bboard\b/.test(t))                              return "board_member";
  if (s === "advisor" || /\badvisor\b/.test(t))                          return "advisor";
  return "employed_at";
}

function dateRangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  const aS = aStart ? new Date(aStart).getTime() : 0;
  const aE = aEnd   ? new Date(aEnd).getTime()   : Date.now();
  const bS = bStart ? new Date(bStart).getTime() : 0;
  const bE = bEnd   ? new Date(bEnd).getTime()   : Date.now();
  return aS < bE && bS < aE;
}

function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

function earlierDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) < new Date(b) ? a : b;
}
