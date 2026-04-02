import { Injectable } from "@nestjs/common";
import { OrganizationsService } from "../organizations/organizations.service";
import { PeopleService } from "../people/people.service";
import type { SearchResultDto } from "@founder-intel/types";

@Injectable()
export class SearchService {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly peopleService: PeopleService
  ) {}

  async search(q: string, limit = 20): Promise<SearchResultDto[]> {
    if (!q || q.trim().length < 2) return [];

    const perType = Math.ceil(limit / 2);
    const [orgs, people] = await Promise.all([
      this.orgsService.searchByQuery(q, perType),
      this.peopleService.searchByQuery(q, perType),
    ]);

    const results: SearchResultDto[] = [
      ...orgs.map(
        (o): SearchResultDto => ({
          type: "organization",
          id: o.id,
          name: o.canonicalName,
          subtitle: [o.ycBatch, o.industry, o.location].filter(Boolean).join(" · ") || undefined,
          domain: o.domain ?? undefined,
          isYcBacked: o.isYcBacked,
        })
      ),
      ...people.map(
        (p): SearchResultDto => ({
          type: "person",
          id: p.id,
          name: p.canonicalName,
          subtitle:
            p.roles?.[0]
              ? `${p.roles[0].title ?? p.roles[0].roleType} @ ${p.roles[0].organization.canonicalName}`
              : p.location ?? undefined,
        })
      ),
    ];

    return results.slice(0, limit);
  }
}
