import type { AdminRating } from "@/components/admin/AdminReviews";
import type { ReferralCode } from "@/components/admin/AdminReferralCodes";
import type { RecordUpdateRow } from "@/components/admin/recordUpdates";
import {
  blankFirmRow,
  blankPersonRow,
  type AdminFirmDemoDirectory,
  type FirmPortfolioRow,
  type FirmLinkedFundRow,
} from "@/components/admin/AdminFirmRecords";
import type { AdminMarketDemoCatalog, CompanyRow, FounderRow, OperatorRow } from "@/components/admin/AdminMarketIntelligence";
import type { DealRow, FreshFundRow } from "@/components/admin/AdminFreshCapital";
import type { Provider } from "@/components/admin/AdminApiHealth";
import type { SyncLog } from "@/components/admin/AdminSyncLogs";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

const NAMED_FIRMS: Array<{
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  aum: number;
  stages: string[];
  verticals: string[];
  check: [number, number];
  score: number;
  status?: "live" | "needs_review" | "archive";
}> = [
  { id: "demo-sequoia", name: "Sequoia Capital", city: "Menlo Park", state: "CA", country: "United States", aum: 85_000_000_000, stages: ["Seed", "Series A"], verticals: ["AI", "Enterprise"], check: [1_000_000, 25_000_000], score: 96 },
  { id: "demo-a16z", name: "Andreessen Horowitz", city: "Menlo Park", state: "CA", country: "United States", aum: 42_000_000_000, stages: ["Seed", "Series A", "Series B"], verticals: ["AI", "Crypto", "Bio"], check: [500_000, 40_000_000], score: 94 },
  { id: "demo-accel", name: "Accel", city: "Palo Alto", state: "CA", country: "United States", aum: 18_000_000_000, stages: ["Seed", "Series A"], verticals: ["SaaS", "Infrastructure"], check: [1_000_000, 20_000_000], score: 91 },
  { id: "demo-benchmark", name: "Benchmark", city: "San Francisco", state: "CA", country: "United States", aum: 4_200_000_000, stages: ["Seed", "Series A"], verticals: ["Consumer", "Marketplace"], check: [2_000_000, 15_000_000], score: 93 },
  { id: "demo-first-round", name: "First Round", city: "San Francisco", state: "CA", country: "United States", aum: 2_400_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["Devtools", "AI"], check: [250_000, 4_000_000], score: 88 },
  { id: "demo-founders-fund", name: "Founders Fund", city: "San Francisco", state: "CA", country: "United States", aum: 17_000_000_000, stages: ["Seed", "Series A", "Growth"], verticals: ["Defense", "AI", "Bio"], check: [1_000_000, 50_000_000], score: 90 },
  { id: "demo-yc", name: "Y Combinator", city: "San Francisco", state: "CA", country: "United States", aum: 6_000_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["AI", "B2B"], check: [125_000, 500_000], score: 92 },
  { id: "demo-greylock", name: "Greylock", city: "Menlo Park", state: "CA", country: "United States", aum: 6_500_000_000, stages: ["Seed", "Series A"], verticals: ["Enterprise", "Consumer"], check: [1_000_000, 20_000_000], score: 87 },
  { id: "demo-index", name: "Index Ventures", city: "London", state: "", country: "United Kingdom", aum: 9_000_000_000, stages: ["Seed", "Series A", "Series B"], verticals: ["Fintech", "SaaS"], check: [1_000_000, 30_000_000], score: 89 },
  { id: "demo-lightspeed", name: "Lightspeed", city: "Menlo Park", state: "CA", country: "United States", aum: 25_000_000_000, stages: ["Seed", "Series A", "Growth"], verticals: ["Enterprise", "Consumer"], check: [500_000, 40_000_000], score: 86 },
  { id: "demo-khosla", name: "Khosla Ventures", city: "Menlo Park", state: "CA", country: "United States", aum: 15_000_000_000, stages: ["Seed", "Series A"], verticals: ["Climate", "Deep Tech"], check: [1_000_000, 25_000_000], score: 84 },
  { id: "demo-bessemer", name: "Bessemer Venture Partners", city: "San Francisco", state: "CA", country: "United States", aum: 20_000_000_000, stages: ["Seed", "Series A", "Series B"], verticals: ["Cloud", "Healthcare"], check: [1_000_000, 30_000_000], score: 85 },
  { id: "demo-gc", name: "General Catalyst", city: "Cambridge", state: "MA", country: "United States", aum: 33_000_000_000, stages: ["Seed", "Series A", "Growth"], verticals: ["Health", "Fintech"], check: [1_000_000, 50_000_000], score: 83 },
  { id: "demo-insight", name: "Insight Partners", city: "New York", state: "NY", country: "United States", aum: 90_000_000_000, stages: ["Series B", "Growth"], verticals: ["Software"], check: [10_000_000, 200_000_000], score: 82 },
  { id: "demo-thrive", name: "Thrive Capital", city: "New York", state: "NY", country: "United States", aum: 8_000_000_000, stages: ["Series A", "Series B"], verticals: ["Internet", "AI"], check: [5_000_000, 40_000_000], score: 88 },
  { id: "demo-ribbit", name: "Ribbit Capital", city: "Palo Alto", state: "CA", country: "United States", aum: 4_000_000_000, stages: ["Seed", "Series A"], verticals: ["Fintech"], check: [1_000_000, 20_000_000], score: 81 },
  { id: "demo-spark", name: "Spark Capital", city: "San Francisco", state: "CA", country: "United States", aum: 5_500_000_000, stages: ["Seed", "Series A"], verticals: ["Consumer", "Media"], check: [500_000, 15_000_000], score: 80 },
  { id: "demo-usv", name: "Union Square Ventures", city: "New York", state: "NY", country: "United States", aum: 2_000_000_000, stages: ["Seed", "Series A"], verticals: ["Networks", "Crypto"], check: [500_000, 12_000_000], score: 86 },
  { id: "demo-initialized", name: "Initialized", city: "San Francisco", state: "CA", country: "United States", aum: 1_300_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["Devtools"], check: [250_000, 3_000_000], score: 79 },
  { id: "demo-felicis", name: "Felicis", city: "Menlo Park", state: "CA", country: "United States", aum: 3_000_000_000, stages: ["Seed", "Series A"], verticals: ["AI", "Health"], check: [500_000, 15_000_000], score: 84 },
  { id: "demo-nea", name: "NEA", city: "Menlo Park", state: "CA", country: "United States", aum: 25_000_000_000, stages: ["Series A", "Series B"], verticals: ["Healthcare", "Enterprise"], check: [2_000_000, 40_000_000], score: 77 },
  { id: "demo-battery", name: "Battery Ventures", city: "Boston", state: "MA", country: "United States", aum: 13_000_000_000, stages: ["Series A", "Series B"], verticals: ["Infrastructure", "Industrial"], check: [5_000_000, 40_000_000], score: 76 },
  { id: "demo-redpoint", name: "Redpoint", city: "Menlo Park", state: "CA", country: "United States", aum: 7_000_000_000, stages: ["Seed", "Series A"], verticals: ["Consumer", "Enterprise"], check: [1_000_000, 20_000_000], score: 78 },
  { id: "demo-craft", name: "Craft Ventures", city: "San Francisco", state: "CA", country: "United States", aum: 3_300_000_000, stages: ["Seed", "Series A"], verticals: ["SaaS"], check: [1_000_000, 15_000_000], score: 81 },
  { id: "demo-harbor", name: "Harbor Ventures", city: "Austin", state: "TX", country: "United States", aum: 640_000_000, stages: ["Seed"], verticals: ["Climate", "Logistics"], check: [250_000, 3_000_000], score: 74 },
  { id: "demo-harbor-dup", name: "Harbor Venture Partners", city: "Austin", state: "TX", country: "United States", aum: 180_000_000, stages: ["Seed"], verticals: ["Climate"], check: [150_000, 1_500_000], score: 41, status: "needs_review" },
  { id: "demo-northstar", name: "Northstar Capital", city: "New York", state: "NY", country: "United States", aum: 920_000_000, stages: ["Series A"], verticals: ["Fintech"], check: [2_000_000, 8_000_000], score: 72 },
  { id: "demo-lattice", name: "Lattice Partners", city: "London", state: "", country: "United Kingdom", aum: 410_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["Bio"], check: [200_000, 2_000_000], score: 69 },
  { id: "demo-sable", name: "Sable Capital", city: "Los Angeles", state: "CA", country: "United States", aum: 260_000_000, stages: ["Seed"], verticals: ["Consumer"], check: [250_000, 2_500_000], score: 63, status: "needs_review" },
  { id: "demo-orchard", name: "Orchard Fund", city: "Chicago", state: "IL", country: "United States", aum: 150_000_000, stages: ["Pre-Seed"], verticals: ["Marketplace"], check: [100_000, 750_000], score: 58 },
  { id: "demo-kite", name: "Kite Ventures", city: "Berlin", state: "", country: "Germany", aum: 880_000_000, stages: ["Seed", "Series A"], verticals: ["Climate", "Industrial"], check: [500_000, 8_000_000], score: 75 },
  { id: "demo-folio", name: "Folio Capital", city: "Toronto", state: "ON", country: "Canada", aum: 310_000_000, stages: ["Seed"], verticals: ["Devtools"], check: [300_000, 3_000_000], score: 71 },
  { id: "demo-vesper", name: "Vesper", city: "Paris", state: "", country: "France", aum: 540_000_000, stages: ["Series A"], verticals: ["AI"], check: [1_000_000, 10_000_000], score: 73 },
  { id: "demo-lumen", name: "Lumen Partners", city: "Seattle", state: "WA", country: "United States", aum: 1_100_000_000, stages: ["Seed", "Series A"], verticals: ["Infrastructure"], check: [750_000, 12_000_000], score: 80 },
  { id: "demo-nimbus", name: "Nimbus", city: "Denver", state: "CO", country: "United States", aum: 95_000_000, stages: ["Pre-Seed"], verticals: ["Climate"], check: [50_000, 400_000], score: 48, status: "needs_review" },
  { id: "demo-redwood", name: "Redwood Equity", city: "San Francisco", state: "CA", country: "United States", aum: 2_200_000_000, stages: ["Series B", "Growth"], verticals: ["Healthcare"], check: [10_000_000, 40_000_000], score: 77 },
  { id: "demo-copper", name: "Copper Lane", city: "Miami", state: "FL", country: "United States", aum: 70_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["Consumer"], check: [75_000, 500_000], score: 36, status: "archive" },
  { id: "demo-paperclip", name: "Paperclip Ventures", city: "Boston", state: "MA", country: "United States", aum: 480_000_000, stages: ["Seed"], verticals: ["Education", "SaaS"], check: [250_000, 2_000_000], score: 70 },
  { id: "demo-kinetic", name: "Kinetic Capital", city: "Singapore", state: "", country: "Singapore", aum: 1_600_000_000, stages: ["Series A", "Series B"], verticals: ["Fintech", "Logistics"], check: [2_000_000, 15_000_000], score: 82 },
  { id: "demo-aperture", name: "Aperture", city: "Los Angeles", state: "CA", country: "United States", aum: 220_000_000, stages: ["Seed"], verticals: ["Media", "AI"], check: [300_000, 2_500_000], score: 68 },
  { id: "demo-marlow", name: "Marlow & Co", city: "London", state: "", country: "United Kingdom", aum: 760_000_000, stages: ["Seed", "Series A"], verticals: ["Climate"], check: [500_000, 6_000_000], score: 74 },
  { id: "demo-fieldwork", name: "Fieldwork", city: "Austin", state: "TX", country: "United States", aum: 140_000_000, stages: ["Pre-Seed", "Seed"], verticals: ["Industrial"], check: [100_000, 1_000_000], score: 61 },
];

