// ─────────────────────────────────────────────────────────────────────────────
// Onboarding workflow schema
//
// The founder onboarding is described here as an editable definition (steps →
// fields). Admins edit this in the Admin console (Onboarding section); it is
// persisted to Supabase (`onboarding_workflow`) and consumed by the live wizard
// and the admin live preview.
//
// Bespoke steps map to a real React component via `componentKey`. Steps with
// `componentKey: "form"` are generic and rendered from their `fields` alone.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "number"
  | "select"
  | "multiselect"
  | "boolean"
  | "date"
  | "social";

export interface FieldDef {
  id: string;
  /** Stable key; maps to OnboardingState for bespoke steps. */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  /** For select / multiselect. */
  options?: string[];
  /** Rendered but not editable by the end user (e.g. email). */
  readOnly?: boolean;
}

/** Known bespoke components that back a step, plus "form" for generic steps. */
export type StepComponentKey =
  | "personal-details"
  | "path"
  | "company"
  | "connections"
  | "materials"
  | "form";

export interface StepDef {
  id: string;
  /** Stable key used for wiring + resume. */
  key: string;
  componentKey: StepComponentKey;
  enabled: boolean;
  /** Small uppercase eyebrow above the title (optional). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Short label shown in the progress bar. */
  progressLabel: string;
  fields: FieldDef[];
}

export interface OnboardingWorkflowDef {
  id: string;
  name: string;
  /** Left marketing rail shown beside the wizard. */
  leftRail: {
    eyebrow: string;
    heading: string;
    subheading: string;
    valueProps: { title: string; copy: string }[];
  };
  steps: StepDef[];
  /** Bumped on each save so consumers can detect changes. */
  version: number;
}

// ── Option sets (defaults mirror src/components/onboarding-wizard/types.ts) ──────
const STAGE_OPTIONS = ["MVP", "Accelerator", "Pre-Seed", "Seed", "Series A", "Series B +"];
const REVENUE_BAND_OPTIONS = ["Pre-revenue", "<$10K MRR", "$10–50K", "$50–100K", "$100K+"];
const COFOUNDER_OPTIONS = ["Solo", "2", "3", "4+"];
const SUPERPOWER_OPTIONS = ["GTM", "Technical", "Fundraising", "Design", "Sales", "Operations", "Finance", "Community"];
const TARGET_RAISE_OPTIONS = ["$100K", "$250K", "$500K", "$1M", "$2M", "$5M+"];
const ROUND_TYPE_OPTIONS = ["SAFE", "Pre-Seed", "Seed", "Bridge", "Series A"];
const SECTOR_OPTIONS = [
  "SaaS", "FinTech", "HealthTech", "EdTech", "CleanTech", "AI/ML",
  "E-Commerce", "Marketplace", "DevTools", "Cybersecurity", "PropTech",
  "FoodTech", "BioTech", "Logistics", "Media", "Gaming",
];
const PATH_OPTIONS = ["Founder", "Operator", "Investor"];

