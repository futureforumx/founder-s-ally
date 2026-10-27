import type { OnboardingAnalyticsPayload, OnboardingAnalyticsRange, OnboardingStalledRow } from "@/components/admin/OnboardingAnalytics";
import type { EnrichedUser, AdminUserApplicant } from "@/components/admin/AdminUserManagement";
import type { WaitlistApplicant } from "@/components/admin/AdminWaitlist";

const FIRST = [
  "Maya", "Jordan", "Priya", "Elias", "Sofia", "Kenji", "Amara", "Theo", "Nina", "Owen",
  "Leila", "Marcus", "Ava", "Rohan", "Claire", "Diego", "Hana", "Isaac", "Noor", "Felix",
  "Sienna", "Kai", "Elena", "Mateo", "Ivy", "Andre", "Yara", "Luca", "Naomi", "Seth",
];

const LAST = [
  "Chen", "Hale", "Shah", "Ward", "Alvarez", "Mori", "Okafor", "Brooks", "Voss", "Park",
  "Rahman", "Cole", "Nguyen", "Iyer", "Bennett", "Ruiz", "Sato", "Adler", "Hassan", "Grant",
  "Walsh", "Tanaka", "Rossi", "Silva", "Cho", "Okoye", "Khan", "Moreau", "Reed", "Diaz",
];

const COMPANIES = [
  "Atlas Labs", "Northwind", "Lattice Bio", "Relay Freight", "Harbor", "Paperclip", "Lumen",
  "Stackline", "Copper", "Sable", "Kinetic", "Folio", "Aperture", "Nimbus", "Redwood",
  "Parcel", "Helio", "Orchard", "Vesper", "Quill", "Marlow", "Brightside", "Fieldwork", "Kite",
];

const CITIES = [
  "San Francisco", "New York", "Austin", "London", "Berlin", "Los Angeles", "Seattle",
  "Chicago", "Toronto", "Paris", "Miami", "Boston", "Denver", "Amsterdam", "Singapore",
];

const TITLES = [
  "CEO & Founder", "Co-founder", "Founder", "GP", "Partner", "Principal",
  "Head of Platform", "COO", "Head of Growth", "Operator-in-Residence",
];

const SOURCES = ["referral", "linkedin", "access_page", "register", "landing_page", "twitter"] as const;
const ROLES = ["Founder", "Founder", "Founder", "Operator", "Investor"] as const;
const STAGES = ["Pre-seed", "Seed", "Series A", "Series B"] as const;
const SECTORS = ["AI infrastructure", "Fintech", "Climate", "Healthcare", "Devtools", "Marketplace"] as const;
const PLANS: EnrichedUser["subscription"][] = ["free", "basic", "premium", "elite"];

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
}

function personAt(index: number) {
  const first = FIRST[index % FIRST.length];
  const last = LAST[(index * 3) % LAST.length];
  const company = COMPANIES[index % COMPANIES.length];
  const role = ROLES[index % ROLES.length];
  const domain = index % 5 === 0 ? "gmail.com" : `${slug(company)}.com`;
  return {
    first,
    last,
    name: `${first} ${last}`,
    email: `${first}.${last}${index > 29 ? index : ""}@${domain}`.toLowerCase(),
    company,
    role,
    title: role === "Investor" ? TITLES[3 + (index % 3)] : TITLES[index % 4],
    city: CITIES[index % CITIES.length],
    linkedin: `https://www.linkedin.com/in/${first}-${last}`.toLowerCase(),
  };
}

function rangeShare(range: OnboardingAnalyticsRange): number {
  if (range === "1d") return 0.018;
  if (range === "3d") return 0.042;
  if (range === "7d") return 0.086;
  if (range === "30d") return 0.28;
  if (range === "90d") return 0.62;
  return 1;
}

function scaled(value: number, share: number): number {
  return Math.max(1, Math.round(value * share));
}

const STALLED_STEPS = [
  { index: 2, key: "path", title: "Welcome to Vekta", code: "PATH", fieldsTotal: 2, fieldsCompleted: 1 },
  { index: 3, key: "company", title: "Your Company", code: "COMPANY", fieldsTotal: 4, fieldsCompleted: 2 },
  { index: 4, key: "connections", title: "Bring your network into focus", code: "CONNECTIONS", fieldsTotal: 1, fieldsCompleted: 0 },
  { index: 5, key: "materials", title: "Add the numbers investors ask for", code: "MATERIALS", fieldsTotal: 6, fieldsCompleted: 2 },
] as const;