const NAMED_PEOPLE: Array<{ id: string; firmId: string; name: string; title: string; city: string }> = [
  { id: "demo-botha", firmId: "demo-sequoia", name: "Roelof Botha", title: "Partner", city: "Menlo Park" },
  { id: "demo-lin", firmId: "demo-sequoia", name: "Alfred Lin", title: "Partner", city: "Menlo Park" },
  { id: "demo-andreessen", firmId: "demo-a16z", name: "Marc Andreessen", title: "General Partner", city: "Menlo Park" },
  { id: "demo-rabois", firmId: "demo-founders-fund", name: "Keith Rabois", title: "General Partner", city: "Miami" },
  { id: "demo-livingston", firmId: "demo-yc", name: "Jessica Livingston", title: "Partner", city: "San Francisco" },
];

const EXTRA_FIRST = ["Maya", "Priya", "Kenji", "Amara", "Sofia", "Elena", "Noah", "Leila", "Jonas", "Ava", "Hiro", "Noor"];
const EXTRA_LAST = ["Chen", "Shah", "Okoye", "Rossi", "Nguyen", "Adler", "Park", "Hassan", "Silva", "Brooks", "Iyer", "Sato"];
const TITLES = ["Partner", "Principal", "Investor", "General Partner", "Venture Partner", "Head of Platform"];

