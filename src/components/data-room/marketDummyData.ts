/** Placeholder market intel keyed off the founder's primary sector. Replace with live feeds later. */

export type DummyRecentDeal = {
  company: string;
  round: string;
  amount: number;
  date: string;
  lead: string;
};

export type DummyInvestor = {
  name: string;
  domain: string;
  deals: number;
  deployed: number;
};

export type DummyQuarter = {
  quarter: string;
  deals: number;
  amount: number;
};

export type DummyCagrPoint = {
  year: string;
  value: number;
  projected: boolean;
};

export type DummyRecommendation = {
  title: string;
  body: string;
  confidence: number;
};

export type MarketDummySnapshot = {
  totalFunding: number;
  totalFundingDeltaPct: number;
  dealCount12m: number;
  dealCountDeltaPct: number;
  avgDealSize: number;
  medianDealSize: number;
  seedSharePct: number;
  growthSharePct: number;
  cagrPct: number;
  activity: DummyQuarter[];
  recentDeals: DummyRecentDeal[];
  investors: DummyInvestor[];
  cagrOutlook: DummyCagrPoint[];
  recommendations: DummyRecommendation[];
};

export type DummyCompetitor = {
  name: string;
  status: "Direct" | "Adjacent" | "Incumbent";
  overlap: number;
  funding: number;
  lastRound: string;
  employees: number;
  positioning: string;
};

export type DummyMacroPoint = {
  quarter: string;
  value: number;
};

export type DummyMacroSnapshot = {
  fedFundsPct: number;
  fedFundsDelta: number;
  dryPowder: number;
  dryPowderDeltaPct: number;
  ipoWindow: "Open" | "Cautious" | "Closed";
  sentiment: number;
  capitalIndex: DummyMacroPoint[];
  notes: DummyRecommendation[];
};

const INVESTORS: DummyInvestor[] = [
  { name: "Andreessen Horowitz", domain: "a16z.com", deals: 0, deployed: 0 },
  { name: "Sequoia Capital", domain: "sequoiacap.com", deals: 0, deployed: 0 },
  { name: "Index Ventures", domain: "indexventures.com", deals: 0, deployed: 0 },
  { name: "Lightspeed Venture Partners", domain: "lsvp.com", deals: 0, deployed: 0 },
  { name: "Greylock", domain: "greylock.com", deals: 0, deployed: 0 },
  { name: "Accel", domain: "accel.com", deals: 0, deployed: 0 },
  { name: "General Catalyst", domain: "generalcatalyst.com", deals: 0, deployed: 0 },
  { name: "Insight Partners", domain: "insightpartners.com", deals: 0, deployed: 0 },
  { name: "Founders Fund", domain: "foundersfund.com", deals: 0, deployed: 0 },
  { name: "Bessemer Venture Partners", domain: "bvp.com", deals: 0, deployed: 0 },
];

