/** Shared types for intelligence pipeline (Deno edge). */

export type IntelligenceCategory =
  | "investors"
  | "market"
  | "tech"
  | "network"
  | "fundraising_signals"
  | "customer_demand"
  | "regulatory"
  | "talent_org"
  | "ecosystem";

export interface NormalizedItem {
  title: string;
  summary: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  entityHints: string[];
  likelyCategory: IntelligenceCategory;
  likelyEventType: string;
}

export interface EntityRow {
  id: string;
  type: string;
  name: string;
  aliases: string[] | null;
}

export interface ScoreComponents {
  confidence: number;
  importance: number;
  relevance: number;
}
