import { Controller, Get, Param, Query } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { ListOrganizationsDto } from "./dto/list-organizations.dto";
import type { OrganizationDto, PaginatedResponse } from "@founder-intel/types";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  /** GET /organizations */
  @Get()
  findAll(@Query() dto: ListOrganizationsDto): Promise<PaginatedResponse<OrganizationDto>> {
    return this.orgsService.findAll(dto);
  }

  /** GET /organizations/:id */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<OrganizationDto> {
    return this.orgsService.findOne(id);
  }
}
