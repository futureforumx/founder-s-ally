import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import { createRedisConnection } from "@founder-intel/jobs";
import type { HealthDto } from "@founder-intel/types";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthDto> {
    const [dbCheck, redisCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allOk = dbCheck.status === "ok" && redisCheck.status === "ok";

    return {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck,
        redis: redisCheck,
        workers: { status: "ok", activeJobs: 0, waitingJobs: 0 },
      },
    };
  }

  private async checkDatabase(): Promise<{ status: "ok" | "error"; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error("Database health check failed:", err);
      return { status: "error" };
    }
  }

  private async checkRedis(): Promise<{ status: "ok" | "error"; latencyMs?: number }> {
    const start = Date.now();
    try {
      const redis = createRedisConnection();
      await redis.connect();
      await redis.ping();
      await redis.quit();
      return { status: "ok", latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error("Redis health check failed:", err);
      return { status: "error" };
    }
  }
}