function buildStalled(): OnboardingStalledRow[] {
  return Array.from({ length: 16 }, (_, index) => {
    const person = personAt(index + 8);
    const step = STALLED_STEPS[index % STALLED_STEPS.length];
    const persona = person.role === "Investor" ? "Investor" : person.role === "Operator" ? "Operator" : "Founder";
    return {
      id: `demo-stalled-${index + 1}`,
      name: index % 9 === 0 ? "Profile incomplete" : person.name,
      email: person.email,
      avatarUrl: null,
      persona,
      status: index % 3 === 0 ? "incomplete" : "stalled",
      furthestStep: step.index,
      furthestStepTitle: step.title,
      furthestStepKey: step.code,
      fieldsCompleted: step.fieldsCompleted,
      fieldsTotal: step.fieldsTotal,
      stalledAt: hoursAgo(8 + index * 11),
      draft: {
        firstName: person.first,
        lastName: index % 9 === 0 ? "" : person.last,
        email: person.email,
        userType: persona.toLowerCase(),
        title: person.title,
        companyName: person.company,
        websiteUrl: `https://${slug(person.company)}.com`,
        stage: STAGES[index % STAGES.length],
        sectors: SECTORS[index % SECTORS.length],
        connectedIntegrations: index % 2 === 0 ? ["Gmail"] : [],
        step: step.key,
      },
    };
  });
}

export function loadDemoOnboardingAnalytics(range: OnboardingAnalyticsRange): OnboardingAnalyticsPayload {
  const share = rangeShare(range);
  const started = scaled(2_418, share);
  const completed = scaled(1_864, share);
  const completionRate = (completed / started) * 100;
  const previousRate = completionRate - (range === "1d" ? 1.8 : 3.4);
  const reached = [
    started,
    Math.round(started * 0.93),
    Math.round(started * 0.86),
    Math.max(completed, Math.round(started * 0.79)),
    completed,
  ];
  const titles = [
    { key: "personal-details", title: "Let’s confirm your details", code: "PERSONAL-DETAILS", fieldCount: 8 },
    { key: "path", title: "Welcome to Vekta", code: "PATH", fieldCount: 2 },
    { key: "company", title: "Your Company", code: "COMPANY", fieldCount: 4 },
    { key: "connections", title: "Bring your network into focus", code: "CONNECTIONS", fieldCount: 1 },
    { key: "materials", title: "Add the numbers investors ask for", code: "MATERIALS", fieldCount: 6 },
  ];

  const steps = titles.map((step, index) => {
    const current = reached[index];
    const next = reached[index + 1];
    const dropOff = next == null ? null : Number((((current - next) / Math.max(1, current)) * 100).toFixed(1));
    return {
      index: index + 1,
      key: step.key,
      title: step.title,
      code: step.code,
      fieldCount: step.fieldCount,
      reached: current,
      percent: Number(((current / started) * 100).toFixed(1)),
      dropOff,
      medianMs: [42_000, 38_000, 96_000, 180_000, 240_000][index],
      highestDropOff: false,
    };
  });
  const worst = steps.reduce((best, step) => (
    (step.dropOff ?? -1) > (best.dropOff ?? -1) ? step : best
  ));
  const marked = steps.map((step) => ({ ...step, highestDropOff: step.key === worst.key }));

  const founderStarted = Math.round(started * 0.71);
  const operatorStarted = Math.round(started * 0.16);
  const investorStarted = started - founderStarted - operatorStarted;

  return {
    range,
    kpis: {
      started,
      completed,
      completionRate,
      completionRateDelta: Number((completionRate - previousRate).toFixed(1)),
      medianCompleteMs: range === "1d" ? 7 * 60_000 : 8 * 60_000 + 24_000,
    },
    steps: marked,
    personas: [
      { label: "Founder", started: founderStarted, completed: Math.round(founderStarted * 0.81), conversion: 81 },
      { label: "Operator", started: operatorStarted, completed: Math.round(operatorStarted * 0.69), conversion: 69 },
      { label: "Investor", started: investorStarted, completed: Math.round(investorStarted * 0.58), conversion: 58 },
    ],
    stalled: buildStalled(),
  };
}

