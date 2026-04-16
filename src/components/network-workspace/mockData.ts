import type {
  IntroPath,
  IntroducerProfile,
  IntroRequest,
  NetworkOverviewMetrics,
  ReachablePerson,
  RelationshipSignal,
} from "./types";

const path = (hops: { name: string; role?: string; firm?: string }[], score: number, tags: string[]): IntroPath => ({
  id: `path-${hops.map((h) => h.name).join("-")}`,
  hops: hops.map((h, i) => ({
    id: `hop-${i}-${h.name}`,
    displayName: h.name,
    role: h.role ?? null,
    firmName: h.firm ?? null,
  })),
  score,
  confidence: Math.min(0.97, 0.55 + score / 200),
  reasonTags: tags,
  summary: tags.join(" · "),
});

export const mockOverviewMetrics: NetworkOverviewMetrics = {
  reachableInvestors: 128,
  reachableOperators: 44,
  bestWarmPathsThisWeek: 19,
  pendingIntroRequests: 6,
  newRelationshipSignals: 12,
};

export const mockReachablePeople: ReachablePerson[] = [
  {
    id: "p-1",
    fullName: "Jordan Lee",
    role: "Partner",
    firmName: "Northline Ventures",
    category: "investor",
    hop: "2-hop",
    bestPath: path(
      [
        { name: "You", role: "Founder" },
        { name: "Sarah Kim", role: "Advisor", firm: "Acme Labs" },
        { name: "Jordan Lee", role: "Partner", firm: "Northline Ventures" },
      ],
      88,
      ["Shared portfolio company", "Warm email thread", "High mutual trust"],
    ),
    alternatePaths: [
      path(
        [
          { name: "You" },
          { name: "Alex Rivera", firm: "Cloudsmith" },
          { name: "Jordan Lee", role: "Partner", firm: "Northline Ventures" },
        ],
        72,
        ["Conference co-attendance"],
      ),
    ],
    evidenceLines: ["Sarah introduced 3 founders to Northline in the last 18 months."],
    recentSignalSummary: "Sarah commented on Jordan’s LinkedIn post last week.",
    lastSignalAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    fitRelevance: 91,
  },
  {
    id: "p-2",
    fullName: "Morgan Patel",
    role: "Principal",
    firmName: "Harbor Stack",
    category: "investor",
    hop: "direct",
    bestPath: path(
      [
        { name: "You", role: "Founder" },
        { name: "Morgan Patel", role: "Principal", firm: "Harbor Stack" },
      ],
      94,
      ["Direct connection", "Recent Zoom", "Stage fit: Seed"],
    ),
    evidenceLines: ["You met at Founder Summit — follow-up thread open."],
    lastSignalAt: new Date(Date.now() - 86400000).toISOString(),
    fitRelevance: 88,
  },
  {
    id: "p-3",
    fullName: "Riley Chen",
    role: "Fractional CFO",
    firmName: "Independent",
    category: "operator",
    hop: "3-hop",
    bestPath: path(
      [
        { name: "You" },
        { name: "Jamie Wu", role: "CEO", firm: "Stacklift" },
        { name: "Casey Ng", role: "BD", firm: "Meridian" },
        { name: "Riley Chen", role: "Fractional CFO" },
      ],
      61,
      ["Operator network density", "Operator–founder pattern"],
    ),
    recentSignalSummary: "Casey shared a cap table template Riley authored.",
    lastSignalAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    fitRelevance: 62,
  },
  {
    id: "p-4",
    fullName: "Taylor Brooks",
    role: "Head of Corp Dev",
    firmName: "Orbit Systems",
    category: "customer",
    hop: "2-hop",
    bestPath: path(
      [{ name: "You" }, { name: "Devon Avery", firm: "Pilotworks" }, { name: "Taylor Brooks", firm: "Orbit Systems" }],
      79,
      ["Pilotworks–Orbit vendor relationship", "Warm Slack intro"],
    ),
    fitRelevance: 74,
  },
];

export const mockIntroducers: IntroducerProfile[] = [
  {
    id: "i-1",
    fullName: "Sarah Kim",
    role: "Advisor",
    firmName: "Acme Labs",
    reachableTargetCount: 34,
    strongestCategories: ["investor", "founder"],
    recentActivitySummary: "4 warm paths activated in the last 14 days.",
    introEffectivenessScore: 86,
  },
  {
    id: "i-2",
    fullName: "Alex Rivera",
    role: "CEO",
    firmName: "Cloudsmith",
    reachableTargetCount: 21,
    strongestCategories: ["investor", "operator"],
    recentActivitySummary: "Re-engaged with 2 funds you care about.",
    introEffectivenessScore: 79,
  },
  {
    id: "i-3",
    fullName: "Jamie Wu",
    role: "CEO",
    firmName: "Stacklift",
    reachableTargetCount: 16,
    strongestCategories: ["founder", "customer"],
    recentActivitySummary: "Shared diligence room with 1 target investor.",
    introEffectivenessScore: null,
  },
];

export const mockIntroRequests: IntroRequest[] = [
  {
    id: "r-1",
    targetName: "Jordan Lee",
    targetFirm: "Northline Ventures",
    viaIntroducerName: "Sarah Kim",
    status: "pending",
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "r-2",
    targetName: "Morgan Patel",
    targetFirm: "Harbor Stack",
    viaIntroducerName: "You (direct)",
    status: "draft",
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    notes: "Draft intro — emphasize traction in healthcare infra.",
  },
  {
    id: "r-3",
    targetName: "Chris Avery",
    targetFirm: "Fieldline Capital",
    viaIntroducerName: "Alex Rivera",
    status: "sent",
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "r-4",
    targetName: "Sam Ortiz",
    targetFirm: "Bluecanoe",
    viaIntroducerName: "Jamie Wu",
    status: "completed",
    updatedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
];

export const mockSignals: RelationshipSignal[] = [
  {
    id: "s-1",
    title: "Target changed role",
    detail: "Jordan Lee was promoted to Partner at Northline Ventures.",
    occurredAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    severity: "high",
    relatedPersonIds: ["p-1"],
  },
  {
    id: "s-2",
    title: "Intermediary ↔ target activity",
    detail: "Sarah Kim and Jordan Lee exchanged messages on LinkedIn after your last meeting.",
    occurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    severity: "medium",
    relatedPersonIds: ["p-1", "i-1"],
  },
  {
    id: "s-3",
    title: "Relevant investment",
    detail: "Northline Ventures led a Seed in adjacent infra — thesis overlap with your deck.",
    occurredAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    severity: "medium",
  },
  {
    id: "s-4",
    title: "Mutual contact re-engaged",
    detail: "Alex Rivera accepted a calendar invite with Morgan Patel.",
    occurredAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    severity: "low",
  },
];
