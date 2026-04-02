import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import type { OrganizationDto, PaginatedResponse } from "@founder-intel/types";
import type { ListOrganizationsDto } from "./dto/list-organizations.dto";

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: ListOrganizationsDto): Promise<PaginatedResponse<OrganizationDto>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (dto.ycOnly) where["isYcBacked"] = true;
    if (dto.ycBatch) where["ycBatch"] = { contains: dto.ycBatch, mode: "insensitive" };
    if (dto.industry) where["industry"] = { contains: dto.industry, mode: "insensitive" };
    if (dto.status) where["status"] = dto.status;
    if (dto.country) where["country"] = { contains: dto.country, mode: "insensitive" };

    const orderBy = { [dto.sortBy ?? "createdAt"]: dto.sortOrder ?? "desc" };

    const [orgs, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: { select: { sourceRecords: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: orgs.map((o) => this.mapToDto(o)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<OrganizationDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { sourceRecords: true } },
        roles: {
          include: { person: { select: { id: true, canonicalName: true, linkedinUrl: true } } },
          take: 20,
        },
      },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return this.mapToDto(org);
  }

  // ── Also used by SearchService ────────────────────────────────────────────

  async searchByQuery(q: string, limit = 10): Promise<OrganizationDto[]> {
    const orgs = await this.prisma.organization.findMany({
      where: {
        OR: [
          { canonicalName: { contains: q, mode: "insensitive" } },
          { domain: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      include: { _count: { select: { sourceRecords: true } } },
      orderBy: { isYcBacked: "desc" },
    });
    return orgs.map((o) => this.mapToDto(o));
  }

  private mapToDto(org: {
    id: string;
    canonicalName: string;
    domain: string | null;
    website: string | null;
    linkedinUrl: string | null;
    description: string | null;
    logoUrl: string | null;
    industry: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    foundedYear: number | null;
    employeeCount: number | null;
    status: string | null;
    stageProxy: string | null;
    tags: string[];
    isYcBacked: boolean;
    ycBatch: string | null;
    ycId: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { sourceRecords: number };
  }): OrganizationDto {
    return {
      id: org.id,
      canonicalName: org.canonicalName,
      domain: org.domain,
      website: org.website,
      linkedinUrl: org.linkedinUrl,
      description: org.description,
      logoUrl: org.logoUrl,
      industry: org.industry,
      location: org.location,
      city: org.city,
      state: org.state,
      country: org.country,
      foundedYear: org.foundedYear,
      employeeCount: org.employeeCount,
      status: org.status,
      stageProxy: org.stageProxy,
      tags: org.tags,
      isYcBacked: org.isYcBacked,
      ycBatch: org.ycBatch,
      ycId: org.ycId,
      sourceCount: org._count?.sourceRecords ?? 0,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }
}
