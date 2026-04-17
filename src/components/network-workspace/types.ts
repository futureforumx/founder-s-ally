/** Relationship hop distance from the current user to a target in the graph. */
export type RelationshipHop = "direct" | "2-hop" | "3-hop";

/** High-level bucket for a reachable node (extend as product grows). */
export type ReachablePersonCategory =
  | "investor"
  | "founder"
  | "operator"
  | "customer"
  | "advisor"
  | "other";

export type IntroRequestStatus =
  | "draft"
  | "sent"
  | "pending"
  | "accepted"
  | "declined"
  | "completed";

/** Single hop on an intro path (future API: graph edge + node projection). */
export interface PathHop {
  id: string;
  displayName: string;
  role?: string | null;
  firmName?: string | null;
}

/** Scored intro path (future API: path ranking service). */
export interface IntroPath {
  id: string;
  hops: PathHop[];
  score: number;
  /** 0–1 confidence from signals / evidence aggregation. */
  confidence?: number;
  reasonTags: string[];
  summary?: string;
}

/** Person reachable via the relationship graph (mock / future `GET /graph/reachable`). */
export interface ReachablePerson {
  id: string;
  fullName: string;
  role: string;
  firmName: string;
  category: ReachablePersonCategory;
  hop: RelationshipHop;
  bestPath: IntroPath;
  alternatePaths?: IntroPath[];
  /** Short evidence strings (recent co-attendance, mutual deals, etc.). */
  evidenceLines?: string[];
  recentSignalSummary?: string | null;
  /** ISO date of last meaningful interaction signal. */
  lastSignalAt?: string | null;
  /** 0–100 when graph service ranks thesis / stage / sector fit (optional). */
  fitRelevance?: number | null;
  /** 0–100 relationship warmth from signals + recency (optional). */
  warmth?: number | null;
}

/** Primary action for detail panel — from graph readiness rules. */
export type NetworkReadinessAction = "request_intro" | "strengthen_relationship" | "find_connector";

export type NetworkQuickFilter =
  | "warmest"
  | "investors"
  | "customers"
  | "one_hop"
  | "high_confidence"
  | "recent_active";

/** Top-level tabs inside the Network (relationship execution) workspace. */
export type NetworkWorkspaceTabId =
  | "overview"
  | "people"
  | "introducers"
  | "requests"
  | "signals"
  | "graph";

/** Ranked intermediary (future API: connector scoring). */
export interface IntroducerProfile {
  id: string;
  fullName: string;
  role: string;
  firmName: string;
  reachableTargetCount: number;
  strongestCategories: ReachablePersonCategory[];
  recentActivitySummary: string;
  /** 0–100 placeholder until backend ships effectiveness model. */
  introEffectivenessScore: number | null;
}

export interface IntroRequest {
  id: string;
  targetName: string;
  targetFirm?: string | null;
  viaIntroducerName: string;
  status: IntroRequestStatus;
  updatedAt: string;
  notes?: string | null;
}

export interface RelationshipSignal {
  id: string;
  title: string;
  detail: string;
  /** ISO timestamp */
  occurredAt: string;
  severity: "low" | "medium" | "high";
  relatedPersonIds?: string[];
}

export interface NetworkOverviewMetrics {
  reachableInvestors: number;
  reachableOperators: number;
  bestWarmPathsThisWeek: number;
  pendingIntroRequests: number;
  newRelationshipSignals: number;
}
