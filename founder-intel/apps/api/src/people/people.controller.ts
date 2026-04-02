import { Controller, Get, Param, Query } from "@nestjs/common";
import { PeopleService } from "./people.service";
import { ListPeopleDto } from "./dto/list-people.dto";
import type { PersonDto, PaginatedResponse } from "@founder-intel/types";

@Controller("people")
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  /** GET /people */
  @Get()
  findAll(@Query() dto: ListPeopleDto): Promise<PaginatedResponse<PersonDto>> {
    return this.peopleService.findAll(dto);
  }

  /** GET /people/:id */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<PersonDto> {
    return this.peopleService.findOne(id);
  }
}
