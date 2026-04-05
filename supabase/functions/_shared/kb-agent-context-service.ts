// =============================================================================
// Aurora KB — Agent Context Assembly Service
// =============================================================================
// Produces clean, structured JSON context objects for the Aurora agent.
// Combines canonical entity data (read-only) with KB artifacts.
// This is the primary interface between the knowledge base and the agent.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  EntityContext,
  AgentSearchContext,
  SearchKnowledgeParams,
  EmbeddingProvider,
} from "./kb-types.ts";
import { getEntityContext, searchKnowledge } from "./kb-retrieval-service.ts";

// ---------------------------------------------------------------------------
// assembleAuroraEntityContext — full grounded context for a single entity
// ---------------------------------------------------------------------------
/**
 * Assembles everything Aurora needs to reason about a specific entity.
 *
 * Returns a structured JSON object containing:
 * - Canonical entity profile from existing tables (read-only)
 * - Summary cards derived from KB artifacts
 * - Recent notes (direct + linked)
 * - Documents and top retrieval chunks
 * - Recent action logs
 * - External object links (HubSpot, Notion, etc.)
 * - Related entity links
 *
 * This output is designed to be directly consumable by the agent prompt.
 */
export async function assembleAuroraEntityContext(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<EntityContext> {
  return getEntityContext(supabase, entityType, entityId);
}

// ---------------------------------------------------------------------------
// assembleAuroraSearchContext — grounded context from a search query
// ---------------------------------------------------------------------------
/**
 * Runs a hybrid search and assembles context for the top results.
 * Optionally enriches top-scoring results with full entity context.
 *
 * @param enrichTopN — number of top entity results to enrich with full context (default: 3)
 */
export async function assembleAuroraSearchContext(
  supabase: SupabaseClient,
  query: string,
  filters?: Partial<SearchKnowledgeParams>,
  embeddingProvider?: EmbeddingProvider,
  enrichTopN = 3,
): Promise<AgentSearchContext> {
  const startTime = Date.now();

  const searchParams: SearchKnowledgeParams = {
    query,
    ...filters,
  };

  const { results } = await searchKnowledge(supabase, searchParams, embeddingProvider);

  // Determine which search modes were used
  const searchModes = new Set<string>();
  for (const r of results) {
    searchModes.add(r.scoreType);
  }

  // Collect unique entity references from results for enrichment
  const entityRefs = new Map<string, { entityType: string; entityId: string }>();
  for (const r of results) {
    if (r.entityType && r.entityId) {
      const key = `${r.entityType}:${r.entityId}`;
      if (!entityRefs.has(key)) {
        entityRefs.set(key, { entityType: r.entityType, entityId: r.entityId });
      }
    }
  }

  // Enrich top N unique entities with full context
  const entitiesToEnrich = Array.from(entityRefs.values()).slice(0, enrichTopN);
  const entityContexts = await Promise.all(
    entitiesToEnrich.map(({ entityType, entityId }) =>
      getEntityContext(supabase, entityType, entityId),
    ),
  );

  return {
    query,
    results,
    entityContexts,
    metadata: {
      totalResults: results.length,
      searchDuration: Date.now() - startTime,
      searchModes: Array.from(searchModes),
    },
  };
}