function applicantMetadata(index: number, source: string): Record<string, unknown> {
  if (index % 4 === 0) {
    return {
      utm_source: source === "linkedin" ? "linkedin" : "twitter",
      utm_medium: "social",
      utm_campaign: index % 8 === 0 ? "spring-access" : "waitlist-q4",
    };
  }
  if (index % 4 === 1) {
    return { referrer_domain: index % 8 === 1 ? "news.ycombinator.com" : "lennynewsletter.com" };
  }
  return { pathname: source === "access_page" ? "/access" : source === "register" ? "/register" : "/" };
}

export function loadDemoWaitlistApplicants(): WaitlistApplicant[] {
  return Array.from({ length: 84 }, (_, index) => {
    const person = personAt(index);
    const source = SOURCES[index % SOURCES.length];
    const status = index % 7 === 0 ? "rejected" : index % 3 === 0 ? "approved" : "pending";
    const created = daysAgo(1 + (index % 38));
    const reviewed = status === "pending" ? null : hoursAgo(6 + index);
    return {
      id: `demo-waitlist-${index + 1}`,
      created_at: created,
      updated_at: reviewed ?? created,
      email: person.email,
      name: person.name,
      role: person.role,
      company_name: person.company,
      linkedin_url: person.linkedin,
      source,
      campaign: index % 5 === 0 ? "spring-access" : null,
      metadata: applicantMetadata(index, source),
      status,
      priority_access: index % 11 === 0,
      referral_count: index % 6 === 0 ? 3 + (index % 5) : index % 4,
      total_score: 42 + ((index * 7) % 58),
      waitlist_position: status === "pending" ? 12 + index : null,
      reviewed_at: reviewed,
      reviewed_by: reviewed ? "demo-admin" : null,
      reviewed_by_email: reviewed ? "matthew@vekta.so" : null,
      admin_notes: status === "approved"
        ? "Strong founder. Approved after intro from existing user."
        : status === "rejected"
          ? "Outside ICP — asked to reapply after launch."
          : index % 5 === 0
            ? "Warm intro. Review this week."
            : null,
    };
  });
}

export function loadDemoUserDirectory(): { users: EnrichedUser[]; applicants: AdminUserApplicant[] } {
  const users: EnrichedUser[] = Array.from({ length: 56 }, (_, index) => {
    const person = personAt(index + 4);
    const userType = person.role === "Investor" ? "investor" : person.role === "Operator" ? "operator" : "founder";
    const permission = index === 0 ? "god" : index === 1 ? "admin" : index % 17 === 0 ? "manager" : "user";
    const banned = index === 19 || index === 41;
    const lastActiveHours = banned ? 240 + index : 1 + (index % 36);
    return {
      id: `demo-user-${index + 1}`,
      email: person.email,
      last_sign_in_at: banned ? daysAgo(18) : hoursAgo(lastActiveHours),
      created_at: daysAgo(20 + (index % 240)),
      full_name: person.name,
      avatar_url: null,
      user_type: userType,
      title: person.title,
      linkedin_url: person.linkedin,
      twitter_url: index % 3 === 0 ? `https://x.com/${slug(person.first + person.last)}` : null,
      location: person.city,
      permission,
      total_time_seconds: 1_800 + index * 420,
      api_calls_count: 40 + index * 13,
      storage_bytes: index * 1_572_864,
      last_active_at: banned ? daysAgo(16) : hoursAgo(Math.max(1, lastActiveHours - 1)),
      ip_addresses: [`73.14.${20 + (index % 200)}.${10 + (index % 80)}`],
      last_ip: `73.14.${20 + (index % 200)}.${10 + (index % 80)}`,
      banned,
      subscription: PLANS[index % PLANS.length],
    };
  });

  const applicants: AdminUserApplicant[] = Array.from({ length: 48 }, (_, index) => {
    const person = personAt(70 + index);
    const status = index % 4 === 0 ? "approved" : "pending";
    const created = daysAgo(2 + (index % 21));
    return {
      id: `demo-directory-${index + 1}`,
      created_at: created,
      email: person.email,
      name: person.name,
      role: person.role,
      company_name: person.company,
      linkedin_url: person.linkedin,
      source: SOURCES[index % SOURCES.length],
      status,
      total_score: 48 + ((index * 5) % 40),
      waitlist_position: status === "pending" ? 20 + index : null,
      reviewed_at: status === "approved" ? hoursAgo(12 + index) : null,
      admin_notes: status === "approved" ? "Invite sent. Has not created an account yet." : null,
    };
  });

  return { users, applicants };
}