const COMPANIES = [
  ["Helio", "AI infrastructure", "series_b", 86_000_000, "San Francisco", "CA"],
  ["Parcel", "Logistics", "series_a", 22_000_000, "Austin", "TX"],
  ["Northwind", "Climate", "seed", 6_400_000, "Denver", "CO"],
  ["Lattice Bio", "Healthcare", "series_a", 28_000_000, "Boston", "MA"],
  ["Relay Freight", "Marketplace", "series_b", 64_000_000, "Chicago", "IL"],
  ["Paperclip", "Devtools", "seed", 4_200_000, "New York", "NY"],
  ["Lumen Grid", "Climate", "series_a", 31_000_000, "Seattle", "WA"],
  ["Stackline", "Fintech", "series_c", 140_000_000, "New York", "NY"],
  ["Copper Health", "Healthcare", "seed", 8_100_000, "Los Angeles", "CA"],
  ["Sable", "Consumer", "pre_seed", 1_800_000, "Miami", "FL"],
  ["Kinetic", "Industrial", "series_a", 19_000_000, "Detroit", "MI"],
  ["Folio", "Fintech", "seed", 5_500_000, "London", ""],
  ["Aperture", "AI infrastructure", "series_a", 24_000_000, "San Francisco", "CA"],
  ["Nimbus", "Devtools", "seed", 7_200_000, "Berlin", ""],
  ["Redwood", "Climate", "series_b", 72_000_000, "Boulder", "CO"],
  ["Quill", "Education", "seed", 3_400_000, "Toronto", "ON"],
  ["Marlow", "Consumer", "series_a", 16_000_000, "Paris", ""],
  ["Brightside", "Healthcare", "series_a", 21_000_000, "Austin", "TX"],
  ["Fieldwork", "Marketplace", "seed", 4_800_000, "Chicago", "IL"],
  ["Kite", "Climate", "pre_seed", 2_100_000, "Amsterdam", ""],
  ["Harbor OS", "Logistics", "series_b", 54_000_000, "Singapore", ""],
  ["Vesper", "AI infrastructure", "seed", 9_600_000, "London", ""],
  ["Orchard", "Fintech", "series_a", 18_500_000, "New York", "NY"],
  ["Atlas Labs", "Deep Tech", "series_a", 27_000_000, "Palo Alto", "CA"],
  ["Relay Bio", "Healthcare", "seed", 11_000_000, "Cambridge", "MA"],
  ["Paper Route", "Consumer", "pre_seed", 1_200_000, "Los Angeles", "CA"],
  ["Lumen Pay", "Fintech", "series_b", 48_000_000, "London", ""],
  ["Stackhouse", "Devtools", "seed", 6_800_000, "Seattle", "WA"],
  ["Copperline", "Climate", "series_a", 14_000_000, "Denver", "CO"],
  ["Sable AI", "AI infrastructure", "series_c", 120_000_000, "San Francisco", "CA"],
  ["Kinship", "Marketplace", "seed", 3_900_000, "Austin", "TX"],
  ["Folio Health", "Healthcare", "series_a", 23_000_000, "Boston", "MA"],
  ["Aperture Security", "Cybersecurity", "series_b", 61_000_000, "Tel Aviv", ""],
  ["Nimbus Freight", "Logistics", "seed", 5_100_000, "Chicago", "IL"],
  ["Redwood Bio", "Healthcare", "series_a", 33_000_000, "San Diego", "CA"],
  ["Quill Markets", "Fintech", "seed", 8_400_000, "New York", "NY"],
] as const;

const REVIEW_COMMENTS = [
  "Partner replied the same day and ran a real working session on pricing. We left with a written next step.",
  "Intro was warm, the meeting was on time, and the feedback on our GTM was specific enough to use that week.",
  "Passed quickly with a clear reason. Respectful, and they offered two customer intros anyway.",
  "Took three weeks to schedule and the notes we sent were not read. The score reflects the follow-through.",
  "Ongoing process. They brought an operator from the portfolio into the second meeting.",
  "Strong on technical diligence. Asked for the data room before the partner meeting and came prepared.",
  "Email thread stayed crisp. Decision in nine days, which is faster than the rest of this process.",
  "Met at a founder dinner. They remembered the company two weeks later and requested a deck.",
  "Feedback was generic. Helpful on intros, light on product.",
  "Led the round conversation and stayed available through legal. Founders on the platform keep mentioning them.",
];

