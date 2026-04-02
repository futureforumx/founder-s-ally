// ─── Normalized canonical types flowing through the pipeline ─────────────────

export type RoleType =
  | "founder"
  | "cofounder"
  | "ceo"
  | "cto"
  | "coo"
  | "employee"
  | "advisor"
  | "investor"
  | "board"
  | "other";

export type FunctionType =
  | "engineering"
  | "product"
  | "design"
  | "sales"
  | "marketing"
  | "operations"
  | "finance"
  | "legal"
  | "data"
  | "general_management"
  | "other";

export type CompanyStatus =
  | "active"
  | "acquired"
  | "ipo"
  | "defunct"
  | "stealth"
  | "unknown";

export type StageProxy =
  | "idea"
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b_plus"
  | "growth"
  | "public"
  | "unknown";

export interface NormalizedOrganization {
  /** Deduplication key — prefer domain, fall back to name slug */
  dedupeKey: string;
  canonicalName: string;
  domain?: string;
  website?: string;
  linkedinUrl?: string;
  description?: string;
  logoUrl?: string;
  industry?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  foundedYear?: number;
  employeeCount?: number;
  status?: CompanyStatus;
  stageProxy?: StageProxy;
  tags?: string[];

  // YC-specific
  isYcBacked?: boolean;
  ycBatch?: string;
  ycId?: string;
  ycRawJson?: Record<string, unknown>;
}

export interface NormalizedPerson {
  /** Deduplication key — prefer linkedinUrl, fall back to name slug */
  dedupeKey: string;
  canonicalName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  city?: string;
  country?: string;
  expertise?: string[];

  // YC-specific
  ycId?: string;
}

export interface NormalizedRole {
  personDedupeKey: string;
  orgDedupeKey: string;
  title?: string;
  roleType?: RoleType;
  functionType?: FunctionType;
  isCurrent?: boolean;
  startDate?: Date;
  endDate?: Date;
}
