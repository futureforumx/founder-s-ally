import { supabase } from "@/integrations/supabase/client";

export type IntelligenceEntityRef = { id: string; type: string; name: string; role?: string };

export type IntelligenceFeedEvent = {
  id: string;
  event_type: string;
  category: string;
  title: string;
  summary: string;
  why_it_matters: string;
  confidence_score: number;
  importance_score: number;
  relevance_score: number;
  sentiment: string | null;
  first_seen_at: string;
  last_seen_at: string;
  canonical_source_url: string | null;
  source_count: number;
  metadata: Record<string, unknown>;
  entities?: IntelligenceEntityRef[];
  saved?: boolean;
  rank?: number;
};

export type IntelligenceSummaryStrip = {
  highSignal24h: number;
  investorActivity: number;
  competitorMoves: number;
  peopleMoves: number;
  newFunds: number;
  productLaunches: number;
  regulatory: number;
};

/** Shown when the edge function is missing or errors (e.g. local dev with Supabase env but no deploy). */
export const INTELLIGENCE_FALLBACK_EVENTS: IntelligenceFeedEvent[] = [
  {
    id: "fallback-e1",
    event_type: "new_investment_made",
    category: "investors",
    title: "Northline leads LatticeMind Series A (offline preview)",
    summary:
      "Demo card: deploy `intelligence-feed` and run the intelligence migration to load live data from your project.",
    why_it_matters:
      "You are seeing a local fallback because the feed API did not return data — wiring is fine; connect backend next.",
    confidence_score: 0.85,
    importance_score: 0.82,
    relevance_score: 0.78,
    sentiment: "neutral",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    canonical_source_url: null,
    source_count: 1,
    metadata: { fallback: true },
    entities: [
      { id: "fb-1", type: "fund", name: "Northline Ventures" },
      { id: "fb-2", type: "company", name: "LatticeMind AI" },
    ],
    saved: false,
    rank: 0.82,
  },
  {
    id: "fallback-e2",
    event_type: "pricing_changed",
    category: "market",
    title: "Helio Security revamps enterprise pricing (offline preview)",
    summary: "Second demo event so the feed never looks empty while you finish Supabase setup.",
    why_it_matters: "Same UX as production: category chips, entities, and actions all work against fallback rows.",
    confidence_score: 0.77,
    importance_score: 0.78,
    relevance_score: 0.8,
    sentiment: "neutral",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    canonical_source_url: null,
    source_count: 2,
    metadata: { fallback: true },
    entities: [{ id: "fb-3", type: "company", name: "Helio Security" }],
    saved: false,
    rank: 0.78,
  },
  {
    id: "fallback-e3",
    event_type: "product_launched",
    category: "tech",
    title: "OpenPipe ships realtime eval harness (offline preview)",
    summary: "Demo tech-category card for the Tech tab when the API is offline.",
    why_it_matters: "Confirms tab filters work before your pipeline is connected.",
    confidence_score: 0.84,
    importance_score: 0.72,
    relevance_score: 0.76,
    sentiment: "positive",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    canonical_source_url: null,
    source_count: 1,
    metadata: { fallback: true },
    entities: [{ id: "fb-4", type: "company", name: "OpenPipe Labs" }],
    saved: false,
    rank: 0.77,
  },
  {
    id: "fallback-e4",
    event_type: "executive_departed",
    category: "network",
    title: "VP Engineering transition (offline preview)",
    summary: "Demo network-category card for people and org signals.",
    why_it_matters: "Use this to validate Network tab layout before live people-move data flows in.",
    confidence_score: 0.79,
    importance_score: 0.7,
    relevance_score: 0.73,
    sentiment: "neutral",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    canonical_source_url: null,
    source_count: 1,
    metadata: { fallback: true },
    entities: [
      { id: "fb-5", type: "person", name: "Morgan Patel" },
      { id: "fb-6", type: "company", name: "Helio Security" },
    ],
    saved: false,
    rank: 0.74,
  },
];

export const INTELLIGENCE_FALLBACK_SIDE_RAIL = {
  trendingInvestors: [{ id: "fb-t1", name: "Northline Ventures", type: "fund" }],
  newFunds: [{ id: "fb-t2", name: "Cedar Grove Capital", type: "fund" }],
  peopleMoves: [{ id: "fb-t3", name: "Jordan Lee", type: "investor" }],
  risingTopics: ["Deploy edge functions", "Run DB migration", "Clerk JWT → Supabase"],
};

export function filterFallbackEvents(
  category: string | null | undefined,
  events: IntelligenceFeedEvent[],
): IntelligenceFeedEvent[] {
  if (!category || category === "all") return events;
  return events.filter((e) => e.category === category);
}

export async function fetchIntelligenceFeed(params: {
  category?: string | null;
  watchlistOnly?: boolean;
  highSignalOnly?: boolean;
  hours?: number;
  entityType?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{
  events: IntelligenceFeedEvent[];
  sideRail: {
    trendingInvestors: { id: string; name: string; type: string }[];
    newFunds: { id: string; name: string; type: string }[];
    peopleMoves: { id: string; name: string; type: string }[];
    risingTopics: string[];
  };
}> {
  const { data, error } = await supabase.functions.invoke("intelligence-feed", {
    body: {
      action: "feed",
      category: params.category === "all" ? null : params.category,
      watchlistOnly: params.watchlistOnly,
      highSignalOnly: params.highSignalOnly,
      hours: params.hours,
      entityType: params.entityType,
      search: params.search,
      limit: params.limit,
      offset: params.offset,
    },
  });
  if (error) throw error;
  const payload = data as { events?: IntelligenceFeedEvent[]; sideRail?: unknown; error?: string };
  if (payload?.error) throw new Error(payload.error);
  return {
    events: payload.events || [],
    sideRail: (payload.sideRail as {
      trendingInvestors: { id: string; name: string; type: string }[];
      newFunds: { id: string; name: string; type: string }[];
      peopleMoves: { id: string; name: string; type: string }[];
      risingTopics: string[];
    }) || {
      trendingInvestors: [],
      newFunds: [],
      peopleMoves: [],
      risingTopics: [],
    },
  };
}

export async function fetchIntelligenceSummary(params: { hours?: number }): Promise<IntelligenceSummaryStrip> {
  const { data, error } = await supabase.functions.invoke("intelligence-feed", {
    body: { action: "summary", hours: params.hours ?? 24 },
  });
  if (error) throw error;
  const payload = data as { summary?: IntelligenceSummaryStrip; error?: string };
  if (payload?.error) throw new Error(payload.error);
  return (
    payload.summary || {
      highSignal24h: 0,
      investorActivity: 0,
      competitorMoves: 0,
      peopleMoves: 0,
      newFunds: 0,
      productLaunches: 0,
      regulatory: 0,
    }
  );
}

export async function intelligenceAction(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke("intelligence-feed", {
    body,
  });
  if (error) throw error;
  const payload = data as { error?: string };
  if (payload?.error) throw new Error(payload.error);
}