const COMPANIES_BY_SECTOR: Record<string, string[]> = {
  Fintech: ["Ledgerly", "Clearpath Pay", "Vaultline", "Railmint", "Underwrite AI", "Floatbase"],
  "Enterprise Software & SaaS": ["Atlar", "Nucleus", "Relaybase", "Clarion", "Workbench", "Northloop"],
  "AI, Data & Analytics": ["Aether Labs", "Prism Agents", "Nexus Cognition", "Lumenforge", "Vectorlane", "Helix Run"],
  "HealthTech, Biotech & Life Sciences": ["Nura Health", "Genomark", "Pulsewell", "Longevix", "SynapseRx", "Vitalgrid"],
  "Consumer, E‑commerce & CPG": ["Shopnest", "Cartline", "Playforge", "Socialcart", "Adstack", "RetailOS"],
  "Climate, Energy & Sustainability": ["Gridspan", "Carbonfold", "Helios Storage", "Circuity", "AquaYield", "Voltpath"],
  "Mobility, Transportation & Logistics": ["Haulstack", "Laneform", "Fleetmint", "Lastmile AI", "Routeline", "CargoOS"],
  "IndustrialTech, Manufacturing & Robotics": ["ForgeOS", "Linewise", "Kinetix", "Plantform", "Torque Labs", "Yieldpath"],
  "PropTech & Construction Tech": ["Buildline", "Siteflow", "ParcelOS", "Formwork AI", "Hearth Grid", "Lotwise"],
  "Cybersecurity & Privacy": ["Aegis Cloud", "Vaultkey", "Threatlane", "Zeroform", "Ciphergrid", "Sentinel Ops"],
  "Media, Gaming & Creator Economy": ["Playforge", "Streamnest", "CreatorOS", "Clipstack", "AudienceLab", "Stagewire"],
  "Web3, Crypto & DeFi": ["Railmint", "Vaultline", "Onchain Kit", "Ledgerly", "RWA Desk", "Nodeharbor"],
  "EdTech & Future of Work": ["Skillpath", "Cohortly", "Workspan", "Lessonforge", "Talentgrid", "Upskill AI"],
  "GovTech, Defense & Space": ["Aegis Dual", "Civicloop", "Droneveil", "Orbital Rail", "Publicstack", "Harbor UAV"],
  "Marketing, Sales & Retail Infrastructure": ["Pipeline AI", "RetailOS", "Attribution Hub", "Quotaform", "Shelfwise", "Demandline"],
  // Older taxonomy labels still present on some profiles
  "Construction & Real Estate": ["Buildline", "Siteflow", "ParcelOS", "Formwork AI", "Hearth Grid", "Lotwise"],
  "Industrial & Manufacturing": ["ForgeOS", "Linewise", "Kinetix", "Plantform", "Torque Labs", "Yieldpath"],
  "Artificial Intelligence": ["Aether Labs", "Prism Agents", "Nexus Cognition", "Lumenforge", "Vectorlane", "Helix Run"],
  "Health & Biotech": ["Nura Health", "Genomark", "Pulsewell", "Longevix", "SynapseRx", "Vitalgrid"],
  "Consumer & Retail": ["Shopnest", "Cartline", "Playforge", "Socialcart", "Adstack", "RetailOS"],
  "Deep Tech & Space": ["Orbital Rail", "Qubitworks", "Photonix", "Satlink", "Waferlab", "Aperture"],
  "Defense & GovTech": ["Aegis Dual", "Civicloop", "Droneveil", "Sentinel Ops", "Publicstack", "Harbor UAV"],
};

