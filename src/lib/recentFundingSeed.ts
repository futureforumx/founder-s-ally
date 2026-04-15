/**
 * Curated recent funding rounds for the in-app Funding tab.
 * Rows are synthesized from public announcements; primary inspiration for coverage
 * and layout: https://startups.gallery/news
 */
export type RecentFundingRound = {
  id: string;
  companyName: string;
  /** startups.gallery path segment under `/companies/`; defaults from `companyName` when omitted. */
  companyGallerySlug?: string | null;
  websiteUrl: string;
  /** Industry / vertical (e.g. DevTools, Fintech). */
  sector: string;
  roundKind: string;
  amountLabel: string;
  announcedAt: string;
  leadInvestor: string;
  leadWebsiteUrl?: string | null;
  coInvestors: string[];
  sourceUrl: string;
};

/** Slug for https://startups.gallery/companies/{slug} */
export function startupsGalleryCompanySlug(row: RecentFundingRound): string {
  const explicit = row.companyGallerySlug?.trim();
  if (explicit) return explicit;
  return row.companyName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function recentFundingCompanyGalleryHref(row: RecentFundingRound): string {
  return `https://startups.gallery/companies/${startupsGalleryCompanySlug(row)}`;
}

export const RECENT_FUNDING_ROUNDS: RecentFundingRound[] = [
  {
    id: "mintlify-20260414",
    companyName: "Mintlify",
    websiteUrl: "https://www.mintlify.com",
    sector: "DevTools",
    roundKind: "Series B",
    amountLabel: "$45M",
    announcedAt: "2026-04-14",
    leadInvestor: "Andreessen Horowitz",
    leadWebsiteUrl: "https://a16z.com",
    coInvestors: [],
    sourceUrl: "https://www.mintlify.com/blog/series-b",
  },
  {
    id: "bluefish-20260414",
    companyName: "Bluefish",
    websiteUrl: "https://bluefish.com",
    sector: "Productivity",
    roundKind: "Series B",
    amountLabel: "$43M",
    announcedAt: "2026-04-14",
    leadInvestor: "Threshold Ventures",
    leadWebsiteUrl: "https://threshold.vc",
    coInvestors: [],
    sourceUrl: "https://www.finsmes.com/2026/04/bluefish-raises-43m-in-series-b-funding.html",
  },
  {
    id: "slate-20260413",
    companyName: "Slate",
    websiteUrl: "https://slate.auto",
    sector: "Transportation",
    roundKind: "Series C",
    amountLabel: "$650M",
    announcedAt: "2026-04-13",
    leadInvestor: "TWG Global",
    coInvestors: [],
    sourceUrl: "https://techcrunch.com/2026/04/13/slate-auto-raises-650m-to-fund-its-affordable-ev-truck-plans/",
  },
  {
    id: "round-treasury-20260413",
    companyName: "Round Treasury",
    websiteUrl: "https://www.roundtreasury.com",
    sector: "Fintech",
    roundKind: "Seed",
    amountLabel: "$6M",
    announcedAt: "2026-04-13",
    leadInvestor: "Alstin Capital",
    coInvestors: [],
    sourceUrl: "https://www.roundtreasury.com/post/round-raises-6m-to-build-the-ai-powered-finance-automation-platform-for-modern-finance-teams",
  },
  {
    id: "mastra-20260409",
    companyName: "Mastra",
    websiteUrl: "https://mastra.ai",
    sector: "DevTools",
    roundKind: "Series A",
    amountLabel: "$22M",
    announcedAt: "2026-04-09",
    leadInvestor: "Spark Capital",
    leadWebsiteUrl: "https://sparkcapital.com",
    coInvestors: [],
    sourceUrl: "https://mastra.ai/blog/series-a",
  },
  {
    id: "applied-compute-20260409",
    companyName: "Applied Compute",
    websiteUrl: "https://applied.co",
    sector: "AI",
    roundKind: "Venture",
    amountLabel: "$80M",
    announcedAt: "2026-04-09",
    leadInvestor: "Kleiner Perkins",
    leadWebsiteUrl: "https://kleinerperkins.com",
    coInvestors: [],
    sourceUrl: "https://www.binance.com/en/square/post/310523778926369",
  },
  {
    id: "gitbutler-20260408",
    companyName: "GitButler",
    websiteUrl: "https://gitbutler.com",
    sector: "DevTools",
    roundKind: "Series A",
    amountLabel: "$17M",
    announcedAt: "2026-04-08",
    leadInvestor: "Andreessen Horowitz",
    leadWebsiteUrl: "https://a16z.com",
    coInvestors: [],
    sourceUrl: "https://blog.gitbutler.com/series-a",
  },
  {
    id: "avec-20260408",
    companyName: "Avec",
    websiteUrl: "https://avec.com",
    sector: "Productivity",
    roundKind: "Seed",
    amountLabel: "$8.4M",
    announcedAt: "2026-04-08",
    leadInvestor: "Lightspeed Venture Partners",
    leadWebsiteUrl: "https://lsvp.com",
    coInvestors: [],
    sourceUrl: "https://x.com/mignano/status/2041917559595790503",
  },
  {
    id: "atlas-card-20260408",
    companyName: "Atlas Card",
    websiteUrl: "https://atlascard.com",
    sector: "Fintech",
    roundKind: "Venture",
    amountLabel: "$40M",
    announcedAt: "2026-04-08",
    leadInvestor: "Elad Gil",
    coInvestors: [],
    sourceUrl: "https://x.com/ArfurRock/status/2041642548083519809",
  },
  {
    id: "yuzu-20260407",
    companyName: "Yuzu",
    websiteUrl: "https://www.yuzu.health",
    sector: "Healthcare",
    roundKind: "Series A",
    amountLabel: "$35M",
    announcedAt: "2026-04-07",
    leadInvestor: "General Catalyst",
    leadWebsiteUrl: "https://generalcatalyst.com",
    coInvestors: [],
    sourceUrl: "https://www.finsmes.com/2026/04/yuzu-health-raises-35m-in-series-a-funding.html",
  },
  {
    id: "noon-20260401",
    companyName: "Noon",
    websiteUrl: "https://noon.design",
    sector: "Design",
    roundKind: "Seed",
    amountLabel: "$44M",
    announcedAt: "2026-04-01",
    leadInvestor: "Chemistry",
    coInvestors: [],
    sourceUrl: "https://noon.design/announcing-noon",
  },
  {
    id: "sona-20260401",
    companyName: "Sona",
    companyGallerySlug: "sona-ai",
    websiteUrl: "https://www.sona.ai",
    sector: "Productivity",
    roundKind: "Series B",
    amountLabel: "$45M",
    announcedAt: "2026-04-01",
    leadInvestor: "N47",
    coInvestors: [],
    sourceUrl: "https://www.prnewswire.com/news-releases/sona-raises-45m-series-b-to-bring-ai-to-the-frontline-economy-302730478.html",
  },
  {
    id: "valar-atomics-20260401",
    companyName: "Valar Atomics",
    websiteUrl: "https://valaratomics.com",
    sector: "Energy",
    roundKind: "Venture",
    amountLabel: "$450M",
    announcedAt: "2026-04-01",
    leadInvestor: "Snowpoint",
    coInvestors: [],
    sourceUrl: "https://techfundingnews.com/palmer-luckey-backed-valar-atomics-450m-2b-valuation-ai/",
  },
  {
    id: "treeline-20260331",
    companyName: "Treeline",
    websiteUrl: "https://www.treeline.ai",
    sector: "Productivity",
    roundKind: "Series A",
    amountLabel: "$25M",
    announcedAt: "2026-03-31",
    leadInvestor: "Andreessen Horowitz",
    leadWebsiteUrl: "https://a16z.com",
    coInvestors: [],
    sourceUrl: "https://www.finsmes.com/2026/04/treeline-raises-25m-in-series-a-funding.html",
  },
  {
    id: "conductor-20260331",
    companyName: "Conductor",
    websiteUrl: "https://conductor.build",
    sector: "DevTools",
    roundKind: "Series A",
    amountLabel: "$22M",
    announcedAt: "2026-03-31",
    leadInvestor: "Matrix Partners",
    leadWebsiteUrl: "https://www.matrixpartners.com",
    coInvestors: [],
    sourceUrl: "https://x.com/conductor_build/status/2039027752419098704",
  },
  {
    id: "depthfirst-20260331",
    companyName: "depthfirst",
    websiteUrl: "https://depthfirst.com",
    sector: "Cybersecurity",
    roundKind: "Series B",
    amountLabel: "$80M",
    announcedAt: "2026-03-31",
    leadInvestor: "Meritech Capital",
    leadWebsiteUrl: "https://meritechcapital.com",
    coInvestors: [],
    sourceUrl: "https://depthfirst.com/post/series-b-announcement",
  },
  {
    id: "also-20260331",
    companyName: "Also",
    websiteUrl: "https://also.auto",
    sector: "Transportation",
    roundKind: "Series C",
    amountLabel: "$200M",
    announcedAt: "2026-03-31",
    leadInvestor: "Greenoaks",
    leadWebsiteUrl: "https://greenoakscapital.com",
    coInvestors: ["DoorDash"],
    sourceUrl: "https://techcrunch.com/2026/03/31/rivian-spinoff-also-will-build-autonomous-delivery-vehicles-for-doordash/",
  },
  {
    id: "sycamore-20260330",
    companyName: "Sycamore",
    websiteUrl: "https://www.sycamore.ai",
    sector: "AI",
    roundKind: "Seed",
    amountLabel: "$65M",
    announcedAt: "2026-03-30",
    leadInvestor: "Lightspeed Venture Partners",
    leadWebsiteUrl: "https://lsvp.com",
    coInvestors: [],
    sourceUrl: "https://techcrunch.com/2026/03/30/former-coatue-partner-raises-huge-65m-seed-for-enterprise-ai-agent-startup/",
  },
  {
    id: "starcloud-20260330",
    companyName: "Starcloud",
    websiteUrl: "https://starcloud.com",
    sector: "Aerospace",
    roundKind: "Series A",
    amountLabel: "$170M",
    announcedAt: "2026-03-30",
    leadInvestor: "Benchmark",
    leadWebsiteUrl: "https://benchmark.com",
    coInvestors: [],
    sourceUrl: "https://www.425business.com/news/redmonds-starcloud-raises-170m-series-a-at-1-1b-valuation-in-mission-for-data-centers/article_275a4ea8-14b3-428f-90cb-8124388eaf93.html",
  },
  {
    id: "granola-20260325",
    companyName: "Granola",
    websiteUrl: "https://www.granola.ai",
    sector: "Productivity",
    roundKind: "Series C",
    amountLabel: "$125M",
    announcedAt: "2026-03-25",
    leadInvestor: "Index Ventures",
    leadWebsiteUrl: "https://indexventures.com",
    coInvestors: [],
    sourceUrl: "https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/",
  },
];
