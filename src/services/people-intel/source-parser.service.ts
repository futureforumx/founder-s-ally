/**
 * source-parser.service.ts
 * =========================
 * Normalizes raw source payloads into typed NormalizedPersonProfile /
 * NormalizedOrgProfile plus extracted RoleEntries and ActivitySignals.
 *
 * Each parser is defensive: missing fields are treated as undefined, not errors.
 * The raw_payload is always preserved in the source_profile snapshot for replay.
 */

import type { NormalizedPersonProfile, NormalizedOrgProfile, RoleEntry, ActivitySignal } from "./types.ts";

// ─── Person parsers ───────────────────────────────────────────────────────────

export function parseLinkedInPersonSnapshot(raw: Record<string, unknown>): {
  profile: NormalizedPersonProfile;
  roles: RoleEntry[];
  signals: ActivitySignal[];
} {
  const profile: NormalizedPersonProfile = {
    full_name:       str(raw.full_name) ?? str(raw.name),
    first_name:      str(raw.first_name),
    last_name:       str(raw.last_name),
    headline:        str(raw.headline) ?? str(raw.tagline),
    bio:             str(raw.summary) ?? str(raw.about),
    location:        str(raw.location) ?? str(raw.geo),
    photo_url:       str(raw.profile_pic_url) ?? str(raw.photo_url),
    email:           str(raw.email),
    linkedin_url:    str(raw.profile_url) ?? str(raw.linkedin_url),
    current_title:   str(raw.headline)?.split(" at ")[0]?.trim(),
    current_company: str(raw.headline)?.split(" at ")[1]?.trim(),
    skills:          strArr(raw.skills),
    topics:          strArr(raw.interests) ?? strArr(raw.topics),
  };

  const roles: RoleEntry[] = [];
  const positions = arr(raw.experiences) ?? arr(raw.positions) ?? [];
  for (const pos of positions) {
    if (!pos || typeof pos !== "object") continue;
    const p = pos as Record<string, unknown>;
    roles.push({
      title:        str(p.title) ?? "unknown",
      company_name: str(p.company) ?? str(p.company_name) ?? "unknown",
      start_date:   normalizeDate(str(p.starts_at) ?? str(p.start_date)),
      end_date:     normalizeDate(str(p.ends_at) ?? str(p.end_date)),
      is_current:   bool(p.is_current) ?? !p.ends_at,
      confidence:   0.85,
      source_provider: "linkedin",
    });
  }

  // No activity signals from LinkedIn directly (avoid API extraction)
  return { profile, roles, signals: [] };
}

export function parseWebsitePersonSnapshot(raw: Record<string, unknown>): {
  profile: NormalizedPersonProfile;
  roles: RoleEntry[];
  signals: ActivitySignal[];
} {
  const profile: NormalizedPersonProfile = {
    full_name:       str(raw.name) ?? str(raw.full_name),
    headline:        str(raw.title) ?? str(raw.headline),
    bio:             str(raw.bio) ?? str(raw.description) ?? str(raw.about),
    photo_url:       str(raw.image_url) ?? str(raw.photo_url),
    email:           str(raw.email),
    website_url:     str(raw.website_url),
    linkedin_url:    str(raw.linkedin_url),
    x_url:           str(raw.x_url) ?? str(raw.twitter_url),
    github_url:      str(raw.github_url),
    current_title:   str(raw.title),
    current_company: str(raw.company),
    topics:          strArr(raw.tags) ?? strArr(raw.topics),
  };

  return { profile, roles: [], signals: [] };
}

export function parseGenericPersonSnapshot(
  raw: Record<string, unknown>,
  provider: string,
): {
  profile: NormalizedPersonProfile;
  roles: RoleEntry[];
  signals: ActivitySignal[];
} {
  if (provider === "linkedin") return parseLinkedInPersonSnapshot(raw);
  return parseWebsitePersonSnapshot(raw);
}

// ─── Organization parsers ─────────────────────────────────────────────────────