const DEFAULT_COMPANIES = ["Northstar", "Lumen", "Harbor", "Atlas", "Vesper", "Kinetic"];
const ROUNDS = ["Seed", "Series A", "Series B", "Series C"] as const;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRange(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

function formatDealDate(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function lastEightQuarters(): string[] {
  const now = new Date();
  const labels: string[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    labels.unshift(`Q${q} ${String(y).slice(2)}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return labels;
}

export function formatUsdCompact(n: number): string {
  const abs = Math.abs(n);
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (abs >= 1_000_000_000) return `$${trim(n / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `$${trim(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function formatPct(n: number, digits = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function buildMarketDummySnapshot(
  sector: string,
  stage: string,
  subsectors: string[],
): MarketDummySnapshot {
  const key = sector.trim() || "Unclassified";
  const rand = mulberry32(hashString(key.toLowerCase()));
  const wedge = subsectors[0]?.trim() || key;
  const stageLabel = stage.trim() || "Seed";

  const companies = COMPANIES_BY_SECTOR[key] ?? DEFAULT_COMPANIES;
  const investorPool = [...INVESTORS];
  for (let i = investorPool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [investorPool[i], investorPool[j]] = [investorPool[j], investorPool[i]];
  }

  const totalFunding = roundTo(pickRange(rand, 4.2e9, 28e9), 1e8);
  const totalFundingDeltaPct = pickRange(rand, 6, 28);
  const dealCount12m = Math.round(pickRange(rand, 180, 640));
  const dealCountDeltaPct = pickRange(rand, -4, 24);
  const avgDealSize = roundTo(pickRange(rand, 8e6, 42e6), 1e5);
  const medianDealSize = roundTo(avgDealSize * pickRange(rand, 0.55, 0.78), 1e5);
  const seedSharePct = pickRange(rand, 38, 62);
  const cagrPct = pickRange(rand, 12.4, 31.8);

  const activity: DummyQuarter[] = lastEightQuarters().map((quarter, i) => {
    const wave = 0.72 + i * 0.05 + (rand() - 0.5) * 0.18;
    return {
      quarter,
      deals: Math.round(dealCount12m / 8 * wave),
      amount: roundTo((totalFunding / 8) * wave * 0.22, 1e7),
    };
  });

  const recentDeals: DummyRecentDeal[] = companies.map((company, i) => {
    const round = ROUNDS[Math.min(i % ROUNDS.length, ROUNDS.length - 1)];
    const amount =
      round === "Seed"
        ? roundTo(pickRange(rand, 3.5e6, 12e6), 1e5)
        : round === "Series A"
          ? roundTo(pickRange(rand, 14e6, 38e6), 1e5)
          : round === "Series B"
            ? roundTo(pickRange(rand, 40e6, 95e6), 1e5)
            : roundTo(pickRange(rand, 110e6, 240e6), 1e6);
    return {
      company,
      round,
      amount,
      date: formatDealDate(i + 1),
      lead: investorPool[i % investorPool.length].name,
    };
  });

  const investors: DummyInvestor[] = investorPool.slice(0, 6).map((inv, i) => {
    const deals = Math.round(pickRange(rand, 8, 28) - i * 2.1);
    return {
      ...inv,
      deals: Math.max(4, deals),
      deployed: roundTo(deals * avgDealSize * pickRange(rand, 0.7, 1.4), 1e6),
    };
  }).sort((a, b) => b.deals - a.deals);

  const baseSize = totalFunding / 1e9 * 0.35;
  const cagrOutlook: DummyCagrPoint[] = [2022, 2023, 2024, 2025, 2026, 2027, 2028].map((year, i) => {
    const growth = Math.pow(1 + cagrPct / 100, i);
    return {
      year: String(year),
      value: Number((baseSize * growth).toFixed(1)),
      projected: year >= 2026,
    };
  });

  const topInvestor = investors[0];
  const runnerUp = investors[1];

  const recommendations: DummyRecommendation[] = [
    {
      title: "Active deployers",
      body: `${topInvestor.name} and ${runnerUp.name} led the most ${key} rounds in the last 12 months. Sequence outreach to partners covering ${wedge} before the next ${stageLabel} close.`,
      confidence: Math.round(pickRange(rand, 82, 94)),
    },
    {
      title: "Round timing",
      body: `Deal count is ${formatPct(dealCountDeltaPct)} vs. the prior year, with median checks at ${formatUsdCompact(medianDealSize)}. ${stageLabel} processes in ${key} are moving in 6–9 weeks when the wedge is ${wedge}.`,
      confidence: Math.round(pickRange(rand, 74, 88)),
    },
    {
      title: "Category CAGR",
      body: `${key} is tracking a ${cagrPct.toFixed(1)}% CAGR through 2028. Frame TAM around ${wedge} rather than the parent category — that's where the ${formatUsdCompact(totalFunding)} of trailing funding is concentrating.`,
      confidence: Math.round(pickRange(rand, 78, 91)),
    },
  ];

  return {
    totalFunding,
    totalFundingDeltaPct,
    dealCount12m,
    dealCountDeltaPct,
    avgDealSize,
    medianDealSize,
    seedSharePct,
    growthSharePct: 100 - seedSharePct,
    cagrPct,
    activity,
    recentDeals,
    investors,
    cagrOutlook,
    recommendations,
  };
}

const COMPETITOR_STATUSES: DummyCompetitor["status"][] = ["Direct", "Direct", "Adjacent", "Incumbent", "Adjacent", "Direct"];

export function buildCompetitorDummySnapshot(
  sector: string,
  namedCompetitors: string[],
): DummyCompetitor[] {
  const key = sector.trim() || "Unclassified";
  const rand = mulberry32(hashString(`competitors:${key.toLowerCase()}`));
  const pool = COMPANIES_BY_SECTOR[key] ?? DEFAULT_COMPANIES;
  const named = namedCompetitors.map((n) => n.trim()).filter(Boolean);
  const names = [...named];
  for (const company of pool) {
    if (names.length >= 6) break;
    if (!names.some((n) => n.toLowerCase() === company.toLowerCase())) names.push(company);
  }

  return names.slice(0, 6).map((name, i) => {
    const status = COMPETITOR_STATUSES[i % COMPETITOR_STATUSES.length];
    const lastRound = ROUNDS[Math.min(i % ROUNDS.length, ROUNDS.length - 1)];
    return {
      name,
      status,
      overlap: Math.round(pickRange(rand, 38, 92)),
      funding: roundTo(
        lastRound === "Seed"
          ? pickRange(rand, 6e6, 18e6)
          : lastRound === "Series A"
            ? pickRange(rand, 22e6, 55e6)
            : lastRound === "Series B"
              ? pickRange(rand, 70e6, 160e6)
              : pickRange(rand, 180e6, 420e6),
        1e5,
      ),
      lastRound,
      employees: Math.round(pickRange(rand, 18, 420)),
      positioning:
        status === "Direct"
          ? `Closest overlap on ${key.toLowerCase()} buyers and pricing motion.`
          : status === "Incumbent"
            ? `Legacy budget holder; slower to ship, stronger distribution.`
            : `Partial overlap — competes on a wedge of the same workflow.`,
    };
  });
}

export function buildMacroDummySnapshot(sector: string): DummyMacroSnapshot {
  const key = sector.trim() || "Unclassified";
  const rand = mulberry32(hashString(`macro:${key.toLowerCase()}`));
  const fedFundsPct = pickRange(rand, 3.4, 5.1);
  const fedFundsDelta = pickRange(rand, -0.75, 0.25);
  const dryPowder = roundTo(pickRange(rand, 280e9, 520e9), 1e9);
  const dryPowderDeltaPct = pickRange(rand, -8, 14);
  const sentiment = Math.round(pickRange(rand, 42, 78));
  const ipoWindow: DummyMacroSnapshot["ipoWindow"] =
    sentiment >= 66 ? "Open" : sentiment >= 52 ? "Cautious" : "Closed";

  const capitalIndex: DummyMacroPoint[] = lastEightQuarters().map((quarter, i) => ({
    quarter,
    value: Number((48 + i * 3.2 + (rand() - 0.5) * 8).toFixed(1)),
  }));

  return {
    fedFundsPct,
    fedFundsDelta,
    dryPowder,
    dryPowderDeltaPct,
    ipoWindow,
    sentiment,
    capitalIndex,
    notes: [
      {
        title: "Rate path",
        body: `Policy rates are ${fedFundsPct.toFixed(2)}% (${formatPct(fedFundsDelta)} vs prior year). ${key} rounds are still clearing when the story is capital-efficient rather than growth-at-all-costs.`,
        confidence: Math.round(pickRange(rand, 76, 90)),
      },
      {
        title: "Dry powder",
        body: `An estimated ${formatUsdCompact(dryPowder)} sits undeployed in VC. ${ipoWindow === "Open" ? "The exit window is open enough that growth funds are competing for category leaders." : ipoWindow === "Cautious" ? "IPO/M&A is selective — late-stage buyers want proof of durability." : "Exits are constrained; expect longer holds and tighter late-stage pricing."}`,
        confidence: Math.round(pickRange(rand, 72, 88)),
      },
      {
        title: "Sector beta",
        body: `Macro sentiment for ${key} is ${sentiment}/100. Lead with a 18–24 month runway plan and a wedge that still works if check sizes compress another 10–15%.`,
        confidence: Math.round(pickRange(rand, 70, 86)),
      },
    ],
  };
}
