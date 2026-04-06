import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAdapterKey, SOURCE_ADAPTERS } from "../_shared/intelligence/adapters.ts";
import { buildDedupeKey } from "../_shared/intelligence/dedupe.ts";
import { findMatchingEntities, suggestWhyItMatters } from "../_shared/intelligence/entities.ts";
import { normalizeRawToItem } from "../_shared/intelligence/normalize.ts";
import { rarityForEventType, scoreEvent } from "../_shared/intelligence/scoring.ts";
import type { EntityRow } from "../_shared/intelligence/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-intelligence-cron-secret",
};

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function authorizeService(req: Request): boolean {
  const auth = req.headers.get("Authorization") || "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && token === secret) return true;
  const cron = req.headers.get("x-intelligence-cron-secret");
  const expected = Deno.env.get("INTELLIGENCE_CRON_SECRET");
  return Boolean(expected && cron === expected);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!authorizeService(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "run";

    let ingested = 0;
    let processed = 0;

    if (action === "ingest" || action === "run") {
      const { data: sources, error: se } = await admin.from("intelligence_sources")
        .select("id, name, type, base_url, credibility_score, metadata, active")
        .eq("active", true);
      if (se) throw se;

      for (const src of sources || []) {
        const meta = (src.metadata || {}) as Record<string, unknown>;
        const adapterKey = getAdapterKey(meta);
        const adapter = SOURCE_ADAPTERS[adapterKey] || SOURCE_ADAPTERS.rss;
        const baseUrl = src.base_url || "";
        try {
          const items = await adapter({ fetch, baseUrl, metadata: meta });

          // ── Bulk ingest: build all rows in memory, then insert in one call ──
          // Previously: one INSERT per item (up to 40 round-trips per source).
          // Now: a single INSERT with the full array (1 round-trip per source).
          const rows = await Promise.all(
            items.slice(0, 40).map(async (it) => {
              const link = it.link || baseUrl;
              const hash = await sha256hex(`${src.id}:${link}:${it.title}`);
              const excerpt = it.description?.slice(0, 500) || null;
              return {
                source_id: src.id,
                source_url: link,
                title: it.title.slice(0, 500),
                excerpt,
                body: excerpt,
                published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
                content_hash: hash,
                processing_status: "pending",
                metadata: { adapter: adapterKey },
              };
            })
          );

          if (rows.length > 0) {
            // ignoreDuplicates is not available; use upsert with onConflict on content_hash
            // to skip rows that already exist without erroring.
            const { error: ie } = await admin
              .from("raw_intelligence_items")
              .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true });
            if (ie && !String(ie.message).includes("duplicate")) {
              console.warn(`ingest bulk insert for source ${src.id}:`, ie.message);
            } else {
              ingested += rows.length;
            }
          }
        } catch (e) {
          console.warn(`ingest source ${src.id}:`, e);
        }
      }
    }

    if (action === "process" || action === "run") {
      const { data: entityRows, error: ee } = await admin.from("intelligence_entities")
        .select("id, type, name, aliases")
        .limit(800);
      if (ee) throw ee;
      const entities = (entityRows || []) as EntityRow[];

      const { data: pending, error: pe } = await admin.from("raw_intelligence_items")
        .select("id, source_id, source_url, title, body, excerpt, published_at, intelligence_sources ( credibility_score )")
        .eq("processing_status", "pending")
        .order("fetched_at", { ascending: true })
        .limit(40);
      if (pe) throw pe;

      const pendingItems = pending || [];

      // ── Batch mark all pending items as "processing" in one UPDATE ──
      // Previously: one UPDATE per item at the top of the loop.
      if (pendingItems.length > 0) {
        const ids = pendingItems.map((r) => r.id);
        await admin
          .from("raw_intelligence_items")
          .update({ processing_status: "processing" })
          .in("id", ids);
      }

      // Accumulators for end-of-batch status updates and entity inserts
      const processedIds: string[] = [];
      const failedIds: string[] = [];
      const entityInsertRows: { event_id: string; entity_id: string; role: string }[] = [];

      for (const raw of pendingItems) {
        const srcCred = Number(
          (raw as { intelligence_sources?: { credibility_score?: number } }).intelligence_sources
            ?.credibility_score ?? 0.7,
        );

        const norm = normalizeRawToItem({
          title: raw.title,
          excerpt: raw.excerpt,
          body: raw.body,
          sourceUrl: raw.source_url,
          publishedAt: raw.published_at,
        });
        const blob = [norm.title, norm.summary].join(" ");
        const matched = findMatchingEntities(blob, entities);
        const primaryId = matched[0]?.id ?? null;
        const dedupeKey = buildDedupeKey({
          eventType: norm.likelyEventType,
          title: norm.title,
          publishedAt: norm.publishedAt,
          primaryEntityId: primaryId,
        });

        const hours = raw.published_at
          ? (Date.now() - new Date(raw.published_at).getTime()) / 3600000
          : 48;
        const scores = scoreEvent({
          sourceCredibility: srcCred,
          eventTypeRarity: rarityForEventType(norm.likelyEventType),
          recencyHours: Math.max(0, hours),
          watchlistBoost: 0,
          entityBoost: matched.length ? 0.12 : 0,
        });

        const why = suggestWhyItMatters(norm.likelyEventType, norm.title);

        const { data: existing } = await admin.from("intelligence_events")
          .select("id, source_count")
          .eq("dedupe_key", dedupeKey)
          .maybeSingle();

        if (existing?.id) {
          await admin.from("intelligence_events").update({
            last_seen_at: new Date().toISOString(),
            source_count: (existing.source_count || 1) + 1,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          processedIds.push(raw.id);
        } else {
          const { data: inserted, error: insE } = await admin.from("intelligence_events").insert({
            event_type: norm.likelyEventType,
            category: norm.likelyCategory,
            title: norm.title,
            summary: norm.summary,
            why_it_matters: why,
            confidence_score: scores.confidence,
            importance_score: scores.importance,
            relevance_score: scores.relevance,
            canonical_source_url: norm.sourceUrl,
            source_count: 1,
            dedupe_key: dedupeKey,
            metadata: { raw_item_id: raw.id },
          }).select("id").single();

          if (insE) {
            console.warn(insE);
            failedIds.push(raw.id);
            continue;
          }

          const eventId = inserted!.id;
          // Collect entity links — will be batch-inserted after the loop
          for (const m of matched) {
            entityInsertRows.push({
              event_id: eventId,
              entity_id: m.id,
              role: m.type === "fund" || m.type === "investor" ? "investor" : "subject",
            });
          }
          processedIds.push(raw.id);
        }

        processed++;
      }

      // ── Batch insert all entity links in one call ──
      // Previously: one INSERT per matched entity inside the per-item loop.
      if (entityInsertRows.length > 0) {
        await admin.from("intelligence_event_entities").insert(entityInsertRows);
      }

      // ── Batch update final status for all processed and failed items ──
      // Previously: one UPDATE per item at the bottom of the loop.
      if (processedIds.length > 0) {
        await admin
          .from("raw_intelligence_items")
          .update({ processing_status: "processed" })
          .in("id", processedIds);
      }
      if (failedIds.length > 0) {
        await admin
          .from("raw_intelligence_items")
          .update({ processing_status: "failed" })
          .in("id", failedIds);
      }
    }

    return new Response(JSON.stringify({ ok: true, ingested, processed, action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
