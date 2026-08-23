import type { CatalystTeardown, RawStartupSignal, SignalBreakdown } from "./types";

type SeedDraft = Omit<
  RawStartupSignal,
  | "employeeCount"
  | "totalFundingUsd"
  | "domainRegisteredAt"
  | "githubRepoCreatedAt"
  | "mentionedByEarlyStageInvestors"
  | "current24h"
  | "baseline30d"
>;

function growthWindows(raw: SignalBreakdown, compression: number): Pick<RawStartupSignal, "current24h" | "baseline30d"> {
  return {
    current24h: { ...raw },
    baseline30d: {
      launch: Math.round(raw.launch * compression),
      social: Math.round(raw.social * compression),
      developer: Math.round(raw.developer * compression),
      traction: Math.round(raw.traction * compression),
    },
  };
}

function hydrateEarlyStage(row: SeedDraft, index: number): RawStartupSignal {
  return {
    ...row,
    employeeCount: 8 + (index % 28),
    totalFundingUsd: 350_000 + index * 280_000,
    domainRegisteredAt: `2023-0${(index % 8) + 1}-15T00:00:00.000Z`,
    githubRepoCreatedAt: row.github ? `2025-0${(index % 6) + 1}-08T00:00:00.000Z` : null,
    mentionedByEarlyStageInvestors: index % 3 !== 1,
    ...growthWindows(row.raw, 0.26 + (index % 5) * 0.05),
  };
}

const EARLY_STAGES = ["Pre-Seed", "Seed", "Series A"] as const;
const HQ_CITIES = [
  "San Francisco",
  "New York",
  "Austin",
  "Boston",
  "Denver",
  "Seattle",
  "London",
  "Berlin",
  "Toronto",
  "Miami",
] as const;

function hydrateIncumbent(row: SeedDraft): RawStartupSignal {
  return {
    ...row,
    fundingStage: "Series D",
    hqLocation: "San Francisco",
    employeeCount: 420,
    totalFundingUsd: 120_000_000,
    domainRegisteredAt: "2017-03-01T00:00:00.000Z",
    githubRepoCreatedAt: "2018-06-01T00:00:00.000Z",
    mentionedByEarlyStageInvestors: true,
    ...growthWindows(row.raw, 0.92),
  };
}

function series(seed: number, length: number, base: number, swing: number): number[] {
  const out: number[] = [];
  let value = base;
  for (let i = 0; i < length; i += 1) {
    const wave = Math.sin((seed + i) * 0.55) * swing;
    const drift = ((seed * 17 + i * 13) % 7) - 3;
    value = Math.max(4, value + wave * 0.35 + drift);
    out.push(Math.round(value * 10) / 10);
  }
  return out;
}

function teardown(partial: CatalystTeardown): CatalystTeardown {
  return partial;
}

