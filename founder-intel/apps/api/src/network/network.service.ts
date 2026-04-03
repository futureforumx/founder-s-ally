import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import type {
  OperatorProfileDto,
  OrgProfileDto,
  BatchClusterDto,
  ExpertiseClusterDto,
  PaginatedResponse,
} from "@founder-intel/types";
import type { ListFoundersDto } from "./dto/network-queries.dto";

// ─── Raw row shapes from DB views ────────────────────────────────────────────

interface PersonSignalRow {
  person_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  expertise: string[] | null;
  yc_id: string | null;
  yc_batch: string | null;
  is_yc_backed: boolean | null;
  primary_org_name: string | null;
  primary_org_id: string | null;
  primary_org_stage: string | null;
  primary_org_logo: string | null;
  primary_org_industry: string | null;
  primary_domain: string | null;
  all_titles: string[] | null;
  org_count: bigint | number;
  role_count: bigint | number;
  founder_org_count: bigint | number;
  is_repeat_founder: boolean;
  is_first_time_founder: boolean;
  is_cross_company_operator: boolean;
  is_co_founder: boolean;
  is_solo_founder: boolean;
  is_currently_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface OrgProfileRow {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  description: string | null;
  logo_url: string | null;
  industry: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  founded_year: number | null;
  employee_count: number | null;
  status: string | null;
  stage_proxy: string | null;
  tags: string[] | null;
  is_yc_backed: boolean;
  yc_batch: string | null;
  yc_id: string | null;
  founder_count: bigint | number;
  founder_names: string[] | null;
  founder_ids: string[] | null;
  founder_avatars: string[] | null;
  founder_titles: string[] | null;
  founder_expertise: string[] | null;
  is_founder_unknown: boolean;
  is_solo_founded: boolean;
  is_duo_founded: boolean;
  is_multi_founder: boolean;
  is_large_team: boolean;
  has_repeat_founder: boolean;
  repeat_founder_count: bigint | number;
  created_at: Date;
  updated_at: Date;
}

interface BatchClusterRow {
  yc_batch: string;
  company_count: bigint | number;
  founder_count: bigint | number;
  industries: string[] | null;
  top_expertise_tags: string[] | null;
}

interface ExpertiseClusterRow {
  tag: string;
  founder_count: bigint | number;
  repeat_founders: bigint | number;
  yc_founders: bigint | number;
  sample_founders: string[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

function arr(v: string[] | null | undefined): string[] {
  return v ?? [];
}

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private mapPersonRow(row: PersonSignalRow): OperatorProfileDto {
    return {
      personId: row.person_id,
      name: row.name,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      linkedinUrl: row.linkedin_url,
      twitterUrl: row.twitter_url,
      githubUrl: row.github_url,
      expertise: arr(row.expertise),
      ycId: row.yc_id,
      ycBatch: row.yc_batch,
      isYcBacked: row.is_yc_backed ?? false,
      primaryOrgName: row.primary_org_name,
      primaryOrgId: row.primary_org_id,
      primaryOrgStage: row.primary_org_stage,
      primaryOrgLogo: row.primary_org_logo,
      primaryOrgIndustry: row.primary_org_industry,
      primaryDomain: row.primary_domain,
      allTitles: arr(row.all_titles),
      signals: {
        isRepeatFounder: row.is_repeat_founder,
        isFirstTimeFounder: row.is_first_time_founder,
        isCrossCompanyOperator: row.is_cross_company_operator,
        isCoFounder: row.is_co_founder,
        isSoloFounder: row.is_solo_founder,
        isCurrentlyActive: row.is_currently_active,
        orgCount: num(row.org_count),
        roleCount: num(row.role_count),
        founderOrgCount: num(row.founder_org_count),
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapOrgRow(row: OrgProfileRow): OrgProfileDto {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      website: row.website,
      linkedinUrl: row.linkedin_url,
      description: row.description,
      logoUrl: row.logo_url,
      industry: row.industry,
      location: row.location,
      city: row.city,
      state: row.state,
      country: row.country,
      foundedYear: row.founded_year,
      employeeCount: row.employee_count,
      status: row.status,
      stageProxy: row.stage_proxy,
      tags: arr(row.tags),
      isYcBacked: row.is_yc_backed,
      ycBatch: row.yc_batch,
      ycId: row.yc_id,
      founderCount: num(row.founder_count),
      founderNames: arr(row.founder_names),
      founderIds: arr(row.founder_ids),
      founderAvatars: arr(row.founder_avatars),
      founderTitles: arr(row.founder_titles),
      founderExpertise: arr(row.founder_expertise),
      signals: {
        isFounderUnknown: row.is_founder_unknown,
        isSoloFounded: row.is_solo_founded,
        isDuoFounded: row.is_duo_founded,
        isMultiFounder: row.is_multi_founder,
        isLargeTeam: row.is_large_team,
        hasRepeatFounder: row.has_repeat_founder,
        repeatFounderCount: num(row.repeat_founder_count),
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // ── Founder list with signal filters ──────────────────────────────────────

  async listFounders(dto: ListFoundersDto): Promise<PaginatedResponse<OperatorProfileDto>> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pidx = 1;

    if (dto.expertise) {
      conditions.push(`$${pidx}::text = ANY(expertise)`);
      params.push(dto.expertise);
      pidx++;
    }
    if (dto.ycBatch) {
      conditions.push(`yc_batch ILIKE $${pidx}`);
      params.push(`%${dto.ycBatch}%`);
      pidx++;
    }
    if (dto.ycOnly) {
      conditions.push(`is_yc_backed = true`);
    }
    if (dto.repeatFounder) {
      conditions.push(`is_repeat_founder = true`);
    }
    if (dto.soloFounder) {
      conditions.push(`is_solo_founder = true`);
    }
    if (dto.coFounder) {
      conditions.push(`is_co_founder = true`);
    }
    if (dto.crossCompany) {
      conditions.push(`is_cross_company_operator = true`);
    }
    if (dto.domain) {
      conditions.push(`primary_domain ILIKE $${pidx}`);
      params.push(`%${dto.domain}%`);
      pidx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS total FROM v_person_signals ${where}`;
    const dataSql = `
      SELECT * FROM v_person_signals
      ${where}
      ORDER BY is_repeat_founder DESC, founder_org_count DESC, updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [countRows, dataRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<[{ total: bigint }]>(countSql, ...params),
      this.prisma.$queryRawUnsafe<PersonSignalRow[]>(dataSql, ...params),
    ]);

    const total = num(countRows[0]?.total ?? 0n);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataRows.map((r) => this.mapPersonRow(r)),
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }

  // ── Single operator profile ────────────────────────────────────────────────

  async getOperatorProfile(personId: string): Promise<OperatorProfileDto> {
    const rows = await this.prisma.$queryRawUnsafe<PersonSignalRow[]>(
      `SELECT * FROM v_person_signals WHERE person_id = $1 LIMIT 1`,
      personId,
    );
    if (!rows.length) throw new NotFoundException(`Person ${personId} not found`);
    return this.mapPersonRow(rows[0]);
  }

  // ── Repeat founders ───────────────────────────────────────────────────────

  async listRepeatFounders(limit = 50): Promise<OperatorProfileDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<PersonSignalRow[]>(
      `SELECT * FROM v_person_signals
       WHERE is_repeat_founder = true
       ORDER BY founder_org_count DESC, org_count DESC
       LIMIT $1`,
      Math.min(limit, 200),
    );
    return rows.map((r) => this.mapPersonRow(r));
  }

  // ── Cross-company operators ───────────────────────────────────────────────

  async listCrossCompanyOperators(limit = 50): Promise<OperatorProfileDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<PersonSignalRow[]>(
      `SELECT * FROM v_person_signals
       WHERE is_cross_company_operator = true
       ORDER BY org_count DESC, founder_org_count DESC
       LIMIT $1`,
      Math.min(limit, 200),
    );
    return rows.map((r) => this.mapPersonRow(r));
  }

  // ── YC batch cluster ──────────────────────────────────────────────────────

  async getBatchCluster(batch: string): Promise<BatchClusterDto> {
    const rows = await this.prisma.$queryRawUnsafe<BatchClusterRow[]>(
      `SELECT * FROM v_batch_clusters WHERE yc_batch ILIKE $1 LIMIT 1`,
      batch,
    );
    if (!rows.length) throw new NotFoundException(`Batch ${batch} not found`);
    const r = rows[0];
    return {
      ycBatch: r.yc_batch,
      companyCount: num(r.company_count),
      founderCount: num(r.founder_count),
      industries: arr(r.industries),
      topExpertiseTags: arr(r.top_expertise_tags),
    };
  }

  /** List all batches, most recent first. */
  async listBatchClusters(): Promise<BatchClusterDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<BatchClusterRow[]>(
      `SELECT * FROM v_batch_clusters ORDER BY yc_batch DESC`,
    );
    return rows.map((r) => ({
      ycBatch: r.yc_batch,
      companyCount: num(r.company_count),
      founderCount: num(r.founder_count),
      industries: arr(r.industries),
      topExpertiseTags: arr(r.top_expertise_tags),
    }));
  }

  // ── Expertise cluster ─────────────────────────────────────────────────────

  async getExpertiseCluster(tag: string): Promise<ExpertiseClusterDto> {
    const rows = await this.prisma.$queryRawUnsafe<ExpertiseClusterRow[]>(
      `SELECT * FROM v_expertise_clusters WHERE tag = $1 LIMIT 1`,
      tag,
    );
    if (!rows.length) throw new NotFoundException(`Expertise tag "${tag}" not found`);
    const r = rows[0];
    return {
      tag: r.tag,
      founderCount: num(r.founder_count),
      repeatFounders: num(r.repeat_founders),
      ycFounders: num(r.yc_founders),
      sampleFounders: arr(r.sample_founders),
    };
  }

  /** List all expertise clusters ordered by founder count. */
  async listExpertiseClusters(): Promise<ExpertiseClusterDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<ExpertiseClusterRow[]>(
      `SELECT * FROM v_expertise_clusters ORDER BY founder_count DESC`,
    );
    return rows.map((r) => ({
      tag: r.tag,
      founderCount: num(r.founder_count),
      repeatFounders: num(r.repeat_founders),
      ycFounders: num(r.yc_founders),
      sampleFounders: arr(r.sample_founders),
    }));
  }

  // ── Org profile ───────────────────────────────────────────────────────────

  async getOrgProfile(orgId: string): Promise<OrgProfileDto> {
    const rows = await this.prisma.$queryRawUnsafe<OrgProfileRow[]>(
      `SELECT * FROM v_org_profile WHERE id = $1 LIMIT 1`,
      orgId,
    );
    if (!rows.length) throw new NotFoundException(`Organization ${orgId} not found`);
    return this.mapOrgRow(rows[0]);
  }

  // ── Founders connected to an org ──────────────────────────────────────────

  async getOrgFounders(orgId: string): Promise<OperatorProfileDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<PersonSignalRow[]>(
      `SELECT ps.* FROM v_person_signals ps
       JOIN roles r ON r."personId" = ps.person_id
       WHERE r."organizationId" = $1`,
      orgId,
    );
    return rows.map((r) => this.mapPersonRow(r));
  }
}