export function parseOrgSnapshot(
  raw: Record<string, unknown>,
  provider: string,
): {
  profile: NormalizedOrgProfile;
  signals: ActivitySignal[];
} {
  const profile: NormalizedOrgProfile = {
    name:           str(raw.name) ?? str(raw.firm_name) ?? str(raw.company_name),
    website_url:    str(raw.website_url) ?? str(raw.website),
    linkedin_url:   str(raw.linkedin_url),
    description:    str(raw.description) ?? str(raw.about) ?? str(raw.summary),
    hq_city:        str(raw.hq_city) ?? str(raw.city),
    hq_state:       str(raw.hq_state) ?? str(raw.state),
    hq_country:     str(raw.hq_country) ?? str(raw.country),
    founded_year:   num(raw.founded_year) ?? num(raw.founded),
    headcount_band: str(raw.headcount_band) ?? str(raw.company_size),
    sectors:        strArr(raw.sectors) ?? strArr(raw.industries) ?? strArr(raw.sector_tags),
    stage_focus:    strArr(raw.stage_focus) ?? strArr(raw.stage_tags),
  };

  // Extract team members if present (website/team_page)
  const teamRaw = arr(raw.team_members) ?? arr(raw.team) ?? [];
  profile.team_members = teamRaw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map(m => ({
      name:        str(m.name) ?? "unknown",
      title:       str(m.title) ?? str(m.role),
      linkedin_url: str(m.linkedin_url),
    }));

  // Extract hiring signals
  const signals: ActivitySignal[] = [];
  const recentHires = arr(raw.recent_hires) ?? [];
  for (const h of recentHires) {
    if (!h || typeof h !== "object") continue;
    const hire = h as Record<string, unknown>;
    signals.push({
      signal_type:    "new_hire",
      signal_date:    hire.date ? new Date(str(hire.date) ?? "") : undefined,
      source_provider: provider,
      extracted_text:  `${str(hire.name)} joined as ${str(hire.title)}`,
      structured_payload: {
        name:  str(hire.name),
        title: str(hire.title),
      },
      confidence: 0.8,
    });
  }

  return { profile, signals };
}

// ─── Role normalization ───────────────────────────────────────────────────────

const FUNCTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(engineer|software|developer|technical|architect|sre|devops|infra)\b/i, "engineering"],
  [/\b(product|pm|program manager|roadmap)\b/i,                               "product"],
  [/\b(growth|marketing|demand|seo|content|brand|comms|pr|social)\b/i,        "gtm"],
  [/\b(sales|account|revenue|bdr|sdr|ae|closing)\b/i,                         "sales"],
  [/\b(finance|cfo|accounting|treasury|fp&a|controller)\b/i,                  "finance"],
  [/\b(ops|operations|coo|chief of staff|strategy)\b/i,                       "operations"],
  [/\b(legal|counsel|compliance|regulatory|privacy)\b/i,                      "legal"],
  [/\b(design|ux|ui|creative|visual|brand)\b/i,                               "design"],
  [/\b(data|analytics|bi|ml|ai|machine learning|ds)\b/i,                      "data"],
  [/\b(hr|people|talent|recruiting|culture)\b/i,                              "people_hr"],
  [/\b(customer success|cs|cx|support|onboard)\b/i,                           "customer_success"],
];

const SENIORITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(founder|co-founder|cofounder)\b/i,               "founder"],
  [/\b(ceo|cto|coo|cfo|cpo|cso|cmo|cro|chief)\b/i,     "c_suite"],
  [/\b(board member|board director|board advisor)\b/i,  "board"],
  [/\b(advisor|strategic advisor)\b/i,                  "advisor"],
  [/\b(partner|general partner|gp|managing partner)\b/i, "c_suite"],
  [/\b(vp|vice president|svp|evp)\b/i,                  "vp"],
  [/\b(director|head of|principal)\b/i,                 "director"],
  [/\b(manager|lead|senior manager)\b/i,                "manager"],
];

export function normalizeRoleFunction(title: string): string | undefined {
  for (const [pattern, func] of FUNCTION_PATTERNS) {
    if (pattern.test(title)) return func;
  }
  return undefined;
}

export function normalizeSeniority(title: string): string | undefined {
  for (const [pattern, level] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return level;
  }
  // Fall back to IC for contributor-sounding roles
  if (/\b(engineer|designer|analyst|associate|specialist|consultant)\b/i.test(title)) return "ic";
  return undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

function arr(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  const a = arr(v);
  if (!a) return undefined;
  const filtered = a.filter((x): x is string => typeof x === "string" && !!x.trim());
  return filtered.length ? filtered : undefined;
}

function normalizeDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}