const FEATURED: SeedDraft[] = [
  {
    id: "lumen-agents",
    name: "Lumen Agents",
    brandAliases: ["Lumen", "LumenAgents"],
    domain: "lumenagents.ai",
    website: "https://lumenagents.ai",
    logoUrl: null,
    microCategory: "Agentic Workflows",
    fundingStage: "Seed",
    hqLocation: "San Francisco",
    twitter: "https://x.com/lumenagents",
    linkedin: "https://www.linkedin.com/company/lumen-agents",
    github: "https://github.com/lumen-agents",
    accountCreatedAt: "2024-11-02T00:00:00.000Z",
    hoursElapsed: 18,
    sentiment: "praise",
    raw: { launch: 94, social: 88, developer: 76, traction: 71 },
    upvoteIps: ["203.0.113.4", "198.51.100.12", "192.0.2.44", "203.0.113.18"],
    velocity24h: series(3, 12, 42, 11),
    velocity7d: series(3, 7, 28, 8),
    velocity30d: series(4, 12, 18, 6),
    velocity90d: series(5, 16, 10, 4),
    catalyst: "Open-sourced an agent runtime that cut enterprise workflow setup from weeks to an afternoon.",
    teardown: teardown({
      marketDrivers: [
        "Ops teams are replacing brittle Zapier stacks with multi-agent runtimes.",
        "Fortune 500 security reviews now accept isolated tool-calling sandboxes.",
      ],
      techStack: ["TypeScript", "Temporal", "Postgres", "OpenTelemetry"],
      competitors: [
        { name: "Relay.app", overlap: "Workflow automation", note: "Less agent memory, stronger Gmail-native UX." },
        { name: "Dust", overlap: "Internal agents", note: "Heavier on knowledge bases than live tool execution." },
      ],
    }),
  },
  {
    id: "northline",
    name: "Northline",
    brandAliases: ["Northline Energy"],
    domain: "northline.energy",
    website: "https://northline.energy",
    logoUrl: null,
    microCategory: "Grid Software",
    fundingStage: "Series A",
    hqLocation: "Denver",
    twitter: "https://x.com/northlinegrid",
    linkedin: "https://www.linkedin.com/company/northline-energy",
    github: "https://github.com/northline-energy",
    accountCreatedAt: "2023-04-18T00:00:00.000Z",
    hoursElapsed: 36,
    sentiment: "praise",
    raw: { launch: 71, social: 64, developer: 58, traction: 82 },
    upvoteIps: ["198.51.100.2", "198.51.100.9", "203.0.113.77"],
    velocity24h: series(8, 12, 31, 7),
    velocity7d: series(8, 7, 24, 5),
    velocity30d: series(9, 12, 16, 4),
    velocity90d: series(10, 16, 11, 3),
    catalyst: "Signed two ISO pilots after a black-start drill where its dispatch model beat the incumbent by 19%.",
    teardown: teardown({
      marketDrivers: [
        "Interconnection queues are forcing utilities to buy software before steel.",
        "IRA-era storage buildout needs real-time curtailment logic.",
      ],
      techStack: ["Python", "ClickHouse", "Kubernetes", "IEC 61850"],
      competitors: [
        { name: "AutoGrid", overlap: "DERMS", note: "Broader install base, slower iteration." },
        { name: "Enchanted Rock", overlap: "Resilience", note: "Hardware-led; weaker software surface." },
      ],
    }),
  },
  {
    id: "forgekit",
    name: "Forgekit",
    brandAliases: ["Forge Kit"],
    domain: "forgekit.dev",
    website: "https://forgekit.dev",
    logoUrl: null,
    microCategory: "Developer Tooling",
    fundingStage: "Pre-Seed",
    hqLocation: "New York",
    twitter: "https://x.com/forgekit",
    linkedin: "https://www.linkedin.com/company/forgekit",
    github: "https://github.com/forgekit",
    accountCreatedAt: "2024-06-11T00:00:00.000Z",
    hoursElapsed: 11,
    sentiment: "neutral",
    raw: { launch: 86, social: 73, developer: 91, traction: 54 },
    upvoteIps: ["192.0.2.10", "192.0.2.11", "203.0.113.5", "198.51.100.40"],
    velocity24h: series(12, 12, 48, 13),
    velocity7d: series(12, 7, 33, 9),
    velocity30d: series(13, 12, 20, 6),
    velocity90d: series(14, 16, 12, 4),
    catalyst: "GitHub trending after a 4k-star eval harness that reproduces flaky agent tests locally.",
    teardown: teardown({
      marketDrivers: [
        "Teams cannot ship agents without deterministic evals.",
        "CI minutes are being reallocated from unit tests to scenario traces.",
      ],
      techStack: ["Rust", "WebAssembly", "SQLite", "GitHub Actions"],
      competitors: [
        { name: "LangSmith", overlap: "Eval traces", note: "Hosted-first; weaker offline reproduction." },
        { name: "Braintrust", overlap: "Eval scoring", note: "Stronger product analytics, thinner CLI." },
      ],
    }),
  },
  {
    id: "ledgerwell",
    name: "Ledgerwell",
    brandAliases: ["Ledger Well"],
    domain: "ledgerwell.com",
    website: "https://ledgerwell.com",
    logoUrl: null,
    microCategory: "B2B Payments",
    fundingStage: "Seed",
    hqLocation: "New York",
    twitter: "https://x.com/ledgerwell",
    linkedin: "https://www.linkedin.com/company/ledgerwell",
    github: null,
    accountCreatedAt: "2022-09-01T00:00:00.000Z",
    hoursElapsed: 52,
    sentiment: "neutral",
    raw: { launch: 49, social: 57, developer: 33, traction: 79 },
    upvoteIps: ["203.0.113.90", "198.51.100.21"],
    velocity24h: series(17, 12, 22, 5),
    velocity7d: series(17, 7, 19, 4),
    velocity30d: series(18, 12, 14, 3),
    velocity90d: series(19, 16, 12, 3),
    catalyst: "Quiet launch of multi-entity treasury rails that collapsed close for two Series C SaaS finance teams.",
    teardown: teardown({
      marketDrivers: [
        "CFOs want sub-ledger truth without replacing NetSuite.",
        "Usage-based billing is breaking weekly cash forecasts.",
      ],
      techStack: ["Go", "Postgres", "Temporal", "Plaid"],
      competitors: [
        { name: "Ramp", overlap: "Spend", note: "Cards and close automation; weaker multi-entity cash." },
        { name: "Modern Treasury", overlap: "Payments ops", note: "Banking primitives, less FP&A narrative." },
      ],
    }),
  },
  {
    id: "helix-path",
    name: "Helix Path",
    brandAliases: ["HelixPath"],
    domain: "helixpath.health",
    website: "https://helixpath.health",
    logoUrl: null,
    microCategory: "Clinical AI",
    fundingStage: "Seed",
    hqLocation: "Boston",
    twitter: "https://x.com/helixpath",
    linkedin: "https://www.linkedin.com/company/helix-path",
    github: null,
    accountCreatedAt: "2023-12-08T00:00:00.000Z",
    hoursElapsed: 27,
    sentiment: "praise",
    raw: { launch: 68, social: 81, developer: 44, traction: 63 },
    upvoteIps: ["198.51.100.70", "203.0.113.16", "192.0.2.88"],
    velocity24h: series(21, 12, 36, 9),
    velocity7d: series(21, 7, 27, 6),
    velocity30d: series(22, 12, 17, 5),
    velocity90d: series(23, 16, 11, 3),
    catalyst: "NEJM Catalyst write-up on a prior-auth agent that recovered 11 days of cycle time at a 14-hospital system.",
    teardown: teardown({
      marketDrivers: [
        "Health systems are buying workflow AI that sits beside the EHR, not inside it.",
        "Prior auth is the first process with a measurable dollar clock.",
      ],
      techStack: ["Python", "FHIR", "Azure", "On-prem LLM gateway"],
      competitors: [
        { name: "Abridge", overlap: "Clinical language", note: "Ambient notes, not utilization management." },
        { name: "Infinitus", overlap: "Benefits verification", note: "Voice-first; thinner EHR writeback." },
      ],
    }),
  },
];

