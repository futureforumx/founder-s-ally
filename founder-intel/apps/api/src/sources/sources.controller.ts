import { Controller, Get } from "@nestjs/common";
import { SourcesService } from "./sources.service";
import type { SourceDto } from "@founder-intel/types";

@Controller("sources")
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  /** GET /sources — list all registered adapters with their status */
  @Get()
  list(): SourceDto[] {
    return this.sourcesService.list();
  }
}
