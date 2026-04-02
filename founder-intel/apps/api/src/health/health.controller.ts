import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { HealthService } from "./health.service";
import type { HealthDto } from "@founder-intel/types";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** GET /health */
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): Promise<HealthDto> {
    return this.healthService.check();
  }
}