const GENERATED_META: Array<{
  id: string;
  name: string;
  domain: string;
  microCategory: string;
  sentiment: RawStartupSignal["sentiment"];
  hoursElapsed: number;
  raw: SignalBreakdown;
  catalyst: string;
}> = [
  { id: "orbit-lane", name: "Orbit Lane", domain: "orbitlane.io", microCategory: "Spatial Compute", sentiment: "neutral", hoursElapsed: 40, raw: { launch: 61, social: 55, developer: 70, traction: 48 }, catalyst: "Dropped a browser-native Gaussian viewer used in three robotics demos overnight." },
  { id: "quill-ops", name: "Quill Ops", domain: "quillops.com", microCategory: "RevOps Agents", sentiment: "praise", hoursElapsed: 22, raw: { launch: 77, social: 69, developer: 41, traction: 60 }, catalyst: "Gong-adjacent recap agent started landing in AE Slack channels without a sales team." },
  { id: "basin-labs", name: "Basin Labs", domain: "basinlabs.co", microCategory: "Water Tech", sentiment: "neutral", hoursElapsed: 64, raw: { launch: 38, social: 44, developer: 29, traction: 67 }, catalyst: "Municipal RFP shortlist after a leak-detection model cut false positives in half." },
  { id: "kestrel-os", name: "Kestrel OS", domain: "kestrelos.dev", microCategory: "Edge Runtime", sentiment: "praise", hoursElapsed: 14, raw: { launch: 83, social: 62, developer: 88, traction: 36 }, catalyst: "WASM unikernel hit HN front page after a 12ms cold-start benchmark." },
  { id: "parchment", name: "Parchment", domain: "parchment.legal", microCategory: "Contract Intelligence", sentiment: "neutral", hoursElapsed: 45, raw: { launch: 52, social: 58, developer: 34, traction: 61 }, catalyst: "AmLaw 50 pilot using clause-risk diffs instead of redline theater." },
  { id: "silo-mint", name: "Silo Mint", domain: "silomint.com", microCategory: "Vertical SaaS", sentiment: "negative", hoursElapsed: 30, raw: { launch: 57, social: 71, developer: 22, traction: 49 }, catalyst: "Noisy launch week after a pricing leak; still seeing warehouse inbound volume." },
  { id: "ampersand-bio", name: "Ampersand Bio", domain: "ampersand.bio", microCategory: "Lab Automation", sentiment: "praise", hoursElapsed: 33, raw: { launch: 64, social: 50, developer: 73, traction: 58 }, catalyst: "Published a robot protocol pack that cloned a wet-lab SOP in 40 minutes." },
  { id: "veil-security", name: "Veil", domain: "veil.security", microCategory: "Identity", sentiment: "neutral", hoursElapsed: 19, raw: { launch: 74, social: 66, developer: 59, traction: 42 }, catalyst: "Passkey migration toolkit started replacing homegrown Okta scripts." },
  { id: "copperline", name: "Copperline", domain: "copperline.ai", microCategory: "Supply Chain", sentiment: "neutral", hoursElapsed: 58, raw: { launch: 41, social: 47, developer: 38, traction: 72 }, catalyst: "A CPG shipper cut detention fees 16% in a two-week yard-visibility trial." },
  { id: "nimbus-ledger", name: "Nimbus Ledger", domain: "nimbusledger.io", microCategory: "Onchain Ops", sentiment: "praise", hoursElapsed: 16, raw: { launch: 69, social: 80, developer: 65, traction: 40 }, catalyst: "Treasury desk used it to reconcile three L2s without a weekend war room." },
  { id: "harbor-note", name: "Harbor Note", domain: "harbornote.com", microCategory: "Field Service", sentiment: "neutral", hoursElapsed: 71, raw: { launch: 33, social: 39, developer: 27, traction: 64 }, catalyst: "Voice-to-work-order flow went live with a regional HVAC chain." },
  { id: "aster-clinic", name: "Aster Clinic", domain: "asterclinic.com", microCategory: "Specialty EHR", sentiment: "neutral", hoursElapsed: 49, raw: { launch: 46, social: 43, developer: 31, traction: 69 }, catalyst: "Dermatology groups started switching after prior-auth templates shipped." },
  { id: "rivet-data", name: "Rivet Data", domain: "rivetdata.com", microCategory: "Warehouse UX", sentiment: "praise", hoursElapsed: 25, raw: { launch: 72, social: 54, developer: 81, traction: 47 }, catalyst: "dbt-native metric layer demo replaced two Looker dashboards on a sales call." },
  { id: "paloma-ride", name: "Paloma Ride", domain: "palomaride.com", microCategory: "Autonomy", sentiment: "neutral", hoursElapsed: 38, raw: { launch: 59, social: 63, developer: 52, traction: 44 }, catalyst: "Campus shuttle footage showed unsupervised last-100m handoff." },
  { id: "ember-credit", name: "Ember Credit", domain: "embercredit.com", microCategory: "SMB Lending", sentiment: "negative", hoursElapsed: 43, raw: { launch: 44, social: 60, developer: 21, traction: 55 }, catalyst: "Rate-shop chrome extension spiked, then drew a CFPB blog mention." },
  { id: "canvas-farm", name: "Canvas Farm", domain: "canvasfarm.ag", microCategory: "AgTech", sentiment: "neutral", hoursElapsed: 61, raw: { launch: 36, social: 41, developer: 48, traction: 62 }, catalyst: "Yield model held up in a drought county where satellite NDVI lagged." },
  { id: "solstice-hr", name: "Solstice HR", domain: "solsticehr.com", microCategory: "People Ops", sentiment: "neutral", hoursElapsed: 29, raw: { launch: 55, social: 52, developer: 26, traction: 58 }, catalyst: "Comp-band copilot started getting forwarded inside late-stage startups." },
  { id: "keel-marine", name: "Keel Marine", domain: "keelmarine.io", microCategory: "Maritime", sentiment: "praise", hoursElapsed: 34, raw: { launch: 48, social: 46, developer: 57, traction: 66 }, catalyst: "A carrier used its bunker optimizer on a trans-Pacific string." },
  { id: "lumen-agents-dupe", name: "Lumen Agents Inc", domain: "www.lumenagents.ai", microCategory: "Agentic Workflows", sentiment: "praise", hoursElapsed: 18, raw: { launch: 40, social: 30, developer: 20, traction: 20 }, catalyst: "Duplicate listing from a syndication scrape." },
  { id: "flash-upvote", name: "Flash Upvote", domain: "flashupvote.app", microCategory: "Launch Spam", sentiment: "neutral", hoursElapsed: 6, raw: { launch: 99, social: 12, developer: 8, traction: 5 }, catalyst: "Artificial Product Hunt spike from a single IP block." },
];