export const DEFAULT_FOUNDER_WORKFLOW: OnboardingWorkflowDef = {
  id: "founder",
  name: "Founder onboarding",
  version: 1,
  leftRail: {
    eyebrow: "Start with signal",
    heading: "Make every introduction and insight more relevant.",
    subheading:
      "A few details give Vekta the context to prioritize the people, companies, and opportunities that matter to you.",
    valueProps: [
      { title: "Sharper recommendations", copy: "Ranked against your stage, role, and goals." },
      { title: "Useful network paths", copy: "See the strongest route to the right person." },
      { title: "Less setup later", copy: "Start with a workspace that already knows your context." },
    ],
  },
  steps: [
    {
      id: "step-personal",
      key: "personal-details",
      componentKey: "personal-details",
      enabled: true,
      eyebrow: "Your profile",
      title: "Let’s confirm your details",
      subtitle:
        "Make sure your name is right, then add any profiles you want Vekta to connect to your account.",
      progressLabel: "Your profile",
      fields: [
        { id: "f-first", key: "firstName", label: "First name", type: "text", required: true, placeholder: "Jane" },
        { id: "f-last", key: "lastName", label: "Last name", type: "text", required: true, placeholder: "Doe" },
        { id: "f-email", key: "email", label: "Email", type: "email", required: true, readOnly: true },
        { id: "f-linkedin", key: "linkedinUrl", label: "LinkedIn", type: "social", required: false, placeholder: "linkedin.com/in/yourname" },
        { id: "f-x", key: "twitterUrl", label: "X", type: "social", required: false, placeholder: "@yourhandle" },
        { id: "f-substack", key: "substackUrl", label: "Substack", type: "social", required: false, placeholder: "@yourpublication" },
        { id: "f-tiktok", key: "tiktokUrl", label: "TikTok", type: "social", required: false, placeholder: "@yourhandle" },
      ],
    },
    {
      id: "step-path",
      key: "path",
      componentKey: "path",
      enabled: true,
      eyebrow: "Personalized setup",
      title: "Welcome to Vekta",
      subtitle:
        "Tell us how you work so your intelligence feed, network, and recommendations start relevant.",
      progressLabel: "Your path",
      fields: [
        { id: "f-usertype", key: "userType", label: "Which best describes you?", type: "select", required: true, options: PATH_OPTIONS },
        { id: "f-title", key: "title", label: "What is your title?", type: "text", required: true, placeholder: "e.g. CEO & Founder" },
      ],
    },
    {
      id: "step-company",
      key: "company",
      componentKey: "company",
      enabled: true,
      title: "Your Company",
      subtitle: "We’ll use these to build your company profile.",
      progressLabel: "Company",
      fields: [
        { id: "f-companyname", key: "companyName", label: "Company Name", type: "text", required: true, placeholder: "Search or type company name…" },
        { id: "f-website", key: "websiteUrl", label: "Website", type: "url", required: false, placeholder: "https://yourcompany.com" },
        { id: "f-stage", key: "stage", label: "Stage", type: "select", required: true, options: STAGE_OPTIONS },
        { id: "f-sector", key: "sectors", label: "Sector", type: "select", required: true, options: SECTOR_OPTIONS, helpText: "Search by keywords like payments, LLM, logistics, healthcare, or creator." },
      ],
    },
    {
      id: "step-connections",
      key: "connections",
      componentKey: "connections",
      enabled: true,
      eyebrow: "Connections",
      title: "Bring your network into focus",
      subtitle:
        "Connect the tools you already use so Vekta can uncover stronger relationships, conversations, and opportunities.",
      progressLabel: "Connections",
      fields: [
        { id: "f-integrations", key: "connectedIntegrations", label: "Connected integrations", type: "multiselect", required: false, options: ["Gmail", "Google Calendar", "Google Sheets"] },
      ],
    },
    {
      id: "step-materials",
      key: "materials",
      componentKey: "materials",
      enabled: true,
      eyebrow: "Investor materials",
      title: "Add the numbers investors ask for",
      subtitle:
        "Upload your latest material and add a few headline metrics. Everything on this step is optional.",
      progressLabel: "Materials",
      fields: [
        { id: "f-revenueband", key: "revenueBand", label: "Revenue band", type: "select", required: false, options: REVENUE_BAND_OPTIONS },
        { id: "f-recurring", key: "recurringRevenue", label: "Recurring revenue", type: "text", required: false, placeholder: "e.g. $25K" },
        { id: "f-burn", key: "burnRate", label: "Burn rate", type: "text", required: false, placeholder: "e.g. $40K/mo" },
        { id: "f-cac", key: "cac", label: "CAC", type: "text", required: false },
        { id: "f-ltv", key: "ltv", label: "LTV", type: "text", required: false },
        { id: "f-headcount", key: "headcount", label: "Headcount", type: "number", required: false },
        { id: "f-cofounders", key: "cofounderCount", label: "Co-founders", type: "select", required: false, options: COFOUNDER_OPTIONS },
        { id: "f-superpowers", key: "superpowers", label: "Team strengths", type: "multiselect", required: false, options: SUPERPOWER_OPTIONS },
        { id: "f-raising", key: "currentlyRaising", label: "Currently raising", type: "boolean", required: false },
        { id: "f-targetraise", key: "targetRaise", label: "Target raise", type: "select", required: false, options: TARGET_RAISE_OPTIONS },
        { id: "f-roundtype", key: "roundType", label: "Round type", type: "select", required: false, options: ROUND_TYPE_OPTIONS },
        { id: "f-closedate", key: "targetCloseDate", label: "Target close date", type: "date", required: false },
      ],
    },
  ],
};

