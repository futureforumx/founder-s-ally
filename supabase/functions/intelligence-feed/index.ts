import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jwtDecode } from "https://esm.sh/jwt-decode@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FeedBody = {
  action: "feed" | "summary" | "save" | "dismiss" | "watchlist_add" | "note" | "alert";
  userId?: string;
  category?: string | null;
  watchlistOnly?: boolean;
  highSignalOnly?: boolean;
  hours?: number;
  entityType?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  eventId?: string;
  entityId?: string;
  keyword?: string;
  watchlistCategory?: string | null;
  projectLabel?: string | null;
  notes?: string | null;
  alertType?: string;
};

function decodeUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = jwtDecode<{ sub?: string }>(token);
    return decoded.sub || null;
  } catch {
    return null;
  }
}

function rankExpr(): string {
  return "(relevance_score * 0.4 + importance_score * 0.35 + confidence_score * 0.25)";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const userId = decodeUserId(authHeader);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body: FeedBody = await req.json().catch(() => ({ action: "feed" }));

    if (body.action === "save" && body.eventId) {
      const { error } = await admin.from("intelligence_saved_events").upsert(
        {
          user_id: userId,
          event_id: body.eventId,
          project_label: body.projectLabel ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "user_id,event_id" },
      );
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "dismiss" && body.eventId) {
      const { error } = await admin.from("intelligence_dismissed_events").upsert(
        { user_id: userId, event_id: body.eventId },
        { onConflict: "user_id,event_id" },
      );
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "watchlist_add") {
      if (!body.entityId && !body.keyword?.trim()) {
        return new Response(JSON.stringify({ error: "entityId or keyword required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await admin.from("intelligence_watchlists").insert({
        user_id: userId,
        entity_id: body.entityId ?? null,
        keyword: body.keyword?.trim() || null,
        category: body.watchlistCategory ?? null,
        alert_threshold: "medium",
        digest_frequency: "daily",
      }).select("id").single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, watchlistId: data?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "note" && body.eventId) {
      const { error } = await admin.from("intelligence_saved_events").upsert(
        {
          user_id: userId,
          event_id: body.eventId,
          notes: body.notes ?? "",
          project_label: body.projectLabel ?? null,
        },
        { onConflict: "user_id,event_id" },
      );
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "alert" && (body.eventId || body.keyword)) {
      if (body.eventId) {
        const { error } = await admin.from("intelligence_alerts").insert({
          user_id: userId,
          event_id: body.eventId,
          alert_type: body.alertType || "instant",
          status: "active",
        });
        if (error) throw error;
      } else {
        const { data: wl, error: wle } = await admin.from("intelligence_watchlists").insert({
          user_id: userId,
          keyword: body.keyword!.trim(),
          category: body.watchlistCategory ?? null,
          alert_threshold: "high",
          digest_frequency: "instant",
        }).select("id").single();
        if (wle) throw wle;
        await admin.from("intelligence_alerts").insert({
          user_id: userId,
          watchlist_id: wl!.id,
          alert_type: body.alertType || "instant",
          status: "active",
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "summary") {
      const hours = body.hours ?? 24;
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

      const { data: dismissed } = await admin.from("intelligence_dismissed_events")
        .select("event_id")
        .eq("user_id", userId);
      const dismissedSet = new Set((dismissed || []).map((d) => d.event_id));

      const { data: recent, error: e1 } = await admin.from("intelligence_events")
        .select("id, category, event_type, title, importance_score, last_seen_at")
        .gte("last_seen_at", since)
        .order("importance_score", { ascending: false })
        .limit(80);
      if (e1) throw e1;

      const visible = (recent || []).filter((r) => !dismissedSet.has(r.id));
      const strip = {
        highSignal24h: visible.filter((r) => Number(r.importance_score) >= 0.75).length,
        investorActivity: visible.filter((r) => r.category === "investors").length,
        competitorMoves: visible.filter((r) =>
          ["pricing_changed", "product_launched", "customer_win_announced", "partnership_announced"].includes(
            r.event_type,
          )
        ).length,
        peopleMoves: visible.filter((r) =>
          ["executive_hired", "executive_departed", "partner_joined_firm", "partner_left_firm"].includes(r.event_type)
        ).length,
        newFunds: visible.filter((r) => r.event_type === "new_fund_closed").length,
        productLaunches: visible.filter((r) => r.event_type === "product_launched").length,
        regulatory: visible.filter((r) => r.event_type === "regulatory_update" || r.category === "regulatory").length,
      };

      return new Response(JSON.stringify({ summary: strip }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // feed
    const limit = Math.min(50, Math.max(1, body.limit ?? 20));
    const offset = Math.max(0, body.offset ?? 0);
    const hours = body.hours ?? 24 * 7;

    const { data: dismissed } = await admin.from("intelligence_dismissed_events")
      .select("event_id")
      .eq("user_id", userId);
    const dismissedIds = (dismissed || []).map((d) => d.event_id);

    const { data: watchRows } = await admin.from("intelligence_watchlists")
      .select("entity_id, keyword, category")
      .eq("user_id", userId);
    const watchEntityIds = [...new Set((watchRows || []).map((w) => w.entity_id).filter(Boolean))] as string[];

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const safeSearch = body.search?.trim().replace(/%/g, "").replace(/_/g, " ").slice(0, 80) || "";

    let q = admin.from("intelligence_events")
      .select(
        "id, event_type, category, title, summary, why_it_matters, confidence_score, importance_score, relevance_score, sentiment, first_seen_at, last_seen_at, canonical_source_url, source_count, metadata",
      )
      .gte("last_seen_at", since)
      .order("importance_score", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .range(offset, offset + limit * 2 - 1);

    if (body.category && body.category !== "all") {
      q = q.eq("category", body.category);
    }
    if (body.highSignalOnly) {
      q = q.or("importance_score.gte.0.75,relevance_score.gte.0.75");
    }
    if (safeSearch) {
      const s = `%${safeSearch}%`;
      q = q.or(`title.ilike.${s},summary.ilike.${s},why_it_matters.ilike.${s}`);
    }

    const { data: events, error } = await q;
    if (error) throw error;

    let list = (events || []).filter((e) => !dismissedIds.includes(e.id)).slice(0, limit);

    const eventIds = list.map((e) => e.id);
    const entityByEvent = new Map<string, { role: string; id: string; type: string; name: string }[]>();
    if (eventIds.length) {
      const { data: links, error: le } = await admin.from("intelligence_event_entities")
        .select("event_id, role, intelligence_entities ( id, type, name )")
        .in("event_id", eventIds);
      if (le) throw le;
      for (const row of links || []) {
        const ent = row.intelligence_entities as { id: string; type: string; name: string } | null;
        if (!ent) continue;
        const arr = entityByEvent.get(row.event_id) || [];
        arr.push({ role: row.role, id: ent.id, type: ent.type, name: ent.name });
        entityByEvent.set(row.event_id, arr);
      }
    }

    const withEntities = list.map((ev) => ({
      ...ev,
      entities: entityByEvent.get(ev.id) || [],
    }));

    list = withEntities as typeof list;

    if (body.entityType) {
      list = list.filter((ev) => {
        const ents = (ev as { entities?: { type?: string }[] }).entities || [];
        return ents.some((x) => x.type === body.entityType);
      });
    }

    if (body.watchlistOnly && watchEntityIds.length) {
      list = list.filter((ev) => {
        const ents = (ev as { entities?: { id?: string }[] }).entities || [];
        const ids = ents.map((x) => x.id).filter(Boolean);
        return ids.some((id) => watchEntityIds.includes(id as string));
      });
    } else if (body.watchlistOnly) {
      list = [];
    }

    const { data: saved } = await admin.from("intelligence_saved_events")
      .select("event_id")
      .eq("user_id", userId);
    const savedSet = new Set((saved || []).map((s) => s.event_id));

    // Side rail aggregates (demo-friendly)
    const { data: trendingFunds } = await admin.from("intelligence_entities")
      .select("id, name, type")
      .eq("type", "fund")
      .limit(5);
    const { data: trendingPeople } = await admin.from("intelligence_entities")
      .select("id, name, type")
      .in("type", ["person", "investor"])
      .limit(5);

    return new Response(
      JSON.stringify({
        events: list.map((ev: Record<string, unknown>) => ({
          ...ev,
          saved: savedSet.has(String(ev.id)),
          rank: Number(
            (Number(ev.relevance_score) * 0.4 + Number(ev.importance_score) * 0.35 +
              Number(ev.confidence_score) * 0.25).toFixed(4),
          ),
        })),
        meta: { limit, offset, rankFormula: rankExpr() },
        sideRail: {
          trendingInvestors: trendingFunds || [],
          newFunds: (trendingFunds || []).slice(0, 3),
          peopleMoves: trendingPeople || [],
          risingTopics: ["Enterprise AI agents", "Usage-based pricing", "EU AI compliance", "Seed→A step-ups"],
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
