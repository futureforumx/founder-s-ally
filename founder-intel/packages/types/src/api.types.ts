// ─── API response shapes ──────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface OrganizationDto {
  id: string;
  canonicalName: string;
  domain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  foundedYear?: number | null;
  employeeCount?: number | null;
  status?: string | null;
  stageProxy?: string | null;
  tags: string[];
  isYcBacked: boolean;
  ycBatch?: string | null;
  ycId?: string | null;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonDto {
  id: string;
  canonicalName: string;
  firstName?: string | null;
  lastName?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  expertise: string[];
  roles: RoleSummaryDto[];
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleSummaryDto {
  id: string;
  title?: string | null;
  roleType?: string | null;
  functionType?: string | null;
  isCurrent: boolean;
  organization: {
    id: string;
    canonicalName: string;
    domain?: string | null;
    isYcBacked: boolean;
  };
}

export interface IngestionJobDto {
  id: string;
  sourceAdapter: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  stats?: Record<string, unknown> | null;
  triggeredBy?: string | null;
  createdAt: string;
}

export interface SourceDto {
  name: string;
  version: string;
  enabled: boolean;
  complianceNote: string;
  status: "implemented" | "scaffolded";
}

export interface SearchResultDto {
  type: "organization" | "person";
  id: string;
  name: string;
  subtitle?: string;
  domain?: string;
  isYcBacked?: boolean;
  score?: number;
}

export interface HealthDto {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number };
    redis: { status: "ok" | "error"; latencyMs?: number };
    workers: { status: "ok" | "error"; activeJobs?: number; waitingJobs?: number };
  };
}

// ─── Operator Network DTOs ──────────────────────────────────────────────────

/** Derived boolean signals for a founder/operator. */
export interface PersonSignalsDto {
  isRepeatFounder: boolean;
  isFirstTimeFounder: boolean;
  isCrossCompanyOperator: boolean;
  isCoFounder: boolean;
  isSoloFounder: boolean;
  isCurrentlyActive: boolean;
  orgCount: number;
  roleCount: number;
  founderOrgCount: number;
}

/** Full operator profile — people row + signals from v_person_signals. */
export interface OperatorProfileDto {
  personId: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  githubUrl?: string | null;
  expertise: string[];
  ycId?: string | null;
  ycBatch?: string | null;
  isYcBacked: boolean;
  primaryOrgName?: string | null;
  primaryOrgId?: string | null;
  primaryOrgStage?: string | null;
  primaryOrgLogo?: string | null;
  primaryOrgIndustry?: string | null;
  primaryDomain?: string | null;
  allTitles: string[];
  signals: PersonSignalsDto;
  createdAt: string;
  updatedAt: string;
}

/** Full org profile — organizations row + founders + signals from v_org_profile. */
export interface OrgProfileDto {
  id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  foundedYear?: number | null;
  employeeCount?: number | null;
  status?: string | null;
  stageProxy?: string | null;
  tags: string[];
  isYcBacked: boolean;
  ycBatch?: string | null;
  ycId?: string | null;
  founderCount: number;
  founderNames: string[];
  founderIds: string[];
  founderAvatars: string[];
  founderTitles: string[];
  founderExpertise: string[];
  signals: {
    isFounderUnknown: boolean;
    isSoloFounded: boolean;
    isDuoFounded: boolean;
    isMultiFounder: boolean;
    isLargeTeam: boolean;
    hasRepeatFounder: boolean;
    repeatFounderCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

/** Aggregated YC batch cluster. */
export interface BatchClusterDto {
  ycBatch: string;
  companyCount: number;
  founderCount: number;
  industries: string[];
  topExpertiseTags: string[];
}

/** Aggregated expertise tag cluster. */
export interface ExpertiseClusterDto {
  tag: string;
  founderCount: number;
  repeatFounders: number;
  ycFounders: number;
  sampleFounders: string[];
}
