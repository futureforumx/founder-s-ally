import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate embedding via Lovable AI gateway (OpenAI-compatible)
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Embedding API error [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase env vars not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { mode = "database", firms: externalFirms } = await req.json();

    let firmsToProcess: { id: string; sectors: string[] }[] = [];

    if (mode === "json" && externalFirms) {
      // Accept firms from JSON payload (for initial ingestion from vc_mdm_output.json)
      firmsToProcess = externalFirms
        .filter((f: any) => f.sectors && f.sectors.length > 0)
        .map((f: any) => ({ id: f.id, sectors: f.sectors }));
    } else {
      // Pull firms from firm_records that don't have embeddings yet
      const { data: rows, error } = await supabase
        .from("firm_records")
        .select("id, thesis_verticals")
        .is("sector_embedding", null);

      if (error) throw new Error(`DB fetch error: ${error.message}`);
      firmsToProcess = (rows || [])
        .filter((r: any) => r.thesis_verticals && r.thesis_verticals.length > 0)
        .map((r: any) => ({ id: r.id, sectors: r.thesis_verticals }));
    }

    let processed = 0;
    let failed = 0;
    // Embedding API batch: 20 parallel requests to the AI gateway
    const embeddingBatchSize = 20;
    const errors: string[] = [];

    // Accumulate all (id, embedding) pairs in memory, then write in one RPC call
    // Previously: one UPDATE per firm (N individual round-trips to the DB).
    // Now:  N parallel embedding fetches → one RPC batch update per chunk.
    for (let i = 0; i < firmsToProcess.length; i += embeddingBatchSize) {
      const batch = firmsToProcess.slice(i, i + embeddingBatchSize);

      // Fetch embeddings in parallel (unchanged — this is already efficient)
      const embeddingResults = await Promise.allSettled(
        batch.map(async (firm) => {
          const sectorText = firm.sectors.join(", ");
          const embedding = await getEmbedding(sectorText, LOVABLE_API_KEY);
          return { id: firm.id, embedding };
        })
      );

      // Separate successes from failures
      const successRows: { id: string; embedding: number[] }[] = [];
      for (const r of embeddingResults) {
        if (r.status === "fulfilled") {
          successRows.push(r.value);
        } else {
          failed++;
          errors.push(r.reason?.message || "Unknown error");
        }
      }

      // ── Single RPC call to batch-update all embeddings in this chunk ──
      // Uses the `batch_update_sector_embeddings` SQL function (see migration
      // 20260404_batch_embedding_update.sql) which accepts a JSONB array and
      // executes one UPDATE ... FROM jsonb_array_elements() internally.
      if (successRows.length > 0) {
        const { error: rpcError } = await supabase.rpc(
          "batch_update_sector_embeddings",
          {
            updates: successRows.map((r) => ({
              id: r.id,
              embedding: r.embedding,
            })),
          }
        );

        if (rpcError) {
          // Fall back to individual updates so a single RPC failure doesn't drop the whole batch
          console.warn(`[batch_update_sector_embeddings] RPC failed: ${rpcError.message} — falling back to per-row updates`);
          for (const row of successRows) {
            const { error: updateError } = await supabase
              .from("firm_records")
              .update({ sector_embedding: JSON.stringify(row.embedding) } as any)
              .eq("id", row.id);
            if (updateError) {
              failed++;
              errors.push(`Update failed for ${row.id}: ${updateError.message}`);
            } else {
              processed++;
            }
          }
        } else {
          processed += successRows.length;
        }
      }

      // Small delay between chunks to avoid rate limits on the embedding API
      if (i + embeddingBatchSize < firmsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: firmsToProcess.length,
        processed,
        failed,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