const INTERACTIONS = ["meeting", "email", "intro", "passed", "ongoing"] as const;

function firmStatus(status: "live" | "needs_review" | "archive" | undefined) {
  if (status === "archive") return { status: "archive", needs_review: false, ready_for_live: false, manual_review_status: "archive" };
  if (status === "needs_review") return { status: "needs_review", needs_review: true, ready_for_live: false, manual_review_status: "needs_review" };
  return { status: "live", needs_review: false, ready_for_live: true, manual_review_status: "live" };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function loadDemoFirmDirectory(): AdminFirmDemoDirectory {
  const firms = NAMED_FIRMS.map((firm, index) => {
    const flags = firmStatus(firm.status);
    return blankFirmRow({
      id: firm.id,
      firm_name: firm.name,
      legal_name: `${firm.name} LLC`,
      slug: slug(firm.name),
      tagline: `${firm.verticals[0]} investor · ${firm.stages[0]}`,
      description: `${firm.name} is actively meeting founders in ${firm.verticals.join(", ")}. Check sizes typically run $${(firm.check[0] / 1_000_000).toFixed(1)}M to $${(firm.check[1] / 1_000_000).toFixed(0)}M.`,
      location: [firm.city, firm.state || firm.country].filter(Boolean).join(", "),
      hq_city: firm.city,
      hq_state: firm.state || null,
      hq_country: firm.country,
      website_url: `https://${slug(firm.name).replace(/-/g, "")}.com`,
      linkedin_url: `https://www.linkedin.com/company/${slug(firm.name)}`,
      aum: `$${(firm.aum / 1_000_000_000).toFixed(1)}B`,
      aum_usd: firm.aum,
      founded_year: 1994 + (index % 28),
      lead_partner: NAMED_PEOPLE.find((person) => person.firmId === firm.id)?.name ?? null,
      lead_or_follow: index % 5 === 0 ? "Follow" : "Lead",
      preferred_stage: firm.stages[0],
      stage_focus: firm.stages,
      thesis_verticals: firm.verticals,
      firm_type: "Venture Capital",
      min_check_size: firm.check[0],
      max_check_size: firm.check[1],
      total_headcount: 8 + (index % 40),
      is_actively_deploying: firm.status !== "archive",
      market_sentiment: firm.score >= 85 ? "High founder regard" : "Selective",
      recent_deals: COMPANIES.slice(index % 8, (index % 8) + 3).map((company) => company[0]),
      reputation_score: firm.score,
      founder_reputation_score: Math.max(40, firm.score - 4),
      responsiveness_score: Math.max(45, firm.score - (index % 7)),
      community_rating: Number((firm.score / 20).toFixed(1)),
      enrichment_status: firm.score >= 70 ? "enriched" : firm.score >= 50 ? "partial" : "pending",
      completeness_score: firm.score,
      ...flags,
      updated_at: hoursAgo(2 + index * 5),
    });
  });

  const people = [
    ...NAMED_PEOPLE.map((person, index) => {
      const firm = firms.find((row) => row.id === person.firmId);
      const [first, ...rest] = person.name.split(" ");
      return blankPersonRow({
        id: person.id,
        firm_id: person.firmId,
        firm_name: firm?.firm_name ?? null,
        full_name: person.name,
        first_name: first,
        last_name: rest.join(" "),
        title: person.title,
        seniority: "Partner",
        investor_type: "Venture Partner",
        email: `${first}.${rest.join("")}@${slug(firm?.firm_name ?? "firm").replace(/-/g, "")}.com`.toLowerCase(),
        linkedin_url: `https://www.linkedin.com/in/${slug(person.name)}`,
        city: person.city,
        country: firm?.hq_country ?? "United States",
        stage_focus: firm?.stage_focus ?? ["Seed"],
        sector_focus: firm?.thesis_verticals ?? ["AI"],
        short_summary: `${person.title} at ${firm?.firm_name}. Frequently requested by founders this month.`,
        bio: `${person.name} leads ${firm?.thesis_verticals?.[0] ?? "venture"} investments and has been active in the last 30 days.`,
        is_actively_investing: true,
        completeness_score: 90 - index,
        enrichment_status: "enriched",
        reputation_score: 88,
        responsiveness_score: 91,
        total_known_investments: 24 + index * 3,
        recent_deal_count: 3 + index,
        last_active_date: daysAgo(index + 1),
        updated_at: hoursAgo(1 + index * 3),
        funds: [{ id: `demo-linked-fund-${person.firmId}`, name: `${firm?.firm_name ?? "Firm"} Fund`, role: "partner" }],
      });
    }),
    ...Array.from({ length: 48 }, (_, index) => {
      const firm = firms[(index + 3) % firms.length];
      const first = EXTRA_FIRST[index % EXTRA_FIRST.length];
      const last = EXTRA_LAST[(index * 2) % EXTRA_LAST.length];
      const title = TITLES[index % TITLES.length];
      const needsReview = index % 11 === 0;
      return blankPersonRow({
        id: `demo-person-${index + 1}`,
        firm_id: firm.id,
        firm_name: firm.firm_name,
        full_name: `${first} ${last}`,
        first_name: first,
        last_name: last,
        title,
        seniority: title.includes("Partner") ? "Partner" : "Principal",
        city: firm.hq_city,
        state: firm.hq_state,
        country: firm.hq_country,
        linkedin_url: `https://www.linkedin.com/in/${first}-${last}`.toLowerCase(),
        email: `${first}.${last}@${slug(firm.firm_name).replace(/-/g, "")}.com`.toLowerCase(),
        stage_focus: firm.stage_focus,
        sector_focus: firm.thesis_verticals,
        short_summary: `${title} covering ${firm.thesis_verticals?.[0] ?? "venture"}.`,
        is_active: firm.status !== "archive",
        is_actively_investing: firm.status !== "archive",
        needs_review: needsReview,
        ready_for_live: !needsReview && firm.ready_for_live,
        completeness_score: needsReview ? 46 : 72 + (index % 20),
        enrichment_status: needsReview ? "partial" : "enriched",
        total_known_investments: 4 + (index % 18),
        recent_deal_count: index % 5,
        last_active_date: daysAgo(index % 20),
        updated_at: hoursAgo(6 + index * 4),
        funds: index % 2 === 0 ? [{ id: `demo-linked-fund-${firm.id}`, name: `${firm.firm_name} Select`, role: "partner" }] : [],
      });
    }),
  ];

  const funds: FirmLinkedFundRow[] = firms.slice(0, 28).map((firm, index) => ({
    id: `demo-linked-fund-${firm.id}`,
    firm_record_id: firm.id,
    fund_name: index % 3 === 0 ? `${firm.firm_name} Opportunity` : `${firm.firm_name} Fund ${["IV", "V", "VI", "VII"][index % 4]}`,
    fund_type: "Venture",
    fund_sequence_number: 4 + (index % 4),
    vintage_year: 2024 + (index % 3),
    announced_date: daysAgo(20 + index * 3).slice(0, 10),
    close_date: index % 4 === 0 ? null : daysAgo(5 + index).slice(0, 10),
    target_size_usd: 250_000_000 + index * 25_000_000,
    final_size_usd: index % 4 === 0 ? null : 280_000_000 + index * 20_000_000,
    currency: "USD",
    status: index % 4 === 0 ? "raising" : "closed",
    stage_focus: firm.stage_focus,
    sector_focus: firm.thesis_verticals,
    geography_focus: [firm.hq_country ?? "United States"],
    announcement_url: firm.website_url,
    announcement_title: `${firm.firm_name} raises a new fund`,
    manually_verified: index % 5 !== 0,
    verification_status: index % 5 === 0 ? "pending" : "verified",
    estimated_check_min_usd: firm.min_check_size,
    estimated_check_max_usd: firm.max_check_size,
  }));

  const portfolio: FirmPortfolioRow[] = firms.slice(0, 24).flatMap((firm, firmIndex) => (
    COMPANIES.slice(firmIndex % 6, (firmIndex % 6) + 2).map((company, companyIndex) => ({
      id: `demo-portfolio-${firm.id}-${companyIndex}`,
      firm_id: firm.id,
      company_name: company[0],
      normalized_company_name: company[0].toLowerCase(),
      amount: `$${(company[3] / 1_000_000).toFixed(1)}M`,
      stage: company[2].replace(/_/g, " "),
      date_announced: daysAgo(12 + firmIndex + companyIndex).slice(0, 10),
      investment_status: "active",
      is_notable: companyIndex === 0,
      portfolio_company_website: `https://${slug(company[0]).replace(/-/g, "")}.com`,
      portfolio_company_linkedin: null,
      source_name: "Demo directory",
      source_url: null,
      source_confidence: 0.9,
      updated_at: hoursAgo(firmIndex + 2),
      led_rounds: companyIndex === 0 ? [company[2]] : [],
    }))
  ));

  return { firms, people, funds, portfolio };
}

export function loadDemoMarketCatalog(): AdminMarketDemoCatalog {
  const companies: CompanyRow[] = COMPANIES.map((company, index) => ({
    id: `demo-company-${index + 1}`,
    company_name: company[0],
    company_url: `https://${slug(company[0]).replace(/-/g, "")}.com`,
    logo_url: null,
    brand_icon_url: null,
    description_short: `${company[0]} builds ${company[1].toLowerCase()} software used by funded startups.`,
    description_long: `${company[0]} is a ${company[2].replace(/_/g, " ")} company in ${company[1]}. Founders are active on the platform and the round is being tracked by multiple firms.`,
    sector: company[1],
    stage: company[2],
    status: index % 17 === 0 ? "ACQUIRED" : "ACTIVE",
    record_status: index % 13 === 0 ? "needs_review" : "live",
    location: [company[4], company[5] || null].filter(Boolean).join(", "),
    hq_city: company[4],
    hq_state: company[5] || null,
    hq_country: company[5] ? "United States" : company[4] === "London" ? "United Kingdom" : company[4] === "Berlin" ? "Germany" : company[4] === "Paris" ? "France" : company[4] === "Toronto" ? "Canada" : company[4] === "Amsterdam" ? "Netherlands" : company[4] === "Singapore" ? "Singapore" : company[4] === "Tel Aviv" ? "Israel" : "United States",
    total_raised_usd: company[3],
    headcount: 8 + (index % 40) * 3,
    yc_batch: index % 4 === 0 ? "W26" : index % 4 === 1 ? "S25" : null,
    linkedin_url: `https://www.linkedin.com/company/${slug(company[0])}`,
    x_url: index % 2 === 0 ? `https://x.com/${slug(company[0]).replace(/-/g, "")}` : null,
    founded_year: 2018 + (index % 8),
    updated_at: hoursAgo(3 + index),
    created_at: daysAgo(40 + index),
  }));

  const founders: FounderRow[] = COMPANIES.slice(0, 28).map((company, index) => ({
    id: `demo-founder-${index + 1}`,
    full_name: `${EXTRA_FIRST[index % EXTRA_FIRST.length]} ${EXTRA_LAST[index % EXTRA_LAST.length]}`,
    role: index % 3 === 0 ? "CEO & Founder" : "Co-founder",
    startup_id: `demo-company-${index + 1}`,
    location: company[4],
    linkedin_url: `https://www.linkedin.com/in/${EXTRA_FIRST[index % EXTRA_FIRST.length]}-${EXTRA_LAST[index % EXTRA_LAST.length]}`.toLowerCase(),
    x_url: null,
    avatar_url: null,
    email: `${EXTRA_FIRST[index % EXTRA_FIRST.length]}.${EXTRA_LAST[index % EXTRA_LAST.length]}@${slug(company[0]).replace(/-/g, "")}.com`.toLowerCase(),
    founder_archetype: index % 3 === 0 ? "Technical" : index % 3 === 1 ? "Domain expert" : "Repeat founder",
    is_repeat_founder: index % 3 === 2,
    has_prior_exit: index % 5 === 0,
    operator_to_founder: index % 4 === 0,
    domain_expertise: [company[1]],
    prior_companies: index % 2 === 0 ? ["Stripe", "Notion"] : ["Figma"],
    updated_at: hoursAgo(4 + index),
    created_at: daysAgo(30 + index),
  }));

  const operators: OperatorRow[] = Array.from({ length: 22 }, (_, index) => ({
    id: `demo-operator-${index + 1}`,
    full_name: `${EXTRA_FIRST[(index + 4) % EXTRA_FIRST.length]} ${EXTRA_LAST[(index + 5) % EXTRA_LAST.length]}`,
    title: ["VP Engineering", "Head of Growth", "COO", "Head of Sales", "Chief of Staff"][index % 5],
    city: COMPANIES[index % COMPANIES.length][4],
    state: COMPANIES[index % COMPANIES.length][5] || null,
    country: "United States",
    linkedin_url: `https://www.linkedin.com/in/operator-${index + 1}`,
    x_url: null,
    website_url: null,
    avatar_url: null,
    email: `operator${index + 1}@vekta-demo.com`,
    stage_focus: ["Seed", "Series A"],
    is_available: index % 4 !== 0,
    enrichment_status: "enriched",
    completeness_score: 68 + (index % 25),
    expertise: [["GTM", "Product", "Engineering", "Finance"][index % 4]],
    sector_focus: [COMPANIES[index % COMPANIES.length][1]],
    prior_companies: ["Stripe", "Ramp"],
    ready_for_live: index % 7 !== 0,
    startup_id: `demo-company-${(index % 20) + 1}`,
    updated_at: hoursAgo(8 + index),
    created_at: daysAgo(50 + index),
  }));

  return { companies, founders, operators };
}

export function loadDemoFreshCapital(directory: AdminFirmDemoDirectory): { funds: FreshFundRow[]; deals: DealRow[] } {
  const funds: FreshFundRow[] = directory.firms.slice(0, 24).map((firm, index) => ({
    id: `demo-fresh-fund-${index + 1}`,
    firm_record_id: firm.id,
    firm_name: firm.firm_name,
    firm_website_url: firm.website_url,
    firm_logo_url: null,
    firm_domain: firm.website_url?.replace(/^https?:\/\//, "") ?? null,
    firm_location: firm.location,
    firm_hq_city: firm.hq_city,
    firm_hq_state: firm.hq_state,
    firm_hq_country: firm.hq_country,
    firm_aum: firm.aum,
    firm_aum_usd: firm.aum_usd,
    has_fresh_capital: true,
    fresh_capital_priority_score: 70 + (index % 25),
    fund_name: `${firm.firm_name} ${["IV", "V", "VI", "VII"][index % 4]}`,
    fund_type: "Venture",
    fund_sequence_number: 4 + (index % 4),
    vintage_year: 2025 + (index % 2),
    announced_date: daysAgo(3 + index * 2).slice(0, 10),
    close_date: index % 3 === 0 ? null : daysAgo(1 + index).slice(0, 10),
    target_size_usd: 200_000_000 + index * 40_000_000,
    final_size_usd: index % 3 === 0 ? null : 240_000_000 + index * 35_000_000,
    currency: "USD",
    status: index % 3 === 0 ? "raising" : "closed",
    source_confidence: 0.82 + (index % 10) / 100,
    source_count: 2 + (index % 4),
    announcement_url: firm.website_url,
    announcement_title: `${firm.firm_name} closes a new fund`,
    stage_focus: firm.stage_focus,
    sector_focus: firm.thesis_verticals,
    geography_focus: [firm.hq_country ?? "United States"],
    likely_actively_deploying: true,
    active_deployment_window_start: daysAgo(30).slice(0, 10),
    active_deployment_window_end: daysAgo(-300).slice(0, 10),
    manually_verified: index % 4 !== 0,
    verification_status: index % 4 === 0 ? "pending" : "verified",
    estimated_check_min_usd: firm.min_check_size,
    estimated_check_max_usd: firm.max_check_size,
    created_at: daysAgo(10 + index),
    updated_at: hoursAgo(index + 1),
  }));

  const deals: DealRow[] = COMPANIES.map((company, index) => ({
    id: `demo-deal-${index + 1}`,
    company_name: company[0],
    company_domain: `${slug(company[0]).replace(/-/g, "")}.com`,
    company_website: `https://${slug(company[0]).replace(/-/g, "")}.com`,
    company_logo_url: null,
    company_linkedin_url: `https://www.linkedin.com/company/${slug(company[0])}`,
    company_location: company[4],
    sector_raw: company[1],
    sector_normalized: company[1],
    round_type_raw: company[2].replace(/_/g, " "),
    round_type_normalized: company[2],
    amount_raw: `$${(company[3] / 1_000_000).toFixed(1)}M`,
    amount_minor_units: company[3] * 100,
    currency: "USD",
    announced_date: daysAgo(index + 1).slice(0, 10),
    lead_investor: directory.firms[index % directory.firms.length].firm_name,
    lead_investor_normalized: directory.firms[index % directory.firms.length].firm_name,
    co_investors: [directory.firms[(index + 3) % directory.firms.length].firm_name],
    extracted_summary: `${company[0]} raised a ${company[2].replace(/_/g, " ")} round. Founders started outreach from Vekta the same week.`,
    needs_review: index % 9 === 0,
    review_reason: index % 9 === 0 ? "Amount confirmed by one source." : null,
    is_rumor: false,
    confidence_score: index % 9 === 0 ? 0.62 : 0.91,
    source_count: 2 + (index % 3),
    primary_source_name: index % 2 === 0 ? "TechCrunch" : "Company blog",
    primary_source_url: `https://${slug(company[0]).replace(/-/g, "")}.com/blog/funding`,
    primary_press_url: null,
    source_type: "news",
    extraction_method: "firecrawl",
    created_at: daysAgo(index + 1),
    updated_at: hoursAgo(index + 2),
  }));

  return { funds, deals };
}

export function loadDemoReviews(directory: AdminFirmDemoDirectory): AdminRating[] {
  return Array.from({ length: 42 }, (_, index) => {
    const firm = directory.firms[index % directory.firms.length];
    const person = directory.people.find((row) => row.firm_id === firm.id) ?? null;
    const high = index % 7 !== 0;
    const draft = index % 8 === 0;
    return {
      id: `demo-review-${index + 1}`,
      author_user_id: `demo-user-${(index % 40) + 1}`,
      author_name: person?.full_name ?? `${EXTRA_FIRST[index % EXTRA_FIRST.length]} ${EXTRA_LAST[index % EXTRA_LAST.length]}`,
      author_email: `${EXTRA_FIRST[index % EXTRA_FIRST.length].toLowerCase()}.${EXTRA_LAST[index % EXTRA_LAST.length].toLowerCase()}@founders.demo`,
      vc_firm_id: firm.id,
      vc_person_id: person?.id ?? null,
      target_firm_name: firm.firm_name,
      target_person_name: person?.full_name ?? null,
      interaction_type: INTERACTIONS[index % INTERACTIONS.length],
      interaction_detail: high ? "Partner meeting with a written follow-up." : "Slow scheduling after the intro.",
      interaction_date: daysAgo(index % 21).slice(0, 10),
      score_resp: high ? 5 : 2,
      score_respect: high ? 5 : 4,
      score_feedback: high ? 4 : 2,
      score_follow_thru: high ? 5 : 2,
      score_value_add: high ? 4 : 3,
      nps: high ? 9 : 4,
      comment: REVIEW_COMMENTS[index % REVIEW_COMMENTS.length],
      anonymous: index % 5 === 0,
      verified: !draft && index % 6 !== 0,
      is_draft: draft,
      archived_at: index % 12 === 0 ? hoursAgo(30 + index) : null,
      star_ratings: {
        responsiveness: high ? 5 : 2,
        respect: high ? 5 : 4,
        feedback: high ? 4 : 2,
        follow_through: high ? 5 : 2,
        value_add: high ? 4 : 3,
      },
      created_at: hoursAgo(5 + index * 6),
    };
  });
}

export function loadDemoReferralCodes(): ReferralCode[] {
  const organizations: Array<[string, string, number]> = [
    ["YC-W26", "Y Combinator Winter 2026", 486],
    ["SEQUOIA", "Sequoia founder network", 312],
    ["A16Z", "a16z platform", 274],
    ["FIRSTROUND", "First Round review", 198],
    ["LENNY", "Lenny's Newsletter", 164],
    ["HN", "Hacker News launch", 221],
    ["SOUTHPARK", "South Park Commons", 96],
    ["ONDECK", "On Deck founders", 143],
    ["TECHSTARS", "Techstars", 88],
    ["PRODUCTHUNT", "Product Hunt launch", 127],
  ];
  const orgCodes: ReferralCode[] = organizations.map(([code, label, used], index) => ({
    id: `demo-ref-org-${index + 1}`,
    code,
    label,
    is_active: index !== 8,
    type: "organization",
    waitlist_user_id: null,
    created_by: "demo-admin",
    created_at: daysAgo(40 - index),
    times_used: used,
  }));
  const memberCodes: ReferralCode[] = EXTRA_FIRST.slice(0, 8).map((first, index) => ({
    id: `demo-ref-member-${index + 1}`,
    code: `${first.slice(0, 4).toUpperCase()}${20 + index}`,
    label: null,
    is_active: true,
    type: "member",
    waitlist_user_id: `demo-waitlist-${index + 1}`,
    target_email: `${first.toLowerCase()}@founders.demo`,
    created_by: null,
    created_at: daysAgo(12 - index),
    times_used: 3 + index * 2,
  }));
  return [...orgCodes, ...memberCodes];
}

export function loadDemoRecordUpdates(
  directory: AdminFirmDemoDirectory,
  catalog: AdminMarketDemoCatalog,
): RecordUpdateRow[] {
  const firmUpdates: RecordUpdateRow[] = directory.firms.slice(0, 16).map((firm, index) => ({
    kind: "vc_firm",
    recordId: firm.id,
    name: firm.firm_name,
    subtitle: firm.location,
    updatedAt: hoursAgo(1 + index),
    change: index % 6 === 0 ? "created" : "updated",
    origin: index % 3 === 0 ? "Admin" : "Firecrawl",
  }));
  const personUpdates: RecordUpdateRow[] = directory.people.slice(0, 14).map((person, index) => ({
    kind: "vc_investor",
    recordId: person.id,
    name: person.full_name,
    subtitle: person.title,
    updatedAt: hoursAgo(2 + index * 2),
    firmId: person.firm_id,
    linkedTo: person.firm_name,
    change: "updated",
    origin: "Admin",
  }));
  const companyUpdates: RecordUpdateRow[] = catalog.companies.slice(0, 12).map((company, index) => ({
    kind: "company",
    recordId: company.id,
    name: company.company_name,
    subtitle: company.sector,
    updatedAt: hoursAgo(3 + index * 2),
    source: "startup",
    change: index % 4 === 0 ? "created" : "updated",
    origin: "User",
  }));
  const founderUpdates: RecordUpdateRow[] = catalog.founders.slice(0, 8).map((founder, index) => ({
    kind: "user_founder",
    recordId: founder.id,
    name: founder.full_name,
    subtitle: founder.role,
    updatedAt: hoursAgo(4 + index * 3),
    change: "updated",
    origin: "User",
  }));
  return [...firmUpdates, ...personUpdates, ...companyUpdates, ...founderUpdates]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const DEMO_OVERVIEW_STATS = [
  { label: "Active Integrations", value: "12/12", color: "#2EE6A6" },
  { label: "Sync Success Rate", value: "99.6%", color: "#2EE6A6" },
  { label: "AI Snippets Today", value: "1,284", color: "#00D4FF" },
  { label: "Tokens Near Expiry", value: "1", color: "#FF6B35" },
];

export const DEMO_AI_AGENTS_PAGE = {
  title: "AI agents founders actually use",
  description: "A living directory of agents for fundraising, research, and investor outreach. Updated as founders rate what they keep using.",
  meta: "Vekta AI agents — fundraising, research, and investor outreach tools used by active founders.",
};

export const DEMO_API_PROVIDERS: Provider[] = [
  { name: "Google", logo: "G", status: "live", lastSynced: "1m ago", tokensNearExpiry: 0, activeWebhooks: 14 },
  { name: "Notion", logo: "N", status: "live", lastSynced: "2m ago", tokensNearExpiry: 0, activeWebhooks: 9 },
  { name: "Stripe", logo: "S", status: "live", lastSynced: "1m ago", tokensNearExpiry: 0, activeWebhooks: 18 },
  { name: "Granola", logo: "Gr", status: "live", lastSynced: "4m ago", tokensNearExpiry: 1, activeWebhooks: 6 },
  { name: "LinkedIn", logo: "Li", status: "live", lastSynced: "3m ago", tokensNearExpiry: 0, activeWebhooks: 11 },
  { name: "HubSpot", logo: "H", status: "live", lastSynced: "2m ago", tokensNearExpiry: 0, activeWebhooks: 15 },
  { name: "Attio", logo: "At", status: "live", lastSynced: "5m ago", tokensNearExpiry: 0, activeWebhooks: 8 },
  { name: "Slack", logo: "Sl", status: "live", lastSynced: "1m ago", tokensNearExpiry: 0, activeWebhooks: 22 },
  { name: "Gmail", logo: "Gm", status: "live", lastSynced: "1m ago", tokensNearExpiry: 0, activeWebhooks: 27 },
];

export function loadDemoSyncLogs(): SyncLog[] {
  const providers = ["Google", "Stripe", "HubSpot", "LinkedIn", "Notion", "Attio", "Granola", "Slack", "Gmail"];
  return Array.from({ length: 28 }, (_, index) => {
    const failed = index % 11 === 0;
    return {
      id: `log_${String(index + 1).padStart(3, "0")}`,
      provider: providers[index % providers.length],
      status: failed ? "FAILED" : "SUCCESS",
      recordsSynced: failed ? 0 : 40 + index * 17,
      durationMs: failed ? 4200 : 600 + index * 80,
      timestamp: hoursAgo(index * 0.7),
      errorMessage: failed ? "Retry scheduled. The upstream returned 429 and the next attempt is queued." : undefined,
    };
  });
}

export const DEMO_AI_DENSITY = [
  { category: "Fundraising", count: 1840, color: "#FFB800" },
  { category: "Investor fit", count: 1520, color: "#2EE6A6" },
  { category: "GTM", count: 980, color: "#00D4FF" },
  { category: "Product", count: 860, color: "#34D399" },
  { category: "Hiring", count: 640, color: "#FF6B6B" },
  { category: "Pricing", count: 510, color: "#A855F7" },
];

export const DEMO_AI_SNIPPETS = [
  { id: 1, text: "Founder compared Sequoia and First Round, then saved both and opened the partner pages.", category: "Investor fit", time: "2m ago" },
  { id: 2, text: "Series A deck review: pricing page called out as the weak slide before the partner meeting.", category: "Fundraising", time: "6m ago" },
  { id: 3, text: "Three founders from the same YC batch searched fresh climate funds within an hour.", category: "Fundraising", time: "11m ago" },
  { id: 4, text: "GTM note: team is moving the first 10 customers from founder-led to a hired AE.", category: "GTM", time: "18m ago" },
  { id: 5, text: "Intro request drafted for Roelof Botha after a warm path through an existing user.", category: "Investor fit", time: "24m ago" },
  { id: 6, text: "Product feedback cluster: onboarding drop-off is concentrated on the materials step.", category: "Product", time: "31m ago" },
  { id: 7, text: "Hiring snippet: two portfolio companies asked for the same staff-plus engineer.", category: "Hiring", time: "44m ago" },
  { id: 8, text: "Pricing experiment logged: usage tier outperformed seat pricing in the last 14 founder calls.", category: "Pricing", time: "1h ago" },
  { id: 9, text: "Referral spike from Lenny's Newsletter. Most new founders selected AI infrastructure.", category: "GTM", time: "1h ago" },
  { id: 10, text: "Follow-through score jumped for Accel after 14 verified reviews this week.", category: "Investor fit", time: "2h ago" },
];
