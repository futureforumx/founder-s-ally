// =============================================================================
// Aurora KB — Shared Utilities
// =============================================================================
// CORS headers, feature flag checks, Supabase client factory, text chunking.
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { FEATURE_FLAGS } from "./kb-types.ts";

// ---------------------------------------------------------------------------
// CORS — same pattern as existing edge functions
// ---------------------------------------------------------------------------
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Feature flag guard
// ---------------------------------------------------------------------------
export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  const val = Deno.env.get(FEATURE_FLAGS[flag]);
  return val === "true" || val === "1" || val === "enabled";
}

export function requireFeatureFlag(flag: keyof typeof FEATURE_FLAGS): Response | null {
  if (!isFeatureEnabled(flag)) {
    return errorResponse(`Feature ${FEATURE_FLAGS[flag]} is not enabled`, 403);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Supabase client factory (service role — for backend use only)
// ---------------------------------------------------------------------------
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Text chunking — simple sentence/paragraph-aware chunker
// ---------------------------------------------------------------------------

/** Default chunk size in characters (~300 tokens at ~4 chars/token) */
const DEFAULT_CHUNK_SIZE = 1200;
/** Overlap between chunks to preserve context across boundaries */
const DEFAULT_CHUNK_OVERLAP = 200;

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface TextChunk {
  index: number;
  content: string;
  tokenCountEstimate: number;
}

/**
 * Split text into overlapping chunks, preferring paragraph/sentence boundaries.
 * This is a simple implementation suitable for initial ingestion.
 * TODO: Replace with a more sophisticated tokenizer-aware chunker for production.
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (!text || text.trim().length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at paragraph boundary
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + chunkSize * 0.5) {
        end = paragraphBreak + 2;
      } else {
        // Try sentence boundary
        const sentenceBreak = text.lastIndexOf(". ", end);
        if (sentenceBreak > start + chunkSize * 0.5) {
          end = sentenceBreak + 2;
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        index,
        content,
        // Rough estimate: ~4 chars per token for English
        tokenCountEstimate: Math.ceil(content.length / 4),
      });
      index++;
    }

    // Advance with overlap
    start = end - overlap;
    if (start >= text.length) break;
    // Safety: ensure forward progress
    if (end === text.length) break;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Entity table mapping — maps entity_type to canonical table name
// ---------------------------------------------------------------------------
export const ENTITY_TABLE_MAP: Record<string, string> = {
  investor: "investor_database",
  company: "company_analyses",
  profile: "profiles",
  competitor: "competitors",
};

/**
 * Resolve the canonical table name for a given entity type.
 * Returns null if the entity type is unknown.
 */
export function getCanonicalTable(entityType: string): string | null {
  return ENTITY_TABLE_MAP[entityType] ?? null;
}
