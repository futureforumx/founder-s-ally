import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { IngestionService } from "./ingestion.service";
import { RunIngestionDto } from "./dto/run-ingestion.dto";
import type { IngestionJobDto, PaginatedResponse } from "@founder-intel/types";

@Controller("ingestion")
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * POST /ingestion/run
   * Trigger an ingestion run for a source adapter.
   */
  @Post("run")
  @HttpCode(HttpStatus.ACCEPTED)
  async run(@Body() dto: RunIngestionDto): Promise<IngestionJobDto> {
    return this.ingestionService.triggerRun(dto, "api");
  }

  /**
   * GET /ingestion/jobs
   * List ingestion jobs with pagination.
   */
  @Get("jobs")
  async listJobs(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("source") source?: string
  ): Promise<PaginatedResponse<IngestionJobDto>> {
    const { data, total } = await this.ingestionService.listJobs(page, limit, source);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
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

  /**
   * GET /ingestion/jobs/:id
   * Get a single ingestion job by ID.
   */
  @Get("jobs/:id")
  async getJob(@Param("id") id: string): Promise<IngestionJobDto> {
    return this.ingestionService.getJob(id);
  }
}
