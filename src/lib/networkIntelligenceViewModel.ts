/**
 * Presentational / demo metrics for Settings → Network (SensorSuiteGrid).
 * Centralizes copy and derived numbers so JSX stays thin.
 * TODO: Replace derivations with API fields when intro-graph + opportunity APIs exist.
 */

export const NETWORK_INTELLIGENCE_COPY = {
  headerTitle: "Your Network Intelligence",
  headerSubtitle: "Turn your network into warm introductions and outcomes",
  accessProgressLabel: "Access to high-probability intros",
  dataSourcesTitle: "Your Data Sources",
  dataSourcesSubtitle: "Each source strengthens your network and unlocks better intro paths",
  unlockSectionTitle: "Unlock More Access",
  liveOpportunitiesTitle: "Live Opportunities",
  networkMapTitle: "Your Network Map",
  networkMapSubtitle: "See how your network reaches target investors",
} as const;

export type NetworkSourceFlags = {
  totalConnected: number;
  google: boolean;
  linkedin: boolean;
  notion: boolean;
};

export type NetworkIntelligenceHeaderModel = {
  scoreOutOf100: number;
  accessProgressPercent: number;
  statChips: readonly { value: string; label: string }[];
};

export function buildNetworkIntelligenceHeader(flags: NetworkSourceFlags): NetworkIntelligenceHeaderModel {
  const n = flags.totalConnected;
  const base = 18 + n * 7;
  const bonus = (flags.google ? 14 : 0) + (flags.linkedin ? 14 : 0) + (flags.notion ? 4 : 0);
  const scoreOutOf100 = Math.min(100, base + bonus);
  const accessProgressPercent = Math.min(100, Math.round(scoreOutOf100 * 0.92));

  const reachable =
    32 + n * 6 + (flags.linkedin ? 38 : 0) + (flags.google ? 12 : 0) + (flags.notion ? 5 : 0);
  const introPaths = Math.max(1, Math.min(24, 2 + n * 2 + (flags.linkedin ? 4 : 0) + (flags.google ? 2 : 0)));
  const weeklyOpps = Math.max(0, Math.min(12, (flags.google ? 2 : 0) + (flags.linkedin ? 2 : 0) + Math.floor(n / 2)));

  return {
    scoreOutOf100,
    accessProgressPercent,
    statChips: [
      { value: String(Math.min(200, reachable)), label: "Reachable investors" },
      { value: String(introPaths), label: "High-probability intro paths" },
      { value: String(Math.max(weeklyOpps, n > 0 ? 1 : 0)), label: "Opportunities this week" },
    ],
  };
}

function parseStatNumber(stats: { label: string; value: string }[], labelIncludes: string, fallback: number): number {
  const row = stats.find((s) => s.label.toLowerCase().includes(labelIncludes.toLowerCase()));
  if (!row) return fallback;
  const n = parseInt(String(row.value).replace(/,/g, "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export type OutcomePresentation = {
  outcomeLines: readonly { text: string }[];
  lastInteractionLine: string | null;
  primaryCta: { label: string; navigate: "connections" | "network" | "network-workspace" };
};

function formatRelativeInteraction(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Last meaningful interaction: Just now";
  if (mins < 60) return `Last meaningful interaction: ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `Last meaningful interaction: ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `Last meaningful interaction: ${days} day${days === 1 ? "" : "s"} ago`;
}

export function getIntegrationOutcomePresentation(
  key: string,
  connectedStats: { label: string; value: string }[],
  lastSyncedIso: string | null,
): OutcomePresentation | null {
  if (key === "google") {
    const threads = parseStatNumber(connectedStats, "thread", 142);
    const vc = parseStatNumber(connectedStats, "vc", 47);
    const strongRel = Math.max(12, Math.min(48, Math.round(threads * 0.162)));
    const warmPaths = Math.max(4, Math.min(24, Math.round(vc * 0.17)));
    return {
      outcomeLines: [
        { text: `${strongRel} strong relationships identified` },
        { text: `${warmPaths} warm intro paths unlocked` },
      ],
      lastInteractionLine: formatRelativeInteraction(lastSyncedIso),
      primaryCta: { label: "View Relationships", navigate: "connections" },
    };
  }
  if (key === "linkedin") {
    const conns = parseStatNumber(connectedStats, "connection", 312);
    const mutual = parseStatNumber(connectedStats, "mutual", 7);
    const reachable = Math.max(8, Math.min(120, Math.round(conns * 0.045) + mutual * 2));
    const warmPaths = Math.max(3, Math.min(24, mutual + Math.round(conns * 0.015)));
    const connectors = Math.max(2, Math.min(20, mutual + Math.round(conns * 0.008)));
    return {
      outcomeLines: [
        { text: `${reachable} reachable investors` },
        { text: `${warmPaths} warm intro paths` },
        { text: `${connectors} high-quality mutual connectors` },
      ],
      lastInteractionLine: formatRelativeInteraction(lastSyncedIso),
      primaryCta: { label: "View Paths", navigate: "connections" },
    };
  }
  return null;
}

export type LiveOpportunityItem = {
  id: string;
  headline: string;
  targetLabel: string;
  pathSummary: string;
  confidencePercent: number;
  whyLines: readonly string[];
};

export function buildLiveOpportunities(flags: NetworkSourceFlags): LiveOpportunityItem[] {
  const hasSignal = flags.google || flags.linkedin;
  if (!hasSignal) return [];

  return [
    {
      id: "opp-1",
      headline: "You should reach out this week",
      targetLabel: "Partner @ Sequoia",
      pathSummary: "You → Sarah → Partner",
      confidencePercent: 72,
      whyLines: ["Sarah meets this partner monthly", "You spoke with Sarah 2 weeks ago"],
    },
    {
      id: "opp-2",
      headline: "Warm path resurfaced",
      targetLabel: "Principal @ Benchmark",
      pathSummary: "You → James → Principal",
      confidencePercent: 64,
      whyLines: ["Shared portfolio company in 2024", "James accepted your intro request before"],
    },
    {
      id: "opp-3",
      headline: "Timing signal",
      targetLabel: "GP @ First Round",
      pathSummary: "You → Alex → GP",
      confidencePercent: 58,
      whyLines: ["They posted about your sector yesterday", "Alex is a 1st-degree connection"],
    },
  ];
}

export type UnlockAccessCard = {
  key: string;
  title: string;
  benefit: string;
};

const UNLOCK_DEFS: UnlockAccessCard[] = [
  {
    key: "googlemeet",
    title: "Calendar & Meet",
    benefit: "Verify real meetings → stronger trust scores",
  },
  {
    key: "zoom",
    title: "Zoom",
    benefit: "Confirm calls → increase intro success probability",
  },
  {
    key: "twitter",
    title: "X (Twitter)",
    benefit: "Track activity → better timing signals",
  },
  {
    key: "notion",
    title: "Notion",
    benefit: "Extract intro opportunities from notes and conversations",
  },
];

export function buildUnlockAccessCards(connected: Record<string, boolean>): UnlockAccessCard[] {
  return UNLOCK_DEFS.filter((d) => !connected[d.key]);
}