/** Ordered, enabled steps only — the sequence a real user walks through. */
export function activeSteps(def: OnboardingWorkflowDef): StepDef[] {
  return def.steps.filter((s) => s.enabled);
}

/**
 * Merge a stored (possibly partial / older) definition onto the code defaults so
 * new fields always have a value and a broken payload can never crash the wizard.
 */
export function normalizeWorkflow(input: unknown): OnboardingWorkflowDef {
  const base = DEFAULT_FOUNDER_WORKFLOW;
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<OnboardingWorkflowDef>;

  const steps = Array.isArray(raw.steps) && raw.steps.length > 0
    ? raw.steps
        .filter((s): s is StepDef => Boolean(s) && typeof s === "object")
        .map((s, i) => normalizeStep(s, i))
    : base.steps;

  return {
    id: raw.id || base.id,
    name: raw.name || base.name,
    version: typeof raw.version === "number" ? raw.version : base.version,
    leftRail: {
      eyebrow: raw.leftRail?.eyebrow ?? base.leftRail.eyebrow,
      heading: raw.leftRail?.heading ?? base.leftRail.heading,
      subheading: raw.leftRail?.subheading ?? base.leftRail.subheading,
      valueProps:
        Array.isArray(raw.leftRail?.valueProps) && raw.leftRail!.valueProps.length > 0
          ? raw.leftRail!.valueProps.map((v) => ({
              title: String(v?.title ?? ""),
              copy: String(v?.copy ?? ""),
            }))
          : base.leftRail.valueProps,
    },
    steps,
  };
}

function normalizeStep(s: Partial<StepDef>, index: number): StepDef {
  const validComponent: StepComponentKey[] = [
    "personal-details", "path", "company", "connections", "materials", "form",
  ];
  const componentKey = validComponent.includes(s.componentKey as StepComponentKey)
    ? (s.componentKey as StepComponentKey)
    : "form";
  return {
    id: s.id || `step-${index}-${Math.random().toString(36).slice(2, 8)}`,
    key: s.key || s.id || `step-${index}`,
    componentKey,
    enabled: s.enabled !== false,
    eyebrow: s.eyebrow ?? undefined,
    title: s.title ?? "Untitled step",
    subtitle: s.subtitle ?? undefined,
    progressLabel: s.progressLabel || s.title || `Step ${index + 1}`,
    fields: Array.isArray(s.fields)
      ? s.fields
          .filter((f): f is FieldDef => Boolean(f) && typeof f === "object")
          .map((f, i) => normalizeField(f, i))
      : [],
  };
}

const VALID_FIELD_TYPES: FieldType[] = [
  "text", "textarea", "email", "url", "number", "select", "multiselect", "boolean", "date", "social",
];

function normalizeField(f: Partial<FieldDef>, index: number): FieldDef {
  const type = VALID_FIELD_TYPES.includes(f.type as FieldType) ? (f.type as FieldType) : "text";
  return {
    id: f.id || `field-${index}-${Math.random().toString(36).slice(2, 8)}`,
    key: f.key || f.id || `field_${index}`,
    label: f.label ?? "Untitled field",
    type,
    required: Boolean(f.required),
    placeholder: f.placeholder ?? undefined,
    helpText: f.helpText ?? undefined,
    options: Array.isArray(f.options) ? f.options.map(String) : undefined,
    readOnly: Boolean(f.readOnly),
  };
}

/** Fresh ids for newly created steps / fields in the builder. */
export function newFieldId(): string {
  return `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
export function newStepId(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