function generatedDraft(meta: (typeof GENERATED_META)[number], index: number): SeedDraft {
  const isFlash = meta.id === "flash-upvote";
  const isDupe = meta.id === "lumen-agents-dupe";
  const brandAliases = isDupe ? ["Lumen Agents"] : [];
  return {
    id: meta.id,
    name: meta.name.trim(),
    brandAliases,
    domain: meta.domain,
    website: `https://${meta.domain.replace(/^www\./, "")}`,
    logoUrl: null,
    microCategory: meta.microCategory,
    fundingStage: EARLY_STAGES[index % EARLY_STAGES.length],
    hqLocation: HQ_CITIES[index % HQ_CITIES.length],
    twitter: isDupe ? "https://x.com/lumenagents" : `https://x.com/${meta.id.replace(/-/g, "")}`,
    linkedin: isDupe ? "https://www.linkedin.com/company/lumen-agents" : null,
    github: isDupe ? "https://github.com/lumen-agents" : `https://github.com/${meta.id.replace(/-/g, "")}`,
    accountCreatedAt: isFlash ? "2026-08-09T00:00:00.000Z" : `2024-0${(index % 8) + 1}-12T00:00:00.000Z`,
    hoursElapsed: meta.hoursElapsed,
    sentiment: meta.sentiment,
    raw: meta.raw,
    upvoteIps: isFlash
      ? Array.from({ length: 14 }, () => "203.0.113.200")
      : [`198.51.100.${10 + index}`, `203.0.113.${20 + index}`],
    velocity24h: series(30 + index, 12, 16 + (index % 9), 4),
    velocity7d: series(40 + index, 7, 14 + (index % 6), 3),
    velocity30d: series(50 + index, 12, 11 + (index % 5), 2),
    velocity90d: series(60 + index, 16, 8 + (index % 4), 2),
    catalyst: meta.catalyst,
    teardown: teardown({
      marketDrivers: [
        `${meta.microCategory} buyers are compressing evaluation cycles.`,
        "Operators want a single velocity score instead of five dashboards.",
      ],
      techStack: ["TypeScript", "Postgres", "Redis"],
      competitors: [
        { name: "Incumbent suite", overlap: meta.microCategory, note: "Slower product cadence." },
        { name: "Horizontal copilot", overlap: "AI layer", note: "Less domain workflow depth." },
      ],
    }),
  };
}

