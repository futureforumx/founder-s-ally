import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from "@nestjs/common";
import { SearchService } from "./search.service";
import type { SearchResultDto } from "@founder-intel/types";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /search?q=stripe&limit=20 */
  @Get()
  search(
    @Query("q") q: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ): Promise<SearchResultDto[]> {
    return this.searchService.search(q, limit);
  }
}
