import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  fetchExternalNewsForFirm,
  type NewsRawArticle,
} from "../_shared/investor-news-apis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  is_trending?: boolean | null;
  is_popular?: boolean | null;
  is_recent?: boolean | null;
};

function formatErr(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function signalTypeFromArticle(a: NewsRawArticle): "BLOG_POST" | "OTHER" | "RECENT_INVESTMENT" {
  const text = `${a.title} ${a.content_snippet}`.toLowerCase();
  if (
    text.includes("invested in") ||
    text.includes("leads series") ||
    text.includes("announces investment") ||
    text.includes("backed by")
  ) {
    return "RECENT_INVESTMENT";
  }
  if (text.includes("blog") || text.includes("newsletter") || text.includes("insight")) {
    return "BLOG_POST";
  }
  return "OTHER";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CRON_TOKEN = Deno.env.get("REFRESH_NEWS_CRON_TOKEN");
    if (CRON_TOKEN) {
      const auth = req.headers.get("authorization") || "";
      if (auth !== `Bearer ${CRON_TOKEN}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const allFirms = body?.allFirms !== false;
    const watchedOnly = body?.watchedOnly === true;
    const firmId = typeof body?.firmId === "string" ? body.firmId : null;
    const limitFirms = Number(body?.limitFirms ?? 150);
    const maxArticlesPerFirm = Number(body?.maxArticlesPerFirm ?? 10);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let query = admin
      .from("firm_records")
      .select("id, firm_name, website_url, is_trending, is_popular, is_recent")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(limitFirms, 1000)));

    if (firmId) query = query.eq("id", firmId);
    if (!allFirms && !firmId) query = query.limit(25);

    const { data: firms, error: firmsErr } = await query;
    if (firmsErr) throw firmsErr;

    const selected = (firms ?? []).filter((f: FirmRow) => {
      if (!watchedOnly) return true;
      return Boolean(f.is_trending || f.is_popular || f.is_recent);
    }) as FirmRow[];

    let processedFirms = 0;
    let insertedSignals = 0;
    const failures: { firmId: string; name: string; error: string }[] = [];

    for (const firm of selected) {
      try {
        const articles = await fetchExternalNewsForFirm({
          firmName: firm.firm_name,
          websiteDomain: firm.website_url,
        });
        const sliced = articles.slice(0, Math.max(1, Math.min(maxArticlesPerFirm, 30)));
        if (sliced.length === 0) {
          processedFirms += 1;
          continue;
        }

        const { data: existing, error: existingErr } = await admin
          .from("vc_signals")
          .select("url")
          .eq("firm_id", firm.id)
          .not("url", "is", null)
          .limit(2000);
        if (existingErr) throw existingErr;

        const existingUrls = new Set(
          (existing ?? [])
            .map((r: { url: string | null }) => (r.url ? normalizeUrl(r.url) : null))
            .filter(Boolean) as string[],
        );

        const rows = sliced
          .map((a) => {
            const url = normalizeUrl(a.url);
            if (!url || existingUrls.has(url)) return null;
            existingUrls.add(url);
            return {
              firm_id: firm.id,
              signal_type: signalTypeFromArticle(a),
              title: a.title.slice(0, 300),
              url,
              description: a.content_snippet?.slice(0, 1500) || null,
              signal_date: a.published_at || null,
              source_type: "OTHER",
              source_confidence: 70,
              metadata: {
                source_name: a.source_name || "External news",
                tags: a.tags ?? [],
                og_image_url: a.og_image_url ?? null,
                ingest_source: "refresh-firm-news",
              },
            };
          })
          .filter(Boolean);

        if (rows.length > 0) {
          const { error: insertErr } = await admin.from("vc_signals").insert(rows as never[]);
          if (insertErr) throw insertErr;
          insertedSignals += rows.length;
        }
        processedFirms += 1;
      } catch (e) {
        failures.push({
          firmId: firm.id,
          name: firm.firm_name,
          error: formatErr(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        requested: selected.length,
        processedFirms,
        insertedSignals,
        failures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("refresh-firm-news error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