function generatedRow(meta: (typeof GENERATED_META)[number], index: number): RawStartupSignal {
  return hydrateEarlyStage(generatedDraft(meta, index), index + FEATURED.length);
}

const INCUMBENT_SEED: RawStartupSignal[] = (
  [
    { id: "vercel", name: "Vercel", domain: "vercel.com", brandAliases: ["Vercel Inc"] },
    { id: "figma", name: "Figma", domain: "figma.com", brandAliases: [] },
    { id: "anthropic", name: "Anthropic", domain: "anthropic.com", brandAliases: [] },
    { id: "supabase", name: "Supabase", domain: "supabase.com", brandAliases: [] },
    { id: "linear", name: "Linear", domain: "linear.app", brandAliases: ["Linear App"] },
  ] as const
).map((row, index) =>
  hydrateIncumbent({
    ...generatedDraft(
      {
        id: row.id,
        name: row.name,
        domain: row.domain,
        microCategory: "Incumbent",
        sentiment: "neutral",
        hoursElapsed: 12,
        raw: { launch: 99, social: 99, developer: 99, traction: 99 },
        catalyst: "Established public/unicorn volume that must be gated out.",
      },
      index,
    ),
    brandAliases: [...row.brandAliases],
  }),
);

/** Extra raw rows used only in engine tests (too-new account, IP spike, duplicate brand). */
export const TRENDING_TEST_FIXTURES: RawStartupSignal[] = [
  generatedRow(GENERATED_META[GENERATED_META.length - 1]!, 30),
  generatedRow(GENERATED_META[GENERATED_META.length - 2]!, 31),
];

export const TRENDING_SEED_STARTUPS: RawStartupSignal[] = [
  ...FEATURED.map((row, index) => hydrateEarlyStage(row, index)),
  ...GENERATED_META.slice(0, 18).map(generatedRow),
  ...INCUMBENT_SEED,
  ...TRENDING_TEST_FIXTURES,
];
