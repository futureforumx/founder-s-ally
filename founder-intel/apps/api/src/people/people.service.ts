import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import type { PersonDto, PaginatedResponse, RoleSummaryDto } from "@founder-intel/types";
import type { ListPeopleDto } from "./dto/list-people.dto";

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: ListPeopleDto): Promise<PaginatedResponse<PersonDto>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (dto.country) where["country"] = { contains: dto.country, mode: "insensitive" };
    if (dto.expertise) where["expertise"] = { has: dto.expertise };
    if (dto.orgId) {
      where["roles"] = { some: { organizationId: dto.orgId } };
    }

    const orderBy = { [dto.sortBy ?? "createdAt"]: dto.sortOrder ?? "desc" };

    const [people, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: { select: { sourceRecords: true } },
          roles: {
            where: { isCurrent: true },
            include: {
              organization: {
                select: { id: true, canonicalName: true, domain: true, isYcBacked: true },
              },
            },
            take: 5,
          },
        },
      }),
      this.prisma.person.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: people.map((p) => this.mapToDto(p)),
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

  async findOne(id: string): Promise<PersonDto> {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        _count: { select: { sourceRecords: true } },
        roles: {
          include: {
            organization: {
              select: { id: true, canonicalName: true, domain: true, isYcBacked: true },
            },
          },
        },
      },
    });
    if (!person) throw new NotFoundException(`Person ${id} not found`);
    return this.mapToDto(person);
  }

  async searchByQuery(q: string, limit = 10): Promise<PersonDto[]> {
    const people = await this.prisma.person.findMany({
      where: {
        OR: [
          { canonicalName: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      include: {
        _count: { select: { sourceRecords: true } },
        roles: {
          where: { isCurrent: true },
          include: {
            organization: {
              select: { id: true, canonicalName: true, domain: true, isYcBacked: true },
            },
          },
          take: 3,
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return people.map((p) => this.mapToDto(p));
  }

  private mapToDto(person: {
    id: string;
    canonicalName: string;
    firstName: string | null;
    lastName: string | null;
    linkedinUrl: string | null;
    twitterUrl: string | null;
    avatarUrl: string | null;
    bio: string | null;
    location: string | null;
    city: string | null;
    country: string | null;
    expertise: string[];
    createdAt: Date;
    updatedAt: Date;
    _count?: { sourceRecords: number };
    roles?: Array<{
      id: string;
      title: string | null;
      roleType: string | null;
      functionType: string | null;
      isCurrent: boolean;
      organization: { id: string; canonicalName: string; domain: string | null; isYcBacked: boolean };
    }>;
  }): PersonDto {
    return {
      id: person.id,
      canonicalName: person.canonicalName,
      firstName: person.firstName,
      lastName: person.lastName,
      linkedinUrl: person.linkedinUrl,
      twitterUrl: person.twitterUrl,
      avatarUrl: person.avatarUrl,
      bio: person.bio,
      location: person.location,
      city: person.city,
      country: person.country,
      expertise: person.expertise,
      roles: (person.roles ?? []).map((r): RoleSummaryDto => ({
        id: r.id,
        title: r.title,
        roleType: r.roleType,
        functionType: r.functionType,
        isCurrent: r.isCurrent,
        organization: r.organization,
      })),
      sourceCount: person._count?.sourceRecords ?? 0,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    };
  }
}
