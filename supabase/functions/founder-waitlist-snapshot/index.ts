import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type FirmRow,
  type FounderSnapshotInvestorMatch,
  type FounderWaitlistSnapshotPayload,
  buildReason,
  marketSignalForSector,
  nextStepForFounderStage,
  normalizeWebsiteUrl,
  scoreFirmRow,
  sectorRelevanceHits,
} from "../_shared/founderWaitlistSnapshotMvp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CANDIDATES = 220;
const TOP_N = 3;

/**
 * FULL: optional migration-time columns (`recent_focus`, `funding_intel_activity_score`).
 * SAFE: same fields as `FirmRow` / scoring need, minus those two, so PostgREST does not 42703
 * when production schema lags migrations. (Not using a minimal `sector`/`stage_focus`-only
 * list—those omit `thesis_verticals` / `website_url` etc. and would break `scoreFirmRow`.)
 */
const FIRM_RECORDS_SELECT_FULL = `
  id,
  firm_name,
  thesis_verticals,
  description,
  elevator_pitch,
  preferred_stage,
  stage_min,
  stage_max,
  recent_focus,
  funding_intel_activity_score,
  is_actively_deploying,
  completeness_score,
  website_url
`
  .replace(/\s+/g, " ")
  .trim();

const FIRM_RECORDS_SELECT_SAFE = `
  id,
  firm_name,
  thesis_verticals,
  description,
  elevator_pitch,
  preferred_stage,
  stage_min,
  stage_max,
  is_actively_deploying,
  completeness_score,
  website_url
`
  .replace(/\s+/g, " ")
  .trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sector = typeof body.sector === "string" ? body.sector.trim() : "";
    const stage = typeof body.stage === "string" ? body.stage.trim() : "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let rows: FirmRow[] | null = null;
    // deno-lint-ignore no-explicit-any
    let error: any = null;

    ({ data: rows, error } = await supabase
      .from("firm_records")
      .select(FIRM_RECORDS_SELECT_FULL)
      .is("deleted_at", null)
      .eq("ready_for_live", true)
      .order("completeness_score", { ascending: false })
      .limit(MAX_CANDIDATES));

    if (error) {
      console.warn(
        "[founder-waitlist-snapshot] firm_records full select failed, retrying with safe columns",
        error,
      );
      ({ data: rows, error } = await supabase
        .from("firm_records")
        .select(FIRM_RECORDS_SELECT_SAFE)
        .is("deleted_at", null)
        .eq("ready_for_live", true)
        .order("completeness_score", { ascending: false })
        .limit(MAX_CANDIDATES));
    }

    const ms = marketSignalForSector(sector || null);
    const ns = nextStepForFounderStage(stage || null);

    if (error) {
      console.error(
        "[founder-waitlist-snapshot] firm_records select (safe fallback) failed:",
        error.message ?? error,
      );
      return jsonResponse({
        investorMatches: [],
        marketSignal: { text: ms.text, source: ms.source },
        nextStep: ns,
      });
    }

    if (!rows || rows.length === 0) {
      console.warn("[founder-waitlist-snapshot] No firm_records candidates after retry");
    }

    const list = (rows ?? []) as FirmRow[];
    const investorMatches = await buildTopMatches(supabase, list, sector, stage);

    const payload: FounderWaitlistSnapshotPayload = {
      investorMatches,
      marketSignal: { text: ms.text, source: ms.source },
      nextStep: ns,
    };

    return jsonResponse(payload);
  } catch (err) {
    console.error("[founder-waitlist-snapshot]", err);
    const ms = marketSignalForSector("");
    const ns = nextStepForFounderStage("");
    return jsonResponse({
      investorMatches: [],
      marketSignal: { text: ms.text, source: ms.source },
      nextStep: ns,
    });
  }
});

function jsonResponse(payload: FounderWaitlistSnapshotPayload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buildTopMatches(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  list: FirmRow[],
  sector: string,
  stage: string,
): Promise<FounderSnapshotInvestorMatch[]> {
  if (list.length === 0) return [];

  const scored = list.map((r) => ({
    row: r,
    score: scoreFirmRow(r, sector || null, stage || null),
  }));
  scored.sort((a, b) => b.score - a.score);

  const picked: FirmRow[] = [];
  const used = new Set<string>();

  for (const s of scored) {
    if (picked.length >= TOP_N) break;
    if (used.has(s.row.id)) continue;
    used.add(s.row.id);
    picked.push(s.row);
  }

  if (picked.length < TOP_N) {
    const byActivity = [...list].sort(
      (a, b) => (b.funding_intel_activity_score ?? 0) - (a.funding_intel_activity_score ?? 0),
    );
    for (const r of byActivity) {
      if (picked.length >= TOP_N) break;
      if (used.has(r.id)) continue;
      used.add(r.id);
      picked.push(r);
    }
  }

  const firmIds = picked.map((r) => r.id);
  const peopleByFirm = new Map<string, string>();

  if (firmIds.length > 0) {
    const { data: people, error: pErr } = await supabase
      .from("firm_investors")
      .select("firm_id, full_name")
      .in("firm_id", firmIds)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .limit(80);

    if (!pErr && people) {
      for (const p of people as Array<{ firm_id: string; full_name: string | null }>) {
        const fid = p.firm_id;
        const name = (p.full_name ?? "").trim();
        if (!fid || !name) continue;
        if (!peopleByFirm.has(fid)) peopleByFirm.set(fid, name);
      }
    }
  }

  const sectorSlug = sector || null;

  return picked.map((r) => {
    const investorName = peopleByFirm.get(r.id);
    const genericCopy = sectorRelevanceHits(sectorSlug, r) === 0;
    return {
      firmName: r.firm_name || "Fund",
      ...(investorName ? { investorName } : {}),
      reason: buildReason(r, sectorSlug, genericCopy),
      url: normalizeWebsiteUrl(r.website_url),
    };
  });
}
